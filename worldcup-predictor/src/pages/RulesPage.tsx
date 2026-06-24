import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import type { AppConfig, Round } from '../lib/types'
import { ROUND_ORDER } from '../lib/format'
import Spinner from '../components/Spinner'

export default function RulesPage() {
  const [config, setConfig] = useState<AppConfig | null>(null)
  const [rounds, setRounds] = useState<Round[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let active = true
    async function load() {
      const [cfgRes, roundRes] = await Promise.all([
        supabase.from('app_config').select('*').eq('id', 1).maybeSingle(),
        supabase.from('rounds').select('*').order('sort_order'),
      ])
      if (!active) return
      setConfig((cfgRes.data as AppConfig) ?? null)
      setRounds((roundRes.data as Round[]) ?? [])
      setLoading(false)
    }
    load()
    return () => {
      active = false
    }
  }, [])

  if (loading) {
    return (
      <div className="page">
        <Spinner label="Loading rules…" />
      </div>
    )
  }

  const c = config
  const orderedRounds = [...rounds].sort(
    (a, b) => ROUND_ORDER.indexOf(a.code) - ROUND_ORDER.indexOf(b.code),
  )

  return (
    <div className="page">
      <h1>How it works</h1>

      <div className="form-card">
        <div className="rule-card-head">
          <span className="rule-icon">🎯</span>
          <h2>The game</h2>
        </div>
        <p>
          Predict every knockout match of the 2026 World Cup, from the Round of 32 to the
          Final. You call the <strong>score after 90 minutes</strong>; if you make it a
          draw, you also call the <strong>score after extra time</strong>. Whether it goes
          to <strong>penalties</strong> and <strong>who advances</strong> then follow
          automatically — still level after extra time means a shootout, and you pick the
          shootout winner. You can edit any time until the match locks, shortly before
          kick-off.
        </p>
      </div>

      <div className="form-card">
        <div className="rule-card-head">
          <span className="rule-icon">⚽</span>
          <h2>Points per match</h2>
        </div>
        {c ? (
          <ul className="rules-list">
            <li>
              <span className="rules-pts">{c.points_advance}</span> Correct team advancing
            </li>
            <li>
              <span className="rules-pts">{c.points_exact}</span> Exact 90-minute score
            </li>
            <li>
              <span className="rules-pts">{c.points_tendency}</span> Correct 90-minute
              result (home win / draw / away win)
            </li>
            <li>
              <span className="rules-pts">{c.points_exact_aet}</span> Exact extra-time score
              (when it goes to extra time)
            </li>
            <li>
              <span className="rules-pts">{c.points_penalties}</span> Correctly predicting
              penalties (yes / no)
            </li>
          </ul>
        ) : (
          <p className="muted">Scoring not configured yet.</p>
        )}
        <p className="muted small">
          The four components are scored independently, so a single match can earn several
          of them at once.
        </p>
      </div>

      <div className="form-card">
        <div className="rule-card-head">
          <span className="rule-icon">🏅</span>
          <h2>Tournament awards</h2>
        </div>
        <p>
          On top of the matches, pick a player for each tournament award — Golden Ball
          (best player), Golden Boot (top scorer) and Golden Glove (best goalkeeper). Each
          is worth a big bonus if you call it right, and picks lock before the knockouts
          start. Make yours on the <strong>Awards</strong> tab.
        </p>
      </div>

      <div className="form-card">
        <div className="rule-card-head">
          <span className="rule-icon">📈</span>
          <h2>Round multipliers</h2>
        </div>
        <p>Later rounds are worth more. Each match's points are multiplied by:</p>
        <table className="mini-table">
          <tbody>
            {orderedRounds.map((r) => (
              <tr key={r.code}>
                <td>{r.name}</td>
                <td className="num mini-mult">×{r.multiplier}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="form-card">
        <div className="rule-card-head">
          <span className="rule-icon">🧮</span>
          <h2>Worked example</h2>
        </div>
        {c && (
          <p>
            Suppose a Quarter-final (×
            {orderedRounds.find((r) => r.code === 'QF')?.multiplier ?? 2}) ends 2–1 after
            penalties, and that team advances. If you predicted exactly 2–1, the right
            team to advance, and penalties, you'd earn{' '}
            <strong>
              ({c.points_advance} + {c.points_exact} + {c.points_tendency} +{' '}
              {c.points_penalties}) ×{' '}
              {orderedRounds.find((r) => r.code === 'QF')?.multiplier ?? 2} ={' '}
              {(c.points_advance +
                c.points_exact +
                c.points_tendency +
                c.points_penalties) *
                Number(orderedRounds.find((r) => r.code === 'QF')?.multiplier ?? 2)}{' '}
              points
            </strong>
            .
          </p>
        )}
      </div>

      <div className="form-card">
        <div className="rule-card-head">
          <span className="rule-icon">🤝</span>
          <h2>Fair play</h2>
        </div>
        <ul className="rules-list-plain">
          <li>You can only see and edit your own predictions.</li>
          <li>Predictions lock automatically before kick-off — no late changes.</li>
          <li>The admin enters official results; the table updates instantly.</li>
        </ul>
      </div>
    </div>
  )
}
