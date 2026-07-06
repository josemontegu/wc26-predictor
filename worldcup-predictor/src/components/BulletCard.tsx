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
import { isLocked } from '../lib/types'
import { useT } from '../lib/i18n'

/**
 * ⚡ Bullet — a yes/no prop bet on a specific match. Editable until the match
 * locks; then everyone's calls are revealed. A bullet only counts if every
 * official player who predicted the match also answered it before lock.
 */
export default function BulletCard({ match }: { match: Match }) {
  const { session } = useAuth()
  const t = useT()
  const [bullets, setBullets] = useState<Bullet[]>([])
  const [myChoice, setMyChoice] = useState<Record<string, boolean>>({})
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
    const mc: Record<string, boolean> = {}
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

  async function pick(bulletId: string, choice: boolean) {
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
        const mine = myChoice[b.id]
        const answered = mine !== undefined
        const part = participation.filter((p) => p.bullet_id === b.id)
        const inCount = part.filter((p) => p.answered).length
        const missing = part.filter((p) => !p.answered)
        const v = validity[b.id]
        const everyoneIn = v?.everyone_in ?? false
        const picks = reveal.filter((r) => r.bullet_id === b.id)
        const yes = picks.filter((p) => p.choice)
        const no = picks.filter((p) => !p.choice)
        const resolved = b.answer !== null
        const iWon = resolved && everyoneIn && answered && mine === b.answer

        return (
          <div className="form-card bullet-card" key={b.id}>
            <div className="bullet-head">
              <span className="bullet-tag">⚡ {t('Bullet', 'Bullet')}</span>
              <span className="bullet-pts">+{b.points}</span>
            </div>
            <div className="bullet-q">
              <span className="bullet-emoji">{b.emoji}</span>
              <span>{t(b.question_en, b.question_es)}</span>
            </div>

            {!locked ? (
              <>
                <div className="bullet-choices">
                  <button
                    type="button"
                    className={`bullet-choice bullet-yes ${mine === true ? 'bullet-on' : ''}`}
                    disabled={busy === b.id}
                    onClick={() => pick(b.id, true)}
                  >
                    {t('Yes', 'Sí')}
                  </button>
                  <button
                    type="button"
                    className={`bullet-choice bullet-no ${mine === false ? 'bullet-on' : ''}`}
                    disabled={busy === b.id}
                    onClick={() => pick(b.id, false)}
                  >
                    {t('No', 'No')}
                  </button>
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
                    {t('❌ Void — not everyone was in', '❌ Anulada — no estaban todos')}
                    {missing.length > 0 && (
                      <span className="muted">
                        {' '}
                        ({t('missing', 'faltó')} {missing.map((m) => m.nickname).join(', ')})
                      </span>
                    )}
                  </div>
                ) : !resolved ? (
                  <div className="bullet-status bullet-live">
                    {t('🔥 It’s on — all in. Awaiting the result…', '🔥 Va en serio — todos dentro. Esperando el resultado…')}
                  </div>
                ) : (
                  <div className={`bullet-status ${iWon ? 'bullet-win' : 'bullet-done'}`}>
                    {b.answer
                      ? t('✅ Yes — it happened', '✅ Sí — ocurrió')
                      : t('❌ No — it didn’t', '❌ No — no ocurrió')}
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

                {/* Reveal: who said what */}
                <div className="bullet-reveal">
                  <BulletSide
                    label={t('Yes', 'Sí')}
                    cls="bullet-side-yes"
                    people={yes}
                    meId={myId}
                    win={resolved && everyoneIn && b.answer === true}
                  />
                  <BulletSide
                    label={t('No', 'No')}
                    cls="bullet-side-no"
                    people={no}
                    meId={myId}
                    win={resolved && everyoneIn && b.answer === false}
                  />
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
  cls,
  people,
  meId,
  win,
}: {
  label: string
  cls: string
  people: LockedBulletPick[]
  meId?: string
  win: boolean
}) {
  return (
    <div className={`bullet-side ${cls} ${win ? 'bullet-side-win' : ''}`}>
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
