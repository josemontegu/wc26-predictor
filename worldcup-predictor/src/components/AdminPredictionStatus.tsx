import { useCallback, useEffect, useMemo, useState } from 'react'
import { AlertTriangle, CheckCircle2, ListChecks } from 'lucide-react'
import { supabase } from '../lib/supabase'
import type { Match, MatchParticipation } from '../lib/types'
import { isLocked, hasResult } from '../lib/types'
import { teamFlag, teamName, isTBD } from '../lib/teamMeta'
import { roundName, timeUntilLock } from '../lib/format'
import { useT } from '../lib/i18n'
import AdminSection from './AdminSection'

/**
 * Admin: who still needs to predict each upcoming match, so late-comers can be
 * nudged before kick-off. Shows only whether a player has submitted, never
 * their actual pick (that stays private until the match locks).
 */
export default function AdminPredictionStatus({ matches }: { matches: Match[] }) {
  const t = useT()
  const [rows, setRows] = useState<MatchParticipation[]>([])

  const load = useCallback(async () => {
    const { data, error } = await supabase.from('match_participation').select('*')
    setRows(error ? [] : ((data as MatchParticipation[]) ?? []))
  }, [])

  useEffect(() => {
    load()
  }, [load])

  // Upcoming, predictable matches (teams known, not locked, not played),
  // soonest lock first.
  const open = useMemo(
    () =>
      matches
        .filter(
          (m) =>
            !isLocked(m) && !hasResult(m) && !isTBD(m.home_team) && !isTBD(m.away_team),
        )
        .sort((a, b) => {
          const la = a.lock_time ? new Date(a.lock_time).getTime() : Infinity
          const lb = b.lock_time ? new Date(b.lock_time).getTime() : Infinity
          return la - lb
        }),
    [matches],
  )

  return (
    <AdminSection icon={ListChecks} title={t('Prediction status', 'Estado de pronósticos')}>
      <p className="muted small">
        {t(
          "Who still needs to predict each upcoming match. You can't see anyone's pick, only whether they've submitted.",
          'Quién falta por pronosticar cada partido próximo. No puedes ver el pronóstico de nadie, solo si lo enviaron.',
        )}
      </p>

      {open.length === 0 ? (
        <p className="muted small">{t('No upcoming matches.', 'No hay partidos próximos.')}</p>
      ) : (
        <div className="pstatus-list">
          {open.map((m) => {
            const forMatch = rows.filter((r) => r.match_id === m.id && r.official)
            const missing = forMatch.filter((r) => !r.predicted)
            return (
              <div className="pstatus-row" key={m.id}>
                <div className="pstatus-head">
                  <span className="pstatus-teams">
                    {teamFlag(m.home_team)} {teamName(m.home_team)} v {teamName(m.away_team)}{' '}
                    {teamFlag(m.away_team)}
                  </span>
                  <span className="pstatus-when muted small">
                    {roundName(m.round)} · {t('closes in', 'cierra en')} {timeUntilLock(m.lock_time)}
                  </span>
                </div>
                {missing.length === 0 ? (
                  <div className="pstatus-ok">
                    <CheckCircle2 className="ic ic-good" aria-hidden="true" />{' '}
                    {t(`Everyone's in (${forMatch.length})`, `Todos dentro (${forMatch.length})`)}
                  </div>
                ) : (
                  <div className="pstatus-missing">
                    <AlertTriangle className="ic ic-warn" aria-hidden="true" />{' '}
                    {t(
                      `${missing.length} still to predict:`,
                      `${missing.length} por pronosticar:`,
                    )}{' '}
                    {missing.map((r) => (
                      <span className="pstatus-chip" key={r.user_id}>
                        {r.emoji || '🏳️'} {r.nickname}
                      </span>
                    ))}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}
    </AdminSection>
  )
}
