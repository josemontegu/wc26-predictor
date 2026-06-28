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

  // Rounds that have matches, in tournament order (R32 → Final).
  const rounds = ROUND_ORDER.filter((r) => byRound[r]?.length)

  // One round in view at a time; arrows step through them.
  const [idx, setIdx] = useState(0)
  const safeIdx = Math.min(idx, Math.max(0, rounds.length - 1))
  const round = rounds[safeIdx] as RoundCode | undefined

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
        {t('Use the arrows to move between rounds.', 'Usa las flechas para avanzar de ronda.')}
      </p>

      {round && (
        <>
          <div className="bk-nav">
            <button
              className="bk-nav-btn"
              onClick={() => setIdx(safeIdx - 1)}
              disabled={safeIdx === 0}
              aria-label={t('Previous round', 'Ronda anterior')}
            >
              ←
            </button>
            <div className="bk-nav-center">
              <div className="bk-nav-round">{roundName(round)}</div>
              <div className="bk-nav-dots">
                {rounds.map((r, i) => (
                  <button
                    key={r}
                    className={`bk-dot ${i === safeIdx ? 'bk-dot-active' : ''}`}
                    onClick={() => setIdx(i)}
                    aria-label={roundName(r as RoundCode)}
                  />
                ))}
              </div>
            </div>
            <button
              className="bk-nav-btn"
              onClick={() => setIdx(safeIdx + 1)}
              disabled={safeIdx === rounds.length - 1}
              aria-label={t('Next round', 'Ronda siguiente')}
            >
              →
            </button>
          </div>

          <div className="bk-round-body">
            {byRound[round].map((m) => (
              <BracketMatch key={m.id} match={m} onClick={() => navigate(`/match/${m.id}`)} />
            ))}
          </div>
        </>
      )}
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
