import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import type { Match, RoundCode } from '../lib/types'
import { hasResult } from '../lib/types'
import { roundName } from '../lib/format'
import { teamColor, teamFlag, isTBD } from '../lib/teamMeta'
import Spinner from '../components/Spinner'
import { useT } from '../lib/i18n'

// Fixed knockout topology: which two match numbers feed each next-round match.
// (The DB stores later-round teams as "TBD" with no link, so the bracket shape
// lives here.) Match numbers follow the World Cup 2026 schedule: R32 = 73–88,
// R16 = 89–96, QF = 97–100, SF = 101–102, 3rd place = 103, Final = 104.
const FEEDS: Record<number, [number, number]> = {
  89: [74, 77], 90: [73, 75], 91: [76, 78], 92: [79, 80],
  93: [83, 84], 94: [81, 82], 95: [86, 88], 96: [85, 87],
  97: [89, 90], 98: [93, 94], 99: [91, 92], 100: [95, 96],
  101: [97, 98], 102: [99, 100],
  103: [101, 102], // third place: the two semi-final losers
  104: [101, 102], // final: the two semi-final winners
}

// Round-to-round steps shown one at a time, so two rounds (and the lines
// connecting them) are always on screen together.
const TRANSITIONS: [RoundCode, RoundCode][] = [
  ['R32', 'R16'],
  ['R16', 'QF'],
  ['QF', 'SF'],
  ['SF', 'F'],
]

// Match numbers are assigned by SCHEDULE, not bracket position, so listing a
// round by match_no scrambles the tree (e.g. R16 #91/#92 actually sit below
// #93/#94). Derive the true top-to-bottom order for each round by walking the
// tree down from the Final via FEEDS, so the branches line up like a real
// bracket.
const expand = (nos: number[]): number[] => nos.flatMap((n) => FEEDS[n] ?? [])
const ORDER_SF = expand([104])
const ORDER_QF = expand(ORDER_SF)
const ORDER_R16 = expand(ORDER_QF)
const ORDER_R32 = expand(ORDER_R16)
const BRACKET_ORDER: Record<RoundCode, number[]> = {
  F: [104],
  SF: ORDER_SF,
  QF: ORDER_QF,
  R16: ORDER_R16,
  R32: ORDER_R32,
  TP: [103],
}
const orderRank = (round: RoundCode, no: number | null): number => {
  if (no == null) return 999
  const i = BRACKET_ORDER[round].indexOf(no)
  return i === -1 ? 999 : i
}

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

  const byNo = useMemo(() => {
    const map = new Map<number, Match>()
    for (const m of matches) if (m.match_no != null) map.set(m.match_no, m)
    return map
  }, [matches])

  // Only show transitions where both rounds have matches.
  const pages = TRANSITIONS.filter(([a, b]) => byRound[a]?.length && byRound[b]?.length)

  const [idx, setIdx] = useState(0)
  const safeIdx = Math.min(idx, Math.max(0, pages.length - 1))
  const page = pages[safeIdx]

  if (loading) {
    return (
      <div className="page">
        <h1>{t('Bracket', 'Llave')}</h1>
        <Spinner label={t('Building the bracket…', 'Construyendo la llave…')} />
      </div>
    )
  }

  if (!page) {
    return (
      <div className="page">
        <h1>{t('Knockout bracket', 'Llave de eliminación')}</h1>
        <p className="muted">{t('The bracket appears once matches are set.', 'La llave aparece cuando se definan los partidos.')}</p>
      </div>
    )
  }

  const [from, to] = page
  const dests = (byRound[to] ?? [])
    .slice()
    .sort((a, b) => orderRank(to, a.match_no) - orderRank(to, b.match_no))

  return (
    <div className="page">
      <h1>{t('Knockout bracket', 'Llave de eliminación')}</h1>
      <p className="muted small">
        {t('The two matches on the left feed the one on the right. Use the arrows to move between rounds.', 'Los dos partidos de la izquierda definen el de la derecha. Usa las flechas para cambiar de ronda.')}
      </p>

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
          <div className="bk-nav-round">
            {roundName(from)} <span className="bk-nav-arrow">→</span> {roundName(to)}
          </div>
          <div className="bk-nav-dots">
            {pages.map(([a, b], i) => (
              <button
                key={a + b}
                className={`bk-dot ${i === safeIdx ? 'bk-dot-active' : ''}`}
                onClick={() => setIdx(i)}
                aria-label={`${roundName(a)} → ${roundName(b)}`}
              />
            ))}
          </div>
        </div>
        <button
          className="bk-nav-btn"
          onClick={() => setIdx(safeIdx + 1)}
          disabled={safeIdx === pages.length - 1}
          aria-label={t('Next round', 'Ronda siguiente')}
        >
          →
        </button>
      </div>

      <div className="bk-ties">
        {dests.map((dest) => {
          const srcNos = dest.match_no != null ? FEEDS[dest.match_no] ?? [] : []
          const sources = srcNos.map((n) => byNo.get(n)).filter((m): m is Match => !!m)
          return (
            <div className="bk-tie" key={dest.id}>
              <div className="bk-tie-sources">
                {sources.map((s) => (
                  <BracketMatch key={s.id} match={s} onClick={() => navigate(`/match/${s.id}`)} />
                ))}
              </div>
              <div className="bk-tie-conn" aria-hidden="true">
                <span className="bk-line-top" />
                <span className="bk-line-bot" />
                <span className="bk-line-v" />
                <span className="bk-line-mid" />
              </div>
              <div className="bk-tie-dest">
                <BracketMatch match={dest} onClick={() => navigate(`/match/${dest.id}`)} />
              </div>
            </div>
          )
        })}

        {/* The third-place play-off is fed by the same two semis as the final. */}
        {to === 'F' &&
          (byRound['TP'] ?? []).map((tp) => (
            <div className="bk-thirdplace" key={tp.id}>
              <div className="bk-tp-label">🥉 {roundName('TP')}</div>
              <BracketMatch match={tp} onClick={() => navigate(`/match/${tp.id}`)} />
            </div>
          ))}
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
