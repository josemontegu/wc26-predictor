import { useEffect, useMemo, useState, type FormEvent } from 'react'
import { Crown, Footprints, Hand, Lock, LockOpen, Sparkles, Star, Trophy, type LucideIcon } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import type { Award, AwardPrediction, LockedAwardPrediction } from '../lib/types'
import { awardLocked } from '../lib/types'
import { formatLock, timeUntilLock } from '../lib/format'
import { useT, type TFn } from '../lib/i18n'
import { teamFlag, teamName } from '../lib/teamMeta'
import Spinner from '../components/Spinner'
import AwardPicker from '../components/AwardPicker'

const AWARD_ICON: Record<string, LucideIcon> = {
  champion: Crown,
  golden_ball: Star,
  golden_boot: Footprints,
  golden_glove: Hand,
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

// Group an award's picks by choice into bar-chart rows, most popular first,
// capped so a long tail of one-off picks doesn't dwarf the card.
function bars(list: LockedAwardPrediction[], limit = 5) {
  const counts = new Map<string, number>()
  for (const p of list) counts.set(p.pick, (counts.get(p.pick) ?? 0) + 1)
  return [...counts.entries()]
    .map(([pick, n]) => ({ pick, n, pct: list.length ? Math.round((n / list.length) * 100) : 0 }))
    .sort((a, b) => b.n - a.n || a.pick.localeCompare(b.pick))
    .slice(0, limit)
}

// Group an award's picks by choice, with the voters behind each, most popular first.
function breakdown(list: LockedAwardPrediction[]) {
  const map = new Map<string, LockedAwardPrediction[]>()
  for (const a of list) {
    const arr = map.get(a.pick) ?? []
    arr.push(a)
    map.set(a.pick, arr)
  }
  const total = list.length
  return [...map.entries()]
    .map(([pick, voters]) => ({
      pick,
      voters,
      count: voters.length,
      pct: total ? Math.round((voters.length / total) * 100) : 0,
    }))
    .sort((a, b) => b.count - a.count || a.pick.localeCompare(b.pick))
}

function PoolBarCard({
  title,
  rows,
  kind,
  onOpen,
}: {
  title: string
  rows: { pick: string; n: number; pct: number }[]
  kind: 'team' | 'player' | 'goalkeeper'
  onOpen: () => void
}) {
  if (!rows.length) return null
  return (
    <button type="button" className="form-card pp-clickable" onClick={onOpen}>
      <div className="stat-title">{title}</div>
      {rows.map((b) => (
        <div key={b.pick} className="cbar-row">
          <span className="cbar-label">
            {kind === 'team' ? `${teamFlag(b.pick)} ${teamName(b.pick)}` : b.pick}
          </span>
          <div className="cbar-track">
            <div className="cbar-fill" style={{ width: `${b.pct}%` }} />
          </div>
          <span className="cbar-pct">{b.pct}%</span>
        </div>
      ))}
    </button>
  )
}

export default function AwardsPage() {
  const t = useT()
  const { session } = useAuth()
  const [awards, setAwards] = useState<Award[]>([])
  const [picks, setPicks] = useState<Record<string, string>>({})
  const [saved, setSaved] = useState<Record<string, string>>({}) // last-saved value per award
  const [awardPicks, setAwardPicks] = useState<LockedAwardPrediction[]>([]) // whole pool, once locked
  // The award whose full pick breakdown is open (null = closed).
  const [poolDetail, setPoolDetail] = useState<{
    key: string
    kind: string
    icon: LucideIcon
    label: string
  } | null>(null)
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
  const pulse = useMemo(
    () => ({
      champBars: bars(awardPicks.filter((a) => a.award_key === 'champion')),
      ballBars: bars(awardPicks.filter((a) => a.award_key === 'golden_ball')),
      bootBars: bars(awardPicks.filter((a) => a.award_key === 'golden_boot')),
      gloveBars: bars(awardPicks.filter((a) => a.award_key === 'golden_glove')),
    }),
    [awardPicks],
  )

  useEffect(() => {
    if (!poolDetail) return
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setPoolDetail(null)
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [poolDetail])

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
        <h1><Trophy className="h-icon" aria-hidden="true" /> {t('Awards', 'Premios')}</h1>
        <Spinner label={t('Loading awards…', 'Cargando premios…')} />
      </div>
    )
  }

  const anyOpen = awards.some((a) => !awardLocked(a))

  return (
    <div className="page">
      <h1><Trophy className="h-icon" aria-hidden="true" /> {t('Tournament awards', 'Premios del torneo')}</h1>
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
            const AwardIcon = AWARD_ICON[a.key] ?? Trophy
            return (
              <div key={a.id} className={`award-card ${a.kind === 'team' ? 'award-champion' : ''}`}>
                <div className="award-head">
                  <span className="award-icon"><AwardIcon size={22} aria-hidden="true" /></span>
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
                      <Lock className="ic" aria-hidden="true" /> {t('Locked · awaiting result', 'Cerrado · esperando resultado')}
                    </span>
                  ) : (
                    <span className="muted small">
                      <LockOpen className="ic" aria-hidden="true" /> {t('Closes in', 'Se cierra en')} {timeUntilLock(a.lock_time)}
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
          <h2 className="stat-h stat-h-divider"><Sparkles className="h-icon" aria-hidden="true" /> {t('Pool Pulse', 'Pulso del grupo')}</h2>
          <p className="muted small pp-hint">
            {t(
              'What everyone picked for the tournament awards — tap a card for the full breakdown.',
              'Lo que eligió cada uno para los premios del torneo — toca una tarjeta para ver el detalle.',
            )}
          </p>
          <PoolBarCard
            title={t('Who the pool backs to win it', 'A quién apuesta el grupo para ganar')}
            rows={pulse.champBars}
            kind="team"
            onOpen={() =>
              setPoolDetail({
                key: 'champion',
                kind: 'team',
                icon: AWARD_ICON.champion,
                label: awardName('champion', 'Champion', t),
              })
            }
          />
          <PoolBarCard
            title={t('Who the pool backs for Golden Ball', 'A quién apuesta el grupo para el Balón de Oro')}
            rows={pulse.ballBars}
            kind="player"
            onOpen={() =>
              setPoolDetail({ key: 'golden_ball', kind: 'player', icon: AWARD_ICON.golden_ball, label: t('Golden Ball', 'Balón de Oro') })
            }
          />
          <PoolBarCard
            title={t('Who the pool backs for Golden Boot', 'A quién apuesta el grupo para la Bota de Oro')}
            rows={pulse.bootBars}
            kind="player"
            onOpen={() =>
              setPoolDetail({ key: 'golden_boot', kind: 'player', icon: AWARD_ICON.golden_boot, label: t('Golden Boot', 'Bota de Oro') })
            }
          />
          <PoolBarCard
            title={t('Who the pool backs for Golden Glove', 'A quién apuesta el grupo para el Guante de Oro')}
            rows={pulse.gloveBars}
            kind="goalkeeper"
            onOpen={() =>
              setPoolDetail({ key: 'golden_glove', kind: 'goalkeeper', icon: AWARD_ICON.golden_glove, label: t('Golden Glove', 'Guante de Oro') })
            }
          />
        </>
      )}

      {poolDetail &&
        (() => {
          const list = awardPicks.filter((a) => a.award_key === poolDetail.key)
          const groups = breakdown(list)
          return (
            <div className="pcard-overlay" onClick={() => setPoolDetail(null)}>
              <div className="pcard pp-card" onClick={(e) => e.stopPropagation()}>
                <button
                  type="button"
                  className="pcard-close"
                  onClick={() => setPoolDetail(null)}
                  aria-label={t('Close', 'Cerrar')}
                >
                  ✕
                </button>
                <div className="pp-modal-head">
                  <poolDetail.icon className="h-icon" aria-hidden="true" /> {poolDetail.label}
                </div>
                <div className="pp-modal-sub">
                  {t(`${list.length} picks`, `${list.length} pronósticos`)}
                </div>
                <div className="pp-groups">
                  {groups.map((g) => (
                    <div key={g.pick} className="pp-group">
                      <div className="pp-group-head">
                        <span className="pp-pick">
                          {poolDetail.kind === 'team'
                            ? `${teamFlag(g.pick)} ${teamName(g.pick)}`
                            : g.pick}
                        </span>
                        <span className="pp-pick-pct">
                          {g.count} ({g.pct}%)
                        </span>
                      </div>
                      <div className="pp-voters">
                        {g.voters.map((v) => (
                          <span key={v.user_id} className="pp-voter">
                            <span className="pp-voter-emoji">{v.emoji || '🏳️'}</span>{' '}
                            {v.nickname}
                          </span>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )
        })()}
    </div>
  )
}
