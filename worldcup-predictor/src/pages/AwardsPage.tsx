import { useEffect, useMemo, useState, type FormEvent } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import type { Award, AwardPrediction, LockedAwardPrediction } from '../lib/types'
import { awardLocked } from '../lib/types'
import { formatLock, timeUntilLock } from '../lib/format'
import { useT, type TFn } from '../lib/i18n'
import { teamFlag, teamName } from '../lib/teamMeta'
import Spinner from '../components/Spinner'
import AwardPicker from '../components/AwardPicker'

const AWARD_ICON: Record<string, string> = {
  champion: '🏆',
  golden_ball: '⚽',
  golden_boot: '👟',
  golden_glove: '🧤',
}

function awardName(key: string, fallback: string, t: TFn): string {
  switch (key) {
    case 'champion':
      return t('Champion', 'Campeón')
    case 'golden_ball':
      return t('Golden Ball', 'Balón de Oro')
    case 'golden_boot':
      return t('Golden Boot', 'Bota de Oro')
    case 'golden_glove':
      return t('Golden Glove', 'Guante de Oro')
    default:
      return fallback
  }
}

function awardDesc(key: string, fallback: string | null, t: TFn): string | null {
  switch (key) {
    case 'champion':
      return t('Winner of the World Cup', 'Campeón del Mundial')
    case 'golden_ball':
      return t('Best player of the tournament', 'Mejor jugador del torneo')
    case 'golden_boot':
      return t('Top scorer', 'Goleador del torneo')
    case 'golden_glove':
      return t('Best goalkeeper', 'Mejor arquero')
    default:
      return fallback
  }
}

function topPick(list: LockedAwardPrediction[]) {
  const counts = new Map<string, number>()
  for (const p of list) counts.set(p.pick, (counts.get(p.pick) ?? 0) + 1)
  let best = ''
  let n = 0
  for (const [k, v] of counts) if (v > n) ((best = k), (n = v))
  return { pick: best, n, total: list.length }
}

function PoolAwardTile({
  icon,
  label,
  pick,
  t,
}: {
  icon: string
  label: string
  pick: { pick: string; n: number; total: number }
  t: TFn
}) {
  const pct = pick.total ? Math.round((pick.n / pick.total) * 100) : 0
  return (
    <div className="stat-tile">
      <div className="award-tile-label">
        {icon} {label}
      </div>
      <div className="award-tile-pick">{pick.pick || '—'}</div>
      {pick.pick && <div className="stat-cap">{t(`${pct}% of the pool`, `${pct}% del grupo`)}</div>}
    </div>
  )
}

