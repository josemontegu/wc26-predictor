import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import type { Match, RoundCode } from '../lib/types'
import { hasResult } from '../lib/types'
import { roundName, ROUND_ORDER } from '../lib/format'
import { teamColor, teamFlag, isTBD } from '../lib/teamMeta'
import Spinner from '../components/Spinner'
import { useT } from '../lib/i18n'

export default function BracketPage() {
  const navigate = useNavigate()
  const t = useT()
  const [matches, setMatches] = useState<Match[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let active = true
    supabase
      .from('matches')
      .select('*')
      .order('match_no')
      .then(({ data }) => {
        if (!active) return
        setMatches((data as Match[]) ?? [])
        setLoading(false)
      })
    return () => {
      active = false
    }
  }, [])

  const byRound = useMemo(() => {
    const map: Record<string, Match[]> = {}
    for (const m of matches) (map[m.round] ??= []).push(m)
    return map
  }, [matches])

  // Order columns so the Final sits in the middle visually: F, then TP, fans out.
  const columns = ROUND_ORDER.filter((r) => byRound[r]?.length)

  if (loading) {
    return (
      <div className="page">
        <h1>{t('Bracket', 'Llave')}</h1>
        <Spinner label={t('Building the bracket…', 'Construyendo la llave…')} />
      </div>
    )
  }

  return (
    <div className="page">
      <h1>{t('Knockout bracket', 'Llave de eliminación')}</h1>
      <p className="muted small">
        {t('Swipe across to follow the path to the Final →', 'Desliza para seguir el camino a la Final →')}
      </p>

      <div className="bracket-scroll">
        <div className="bracket">
          {columns.map((round) => (
            <div key={round} className={`bk-col bk-col-${round}`}>
              <div className="bk-col-head">{roundName(round as RoundCode)}</div>
              <div className="bk-col-body">
                {byRound[round].map((m) => (
                  <BracketMatch key={m.id} match={m} onClick={() => navigate(`/match/${m.id}`)} />
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

function BracketMatch({ match, onClick }: { match: Match; onClick: () => void }) {
  const played = hasResult(match)
  const homeWon = match.advancing_team === match.home_team
  const awayWon = match.advancing_team === match.away_team

  return (
    <button className="bk-match" onClick={onClick}>
      <BracketSide team={match.home_team} score={match.home_score} won={homeWon} dim={played && awayWon} />
      <BracketSide team={match.away_team} score={match.away_score} won={awayWon} dim={played && homeWon} />
    </button>
  )
}

function BracketSide({
  team,
  score,
  won,
  dim,
}: {
  team: string
  score: number | null
  won: boolean
  dim: boolean
}) {
  return (
    <div className={`bk-side ${won ? 'bk-side-won' : ''} ${dim ? 'bk-side-dim' : ''}`}>
      <span className="bk-flag" style={{ borderColor: teamColor(team) }}>
        {teamFlag(team)}
      </span>
      <span className={`bk-team ${isTBD(team) ? 'bk-team-tbd' : ''}`}>{team}</span>
      <span className="bk-score">{score ?? ''}</span>
    </div>
  )
}
