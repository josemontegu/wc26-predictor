import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import type {
  Bullet,
  BulletParticipation,
  BulletPick,
  BulletValidity,
  LockedBulletPick,
  Match,
} from '../lib/types'
import { CheckCircle2, Flame, XCircle, Zap } from 'lucide-react'
import { bulletOptions, isLocked } from '../lib/types'
import { useT } from '../lib/i18n'

/**
 * ⚡ Bullet — a prop bet on a specific match, Yes/No or multiple-choice.
 * Editable until the match locks; then everyone's calls are revealed. A bullet
 * only counts if every official player who predicted the match also answered it
 * before lock.
 */
export default function BulletCard({ match }: { match: Match }) {
  const { session } = useAuth()
  const t = useT()
  const [bullets, setBullets] = useState<Bullet[]>([])
  const [myChoice, setMyChoice] = useState<Record<string, string>>({})
  const [participation, setParticipation] = useState<BulletParticipation[]>([])
  const [validity, setValidity] = useState<Record<string, BulletValidity>>({})
  const [reveal, setReveal] = useState<LockedBulletPick[]>([])
  const [busy, setBusy] = useState<string | null>(null)

  const locked = isLocked(match)
  const myId = session?.user.id

  const load = useCallback(async () => {
    // Gracefully do nothing if the bullets tables aren't migrated yet.
    const { data: bs, error } = await supabase.from('bullets').select('*').eq('match_id', match.id)
    if (error) {
      setBullets([])
      return
    }
    const list = (bs as Bullet[]) ?? []
    setBullets(list)
    if (!list.length || !myId) return
    const ids = list.map((b) => b.id)
    const [mine, part, val, rev] = await Promise.all([
      supabase.from('bullet_picks').select('*').eq('user_id', myId).in('bullet_id', ids),
      supabase.from('bullet_participation').select('*').in('bullet_id', ids),
      supabase.from('bullet_validity').select('*').in('bullet_id', ids),
      supabase.from('locked_bullet_picks').select('*').in('bullet_id', ids),
    ])
    const mc: Record<string, string> = {}
    for (const p of (mine.data as BulletPick[]) ?? []) mc[p.bullet_id] = p.choice
    setMyChoice(mc)
    setParticipation((part.data as BulletParticipation[]) ?? [])
    const vm: Record<string, BulletValidity> = {}
    for (const v of (val.data as BulletValidity[]) ?? []) vm[v.bullet_id] = v
    setValidity(vm)
    setReveal((rev.data as LockedBulletPick[]) ?? [])
  }, [match.id, myId])

  useEffect(() => {
    load()
    const channel = supabase
      .channel(`bullets-${match.id}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'bullet_picks' }, () => load())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'bullets' }, () => load())
      .subscribe()
    return () => {
      supabase.removeChannel(channel)
    }
  }, [load, match.id])

  async function pick(bulletId: string, choice: string) {
    if (locked || !myId) return
    setBusy(bulletId)
    setMyChoice((m) => ({ ...m, [bulletId]: choice }))
    await supabase
      .from('bullet_picks')
      .upsert({ bullet_id: bulletId, user_id: myId, choice }, { onConflict: 'bullet_id,user_id' })
    setBusy(null)
    load()
  }

  if (!bullets.length) return null

  return (
    <>
      {bullets.map((b) => {
        const opts = bulletOptions(b)
        const isClassic = !b.options || b.options.length === 0
        const mine = myChoice[b.id]
        const answered = mine !== undefined
        const part = participation.filter((p) => p.bullet_id === b.id)
        const inCount = part.filter((p) => p.answered).length
        const missing = part.filter((p) => !p.answered)
        const v = validity[b.id]
        const everyoneIn = v?.everyone_in ?? false
        const picks = reveal.filter((r) => r.bullet_id === b.id)
        const resolved = b.answer !== null
        const iWon = resolved && everyoneIn && answered && mine === b.answer
        const winningLabel = () => {
          const o = opts.find((x) => x.key === b.answer)
          return o ? t(o.label_en, o.label_es) : ''
        }

        return (
          <div className="form-card bullet-card" key={b.id}>
            <div className="bullet-head">
              <span className="bullet-tag"><Zap className="ic" aria-hidden="true" /> {t('Bullet', 'Bullet')}</span>
              <span className="bullet-pts">+{b.points}</span>
            </div>
            <div className="bullet-q">
              <span className="bullet-emoji">{b.emoji}</span>
              <span>{t(b.question_en, b.question_es)}</span>
            </div>

            {!locked ? (
              <>
                <div className={`bullet-choices ${isClassic ? '' : 'bullet-choices-multi'}`}>
                  {opts.map((o) => (
                    <button
                      key={o.key}
                      type="button"
                      className={`bullet-choice ${
                        o.key === 'yes' ? 'bullet-yes' : o.key === 'no' ? 'bullet-no' : ''
                      } ${mine === o.key ? 'bullet-on' : ''}`}
                      disabled={busy === b.id}
                      onClick={() => pick(b.id, o.key)}
                    >
                      {t(o.label_en, o.label_es)}
                    </button>
                  ))}
                </div>
                <div className="bullet-tracker">
                  <div className="bullet-tracker-count">
                    {t(`${inCount}/${part.length} in`, `${inCount}/${part.length} dentro`)}
                    {!everyoneIn && missing.length > 0 && (
                      <span className="bullet-waiting">
                        {' · '}
                        {t('waiting on', 'faltan')}{' '}
                        {missing
                          .slice(0, 4)
                          .map((m) => m.nickname)
                          .join(', ')}
                        {missing.length > 4 ? '…' : ''}
                      </span>
                    )}
                  </div>
                  <p className="bullet-rule muted small">
                    {everyoneIn
                      ? t('🔥 Everyone who predicted is in — this one counts!', '🔥 Todos los que pronosticaron están dentro — ¡este cuenta!')
                      : t(
                          'Everyone who predicted this match must answer before kick-off, or it counts for no one.',
                          'Todos los que pronosticaron este partido deben responder antes del inicio, o no cuenta para nadie.',
                        )}
                  </p>
                </div>
              </>
            ) : (
              <div className="bullet-locked">
                {/* Void / live status */}
                {!everyoneIn ? (
                  <div className="bullet-status bullet-void">
                    <XCircle className="ic" aria-hidden="true" />{' '}
                    {t('Void — not everyone was in', 'Anulada — no estaban todos')}
                    {missing.length > 0 && (
                      <span className="muted">
                        {' '}
                        ({t('missing', 'faltó')} {missing.map((m) => m.nickname).join(', ')})
                      </span>
                    )}
                  </div>
                ) : !resolved ? (
                  <div className="bullet-status bullet-live">
                    <Flame className="ic" aria-hidden="true" />{' '}
                    {t('It’s on — all in. Awaiting the result…', 'Va en serio — todos dentro. Esperando el resultado…')}
                  </div>
                ) : (
                  <div className={`bullet-status ${iWon ? 'bullet-win' : 'bullet-done'}`}>
                    {isClassic ? (
                      b.answer === 'yes' ? (
                        <>
                          <CheckCircle2 className="ic" aria-hidden="true" />{' '}
                          {t('Yes — it happened', 'Sí — ocurrió')}
                        </>
                      ) : (
                        <>
                          <XCircle className="ic" aria-hidden="true" /> {t('No — it didn’t', 'No — no ocurrió')}
                        </>
                      )
                    ) : (
                      <>
                        <CheckCircle2 className="ic" aria-hidden="true" /> {winningLabel()}
                      </>
                    )}
                    {answered && (
                      <span className="bullet-my-result">
                        {' · '}
                        {iWon
                          ? t(`you called it +${b.points}`, `lo acertaste +${b.points}`)
                          : t('you missed it', 'no acertaste')}
                      </span>
                    )}
                  </div>
                )}

                {/* Reveal: who called what */}
                <div className="bullet-reveal">
                  {opts.map((o) => (
                    <BulletSide
                      key={o.key}
                      label={t(o.label_en, o.label_es)}
                      people={picks.filter((p) => p.choice === o.key)}
                      meId={myId}
                      win={resolved && everyoneIn && b.answer === o.key}
                    />
                  ))}
                </div>
              </div>
            )}
          </div>
        )
      })}
    </>
  )
}

function BulletSide({
  label,
  people,
  meId,
  win,
}: {
  label: string
  people: LockedBulletPick[]
  meId?: string
  win: boolean
}) {
  return (
    <div className={`bullet-side ${win ? 'bullet-side-win' : ''}`}>
      <div className="bullet-side-head">
        {label} <span className="bullet-side-n">{people.length}</span>
      </div>
      <div className="bullet-side-people">
        {people.map((p) => (
          <span
            key={p.user_id}
            className={`bullet-chip ${p.user_id === meId ? 'bullet-chip-me' : ''}`}
          >
            <span className="bullet-chip-emoji">{p.emoji || '🏳️'}</span>
            {p.nickname}
          </span>
        ))}
        {people.length === 0 && <span className="muted small">—</span>}
      </div>
    </div>
  )
}