export default function AwardsPage() {
  const t = useT()
  const { session } = useAuth()
  const [awards, setAwards] = useState<Award[]>([])
  const [picks, setPicks] = useState<Record<string, string>>({})
  const [saved, setSaved] = useState<Record<string, string>>({}) // last-saved value per award
  const [awardPicks, setAwardPicks] = useState<LockedAwardPrediction[]>([]) // whole pool, once locked
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [done, setDone] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let active = true
    async function load() {
      const [awardRes, predRes, poolRes] = await Promise.all([
        supabase.from('awards').select('*').order('sort_order'),
        supabase.from('award_predictions').select('*').eq('user_id', session!.user.id),
        supabase.from('locked_award_predictions').select('*'),
      ])
      if (!active) return
      if (awardRes.error) setError(awardRes.error.message)
      setAwards((awardRes.data as Award[]) ?? [])
      const byAward: Record<string, string> = {}
      for (const p of (predRes.data as AwardPrediction[]) ?? []) byAward[p.award_id] = p.pick
      setPicks(byAward)
      setSaved(byAward)
      setAwardPicks((poolRes.data as LockedAwardPrediction[]) ?? [])
      setLoading(false)
    }
    load()
    return () => {
      active = false
    }
  }, [session])

  // What the whole pool backs — only visible once award picks lock (the
  // locked_award_predictions view stays empty until then).
  const pulse = useMemo(() => {
    const champ = awardPicks.filter((a) => a.award_key === 'champion')
    const champCounts = new Map<string, number>()
    for (const c of champ) champCounts.set(c.pick, (champCounts.get(c.pick) ?? 0) + 1)
    const champBars = [...champCounts.entries()]
      .map(([team, n]) => ({ team, n, pct: champ.length ? Math.round((n / champ.length) * 100) : 0 }))
      .sort((a, b) => b.n - a.n)
      .slice(0, 5)
    return {
      champBars,
      ball: topPick(awardPicks.filter((a) => a.award_key === 'golden_ball')),
      boot: topPick(awardPicks.filter((a) => a.award_key === 'golden_boot')),
      glove: topPick(awardPicks.filter((a) => a.award_key === 'golden_glove')),
    }
  }, [awardPicks])

  async function handleSave(e: FormEvent) {
    e.preventDefault()
    if (!session?.user) return
    setBusy(true)
    setError(null)
    setDone(false)

    // Upsert only the open awards whose pick changed and is non-empty.
    const rows = awards
      .filter((a) => !awardLocked(a))
      .filter((a) => (picks[a.id] ?? '').trim() && (picks[a.id] ?? '').trim() !== (saved[a.id] ?? ''))
      .map((a) => ({
        user_id: session.user.id,
        award_id: a.id,
        pick: picks[a.id].trim(),
      }))

    if (rows.length === 0) {
      setBusy(false)
      setDone(true)
      return
    }

    const { error } = await supabase
      .from('award_predictions')
      .upsert(rows, { onConflict: 'user_id,award_id' })
    setBusy(false)
    if (error) {
      setError(error.message)
      return
    }
    const nextSaved = { ...saved }
    rows.forEach((r) => (nextSaved[r.award_id] = r.pick))
    setSaved(nextSaved)
    setDone(true)
  }

  if (loading) {
    return (
      <div className="page">
        <h1>{t('Awards', 'Premios')}</h1>
        <Spinner label={t('Loading awards…', 'Cargando premios…')} />
      </div>
    )
  }

  const anyOpen = awards.some((a) => !awardLocked(a))

  return (
    <div className="page">
      <h1>🏅 {t('Tournament awards', 'Premios del torneo')}</h1>
      <p className="muted small">
        {t(
          'Call the champion and the individual award winners. Worth big points — editable until they lock before kick-off.',
          'Predice al campeón y a los ganadores de los premios individuales. Valen muchos puntos — editables hasta que se cierran antes del inicio.',
        )}
      </p>
      {error && <div className="notice notice-err">{error}</div>}

      {awards.length === 0 ? (
        <p className="muted">{t('No awards set up yet.', 'Aún no hay premios configurados.')}</p>
      ) : (
        <form onSubmit={handleSave}>
          {awards.map((a) => {
            const locked = awardLocked(a)
            const decided = a.winner != null && a.winner !== ''
            const myPick = picks[a.id] ?? ''
            const got = decided && myPick.trim().toLowerCase() === a.winner!.trim().toLowerCase()
            return (
              <div key={a.id} className={`award-card ${a.kind === 'team' ? 'award-champion' : ''}`}>
                <div className="award-head">
                  <span className="award-icon">{AWARD_ICON[a.key] ?? '🏅'}</span>
                  <div className="award-title">
                    <div className="award-name">{awardName(a.key, a.name, t)}</div>
                    {awardDesc(a.key, a.description, t) && (
                      <div className="muted small">{awardDesc(a.key, a.description, t)}</div>
                    )}
                  </div>
                  <span className="award-points">{a.points} {t('pts', 'pts')}</span>
                </div>

                <AwardPicker
                  kind={a.kind}
                  value={myPick}
                  disabled={locked || decided}
                  onChange={(v) => setPicks((p) => ({ ...p, [a.id]: v }))}
                />

                <div className="award-foot">
                  {decided ? (
                    <span className={`award-status ${got ? 'award-hit' : 'award-miss'}`}>
                      {t('Winner', 'Ganador')}: {a.winner}{' '}
                      {got ? `· +${a.points} ${t('pts ✓', 'pts ✓')}` : '· +0'}
                    </span>
                  ) : locked ? (
                    <span className="muted small">
                      🔒 {t('Locked · awaiting result', 'Cerrado · esperando resultado')}
                    </span>
                  ) : (
                    <span className="muted small">
                      🔓 {t('Closes in', 'Se cierra en')} {timeUntilLock(a.lock_time)}
                      {a.lock_time ? ` · ${formatLock(a.lock_time)}` : ''}
                    </span>
                  )}
                </div>
              </div>
            )
          })}

          {anyOpen && (
            <>
              {done && (
                <div className="notice notice-ok">
                  {t('Award picks saved ✓', 'Elecciones guardadas ✓')}
                </div>
              )}
              <button className="btn btn-primary" type="submit" disabled={busy}>
                {busy ? t('Saving…', 'Guardando…') : t('Save my picks', 'Guardar mis elecciones')}
              </button>
            </>
          )}
        </form>
      )}

      {awardPicks.length > 0 && (
        <>
          <h2 className="stat-h stat-h-divider">🔮 {t('Pool Pulse', 'Pulso del grupo')}</h2>
          {pulse.champBars.length > 0 && (
            <div className="form-card">
              <div className="stat-title">
                {t('Who the pool backs to win it', 'A quién apuesta el grupo para ganar')}
              </div>
              {pulse.champBars.map((b) => (
                <div key={b.team} className="cbar-row">
                  <span className="cbar-label">
                    {teamFlag(b.team)} {teamName(b.team)}
                  </span>
                  <div className="cbar-track">
                    <div className="cbar-fill" style={{ width: `${b.pct}%` }} />
                  </div>
                  <span className="cbar-pct">{b.pct}%</span>
                </div>
              ))}
            </div>
          )}
          <div className="stat-tiles">
            <PoolAwardTile icon="⚽" label={t('Golden Ball', 'Balón de Oro')} pick={pulse.ball} t={t} />
            <PoolAwardTile icon="👟" label={t('Golden Boot', 'Bota de Oro')} pick={pulse.boot} t={t} />
            <PoolAwardTile icon="🧤" label={t('Golden Glove', 'Guante de Oro')} pick={pulse.glove} t={t} />
          </div>
        </>
      )}
    </div>
  )
}
