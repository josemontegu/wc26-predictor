import { useEffect, useMemo, useRef, useState } from 'react'
import { supabase, DEMO } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import type { AppConfig, Award, Match, Profile, Round, RoundCode } from '../lib/types'
import { roundName, ROUND_ORDER } from '../lib/format'
import { buildUpserts, fetchFeed, isRealTeam, type SyncSummary } from '../lib/openfootball'
import { teamFlag } from '../lib/teamMeta'
import { isoToLocalInput, localInputToIso } from '../lib/datetime'
import { useT } from '../lib/i18n'
import AdminMatchRow from '../components/AdminMatchRow'
import AdminPlayerRow from '../components/AdminPlayerRow'
import AwardPicker from '../components/AwardPicker'
import Spinner from '../components/Spinner'

export default function AdminPage() {
  const t = useT()
  const { isAdmin } = useAuth()
  const [matches, setMatches] = useState<Match[]>([])
  const [config, setConfig] = useState<AppConfig | null>(null)
  const [rounds, setRounds] = useState<Round[]>([])
  const [awards, setAwards] = useState<Award[]>([])
  const [awardBusy, setAwardBusy] = useState(false)
  const [awardSaved, setAwardSaved] = useState(false)
  const [players, setPlayers] = useState<Profile[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [activeRound, setActiveRound] = useState<RoundCode>('R32')

  // config form
  const [cfgDraft, setCfgDraft] = useState<AppConfig | null>(null)
  const [roundDraft, setRoundDraft] = useState<Record<string, string>>({})
  const [cfgBusy, setCfgBusy] = useState(false)
  const [cfgSaved, setCfgSaved] = useState(false)

  // openfootball sync
  const [syncBusy, setSyncBusy] = useState(false)
  const [syncSummary, setSyncSummary] = useState<SyncSummary | null>(null)
  const [syncError, setSyncError] = useState<string | null>(null)
  const [autoSynced, setAutoSynced] = useState(false)
  const [syncPreview, setSyncPreview] = useState<
    { match_no: number; home: string; away: string; resolved: boolean }[] | null
  >(null)
  const didAutoSync = useRef(false)

  useEffect(() => {
    let active = true
    async function load() {
      const [matchRes, cfgRes, roundRes, awardRes, playerRes] = await Promise.all([
        supabase.from('matches').select('*').order('match_no'),
        supabase.from('app_config').select('*').eq('id', 1).maybeSingle(),
        supabase.from('rounds').select('*').order('sort_order'),
        supabase.from('awards').select('*').order('sort_order'),
        supabase.from('profiles').select('*').order('nickname'),
      ])
      if (!active) return
      if (matchRes.error) setError(matchRes.error.message)
      setMatches((matchRes.data as Match[]) ?? [])
      setAwards((awardRes.data as Award[]) ?? [])
      setPlayers((playerRes.data as Profile[]) ?? [])
      const cfg = (cfgRes.data as AppConfig) ?? null
      setConfig(cfg)
      setCfgDraft(cfg)
      const rs = (roundRes.data as Round[]) ?? []
      setRounds(rs)
      setRoundDraft(Object.fromEntries(rs.map((r) => [r.code, String(r.multiplier)])))
      setLoading(false)
    }
    load()
    return () => {
      active = false
    }
  }, [])

  const visible = useMemo(
    () => matches.filter((m) => m.round === activeRound),
    [matches, activeRound],
  )

  // Auto-sync the bracket from openfootball once, after the page's data loads.
  // Live mode only — demo keeps the sample bracket and previews on demand.
  useEffect(() => {
    if (DEMO || loading || didAutoSync.current || !config) return
    didAutoSync.current = true
    setAutoSynced(true)
    syncFromOpenfootball()
    // syncFromOpenfootball reads freshly-loaded matches/config; safe to omit.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading, config])

  function handleMatchSaved(updated: Match) {
    setMatches((prev) => prev.map((m) => (m.id === updated.id ? updated : m)))
  }

  function editAward(id: string, patch: Partial<Award>) {
    setAwards((prev) => prev.map((a) => (a.id === id ? { ...a, ...patch } : a)))
  }

  async function saveAwards() {
    setAwardBusy(true)
    setAwardSaved(false)
    setError(null)
    const rows = awards.map((a) => ({
      id: a.id,
      key: a.key,
      name: a.name,
      description: a.description,
      points: Number(a.points),
      lock_time: a.lock_time,
      winner: a.winner && a.winner.trim() ? a.winner.trim() : null,
      sort_order: a.sort_order,
    }))
    const { error } = await supabase.from('awards').upsert(rows, { onConflict: 'id' })
    setAwardBusy(false)
    if (error) {
      setError(error.message)
      return
    }
    setAwardSaved(true)
  }

  async function syncFromOpenfootball() {
    setSyncBusy(true)
    setSyncError(null)
    setSyncSummary(null)
    setSyncPreview(null)
    try {
      const feed = await fetchFeed()

      if (DEMO) {
        // Demo: preview the live feed without mutating the sample data.
        setSyncPreview(
          feed
            .filter((f) => f.round === activeRound)
            .map((f) => ({
              match_no: f.match_no,
              home: isRealTeam(f.team1) ? f.team1!.trim() : 'TBD',
              away: isRealTeam(f.team2) ? f.team2!.trim() : 'TBD',
              resolved: isRealTeam(f.team1) && isRealTeam(f.team2),
            })),
        )
        return
      }

      const lockMins = config?.lock_minutes_before_kickoff ?? 60
      const { rows, summary } = buildUpserts(matches, feed, lockMins)
      if (rows.length > 0) {
        const { error } = await supabase
          .from('matches')
          .upsert(rows, { onConflict: 'match_no' })
        if (error) throw new Error(error.message)
        const { data } = await supabase.from('matches').select('*').order('match_no')
        setMatches((data as Match[]) ?? matches)
      }
      setSyncSummary(summary)
    } catch (e) {
      setSyncError(e instanceof Error ? e.message : String(e))
    } finally {
      setSyncBusy(false)
    }
  }

  async function saveConfig() {
    if (!cfgDraft) return
    setCfgBusy(true)
    setCfgSaved(false)
    setError(null)

    const { error: cfgErr } = await supabase
      .from('app_config')
      .update({
        points_advance: Number(cfgDraft.points_advance),
        points_exact: Number(cfgDraft.points_exact),
        points_tendency: Number(cfgDraft.points_tendency),
        points_penalties: Number(cfgDraft.points_penalties),
        lock_minutes_before_kickoff: Number(cfgDraft.lock_minutes_before_kickoff),
      })
      .eq('id', 1)

    // Persist any changed round multipliers
    const roundUpdates = rounds
      .filter((r) => roundDraft[r.code] !== undefined && Number(roundDraft[r.code]) !== r.multiplier)
      .map((r) =>
        supabase
          .from('rounds')
          .update({ multiplier: Number(roundDraft[r.code]) })
          .eq('code', r.code),
      )
    const roundResults = await Promise.all(roundUpdates)

    setCfgBusy(false)
    const firstErr = cfgErr ?? roundResults.find((r) => r.error)?.error
    if (firstErr) {
      setError(firstErr.message)
      return
    }
    setConfig(cfgDraft)
    setRounds((prev) =>
      prev.map((r) => ({ ...r, multiplier: Number(roundDraft[r.code] ?? r.multiplier) })),
    )
    setCfgSaved(true)
  }

  if (!isAdmin) {
    return (
      <div className="page">
        <div className="notice notice-err">{t('Admins only.', 'Solo para admins.')}</div>
      </div>
    )
  }

  if (loading) {
    return (
      <div className="page">
        <Spinner label={t('Loading admin…', 'Cargando admin…')} />
      </div>
    )
  }

  return (
    <div className="page">
      <h1>{t('Admin', 'Admin')}</h1>
      {error && <div className="notice notice-err">{error}</div>}

      <div className="form-card">
        <div className="rule-card-head">
          <span className="rule-icon">🔄</span>
          <h2>{t('Auto-fill bracket', 'Autocompletar llave')}</h2>
        </div>
        <p className="muted small">
          {t(
            'Pull live knockout matchups & kick-off times from the free, public-domain',
            'Trae los cruces y horarios de eliminación en vivo desde la fuente gratuita y de dominio público',
          )}{' '}
          <a
            href="https://github.com/openfootball/worldcup.json"
            target="_blank"
            rel="noreferrer"
            style={{ color: 'var(--info)', textDecoration: 'underline' }}
          >
            openfootball
          </a>{' '}
          {t(
            'dataset. Teams fill in automatically as the group stage finishes. Results stay admin-entered.',
            'dataset. Los equipos se completan automáticamente a medida que termina la fase de grupos. Los resultados los sigue ingresando el admin.',
          )}
        </p>
        {!DEMO && (
          <p className="muted small">
            {t(
              '↻ Syncs automatically each time you open this page. Tap below to sync again now.',
              '↻ Se sincroniza automáticamente cada vez que abres esta página. Toca abajo para sincronizar de nuevo ahora.',
            )}
          </p>
        )}
        <button className="btn btn-primary" onClick={syncFromOpenfootball} disabled={syncBusy}>
          {syncBusy
            ? autoSynced && !syncSummary
              ? t('Auto-syncing…', 'Sincronizando automáticamente…')
              : t('Syncing…', 'Sincronizando…')
            : DEMO
              ? t('Preview live feed', 'Vista previa del feed en vivo')
              : t('Sync again', 'Sincronizar de nuevo')}
        </button>
        {syncError && <div className="notice notice-err">{syncError}</div>}
        {syncSummary &&
          (syncSummary.total === 0 ? (
            <div className="notice notice-ok">
              {t('Bracket is already up to date ✓', 'La llave ya está actualizada ✓')}
            </div>
          ) : (
            <div className="notice notice-ok">
              {t(
                `Synced ✓ ${syncSummary.matchupsUpdated} matchup${
                  syncSummary.matchupsUpdated === 1 ? '' : 's'
                } and ${syncSummary.kickoffsUpdated} kick-off time${
                  syncSummary.kickoffsUpdated === 1 ? '' : 's'
                } updated${
                  syncSummary.resolvedTeams > 0
                    ? ` · ${syncSummary.resolvedTeams} new team${
                        syncSummary.resolvedTeams === 1 ? '' : 's'
                      } confirmed`
                    : ''
                }.`,
                `Sincronizado ✓ ${syncSummary.matchupsUpdated} cruce${
                  syncSummary.matchupsUpdated === 1 ? '' : 's'
                } y ${syncSummary.kickoffsUpdated} horario${
                  syncSummary.kickoffsUpdated === 1 ? '' : 's'
                } actualizados${
                  syncSummary.resolvedTeams > 0
                    ? ` · ${syncSummary.resolvedTeams} equipo${
                        syncSummary.resolvedTeams === 1 ? '' : 's'
                      } nuevo${syncSummary.resolvedTeams === 1 ? '' : 's'} confirmado${
                        syncSummary.resolvedTeams === 1 ? '' : 's'
                      }`
                    : ''
                }.`,
              )}
            </div>
          ))}
        {DEMO && syncPreview && (
          <div className="notice notice-info">
            <strong>
              {t('Live feed', 'Feed en vivo')} · {roundName(activeRound)}
            </strong>{' '}
            {t('(preview only in demo):', '(solo vista previa en demo):')}
            <div className="sync-preview">
              {syncPreview.map((p) => (
                <div key={p.match_no} className="sync-preview-row">
                  <span className="muted small">#{p.match_no}</span>
                  <span>
                    {teamFlag(p.home)} {p.home} v {p.away} {teamFlag(p.away)}
                  </span>
                  <span>{p.resolved ? '✅' : '⏳'}</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      <h2>{t('Matches & results', 'Partidos y resultados')}</h2>
      <div className="round-tabs">
        {ROUND_ORDER.map((r) => (
          <button
            key={r}
            className={`round-tab ${activeRound === r ? 'round-tab-active' : ''}`}
            onClick={() => setActiveRound(r)}
          >
            {r}
          </button>
        ))}
      </div>
      <h3 className="round-title">{roundName(activeRound)}</h3>

      {visible.length === 0 ? (
        <p className="muted">{t('No matches in this round.', 'No hay partidos en esta ronda.')}</p>
      ) : (
        <div className="admin-list">
          {visible.map((m) => (
            <AdminMatchRow
              key={m.id}
              match={m}
              config={config}
              onSaved={handleMatchSaved}
            />
          ))}
        </div>
      )}

      <h2 className="mt-lg">{t('Scoring & lock settings', 'Puntaje y cierre')}</h2>
      {cfgDraft && (
        <div className="form-card">
          <div className="admin-grid">
            <label>
              {t('Pts: advancing team', 'Pts: equipo que avanza')}
              <input
                type="number"
                value={cfgDraft.points_advance}
                onChange={(e) =>
                  setCfgDraft({ ...cfgDraft, points_advance: Number(e.target.value) })
                }
              />
            </label>
            <label>
              {t('Pts: exact score', 'Pts: marcador exacto')}
              <input
                type="number"
                value={cfgDraft.points_exact}
                onChange={(e) =>
                  setCfgDraft({ ...cfgDraft, points_exact: Number(e.target.value) })
                }
              />
            </label>
            <label>
              {t('Pts: tendency (1/X/2)', 'Pts: resultado (1/X/2)')}
              <input
                type="number"
                value={cfgDraft.points_tendency}
                onChange={(e) =>
                  setCfgDraft({ ...cfgDraft, points_tendency: Number(e.target.value) })
                }
              />
            </label>
            <label>
              {t('Lock minutes before kick-off', 'Minutos de cierre antes del inicio')}
              <input
                type="number"
                value={cfgDraft.lock_minutes_before_kickoff}
                onChange={(e) =>
                  setCfgDraft({
                    ...cfgDraft,
                    lock_minutes_before_kickoff: Number(e.target.value),
                  })
                }
              />
            </label>
          </div>

          <div className="admin-section-label">
            {t('Round multipliers', 'Multiplicadores de ronda')}
          </div>
          <div className="admin-grid">
            {rounds.map((r) => (
              <label key={r.code}>
                {r.name}
                <input
                  type="number"
                  step="0.5"
                  value={roundDraft[r.code] ?? ''}
                  onChange={(e) =>
                    setRoundDraft((prev) => ({ ...prev, [r.code]: e.target.value }))
                  }
                />
              </label>
            ))}
          </div>

          {cfgSaved && (
            <div className="notice notice-ok">{t('Settings saved ✓', 'Ajustes guardados ✓')}</div>
          )}
          <button className="btn btn-primary" onClick={saveConfig} disabled={cfgBusy}>
            {cfgBusy ? t('Saving…', 'Guardando…') : t('Save settings', 'Guardar ajustes')}
          </button>
        </div>
      )}

      <h2 className="mt-lg">{t('Tournament awards', 'Premios del torneo')}</h2>
      {awards.length === 0 ? (
        <p className="muted small">
          {t(
            'No awards set up. Run the awards migration + seed.',
            'No hay premios configurados. Ejecuta la migración y el seed de premios.',
          )}
        </p>
      ) : (
        <div className="form-card">
          {awards.map((a) => (
            <div key={a.id} className="admin-award">
              <div className="admin-section-label">{a.name}</div>
              <label>
                {t('Winner', 'Ganador')}
                <AwardPicker
                  kind={a.kind}
                  value={a.winner ?? ''}
                  onChange={(v) => editAward(a.id, { winner: v })}
                />
              </label>
              <div className="admin-grid">
                <label>
                  {t('Points', 'Puntos')}
                  <input
                    type="number"
                    value={a.points}
                    onChange={(e) => editAward(a.id, { points: Number(e.target.value) })}
                  />
                </label>
                <label>
                  {t('Picks lock at', 'Las elecciones cierran a las')}
                  <input
                    type="datetime-local"
                    value={isoToLocalInput(a.lock_time)}
                    onChange={(e) => editAward(a.id, { lock_time: localInputToIso(e.target.value) })}
                  />
                </label>
              </div>
            </div>
          ))}
          {awardSaved && (
            <div className="notice notice-ok">{t('Awards saved ✓', 'Premios guardados ✓')}</div>
          )}
          <button className="btn btn-primary" onClick={saveAwards} disabled={awardBusy}>
            {awardBusy ? t('Saving…', 'Guardando…') : t('Save awards', 'Guardar premios')}
          </button>
        </div>
      )}

      <h2 className="mt-lg">{t('Players', 'Jugadores')}</h2>
      <p className="muted small">
        {t(
          'Nicknames & emojis are set once by each player; edit them here if needed.',
          'Cada jugador define su apodo y emoji una sola vez; edítalos aquí si hace falta.',
        )}
      </p>
      <div className="admin-list">
        {players.map((p) => (
          <AdminPlayerRow
            key={p.id}
            profile={p}
            takenEmojis={
              new Set(players.filter((o) => o.id !== p.id && o.emoji).map((o) => o.emoji))
            }
            onSaved={(updated) =>
              setPlayers((prev) => prev.map((x) => (x.id === updated.id ? updated : x)))
            }
          />
        ))}
      </div>
    </div>
  )
}
