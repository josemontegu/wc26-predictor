import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import type { AppConfig, Round } from '../lib/types'
import { ROUND_ORDER, roundName } from '../lib/format'
import { useT } from '../lib/i18n'
import Spinner from '../components/Spinner'

export default function RulesPage() {
  const t = useT()
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
        <Spinner label={t('Loading rules…', 'Cargando reglas…')} />
      </div>
    )
  }

  const c = config
  const orderedRounds = [...rounds].sort(
    (a, b) => ROUND_ORDER.indexOf(a.code) - ROUND_ORDER.indexOf(b.code),
  )

  return (
    <div className="page">
      <h1>{t('How it works', 'Cómo funciona')}</h1>

      <div className="form-card">
        <div className="rule-card-head">
          <span className="rule-icon">🎯</span>
          <h2>{t('The game', 'El juego')}</h2>
        </div>
        <p>
          {t(
            'Predict every knockout match of the 2026 World Cup, from the Round of 32 to the Final.',
            'Pronostica cada partido de eliminación del Mundial 2026, desde los dieciseisavos hasta la final.',
          )}{' '}
          {t('You call the', 'Tú defines el')}{' '}
          <strong>{t('final score', 'marcador final')}</strong>{' '}
          {t('— after extra time, if it goes there. Whether it goes to', '— tras el tiempo extra, si llega a eso. Si va a')}{' '}
          <strong>{t('penalties', 'penales')}</strong> {t('and', 'y')}{' '}
          <strong>{t('who advances', 'quién avanza')}</strong>{' '}
          {t(
            'then follow automatically: a level final score means a shootout, and you pick the shootout winner.',
            'se determinan automáticamente: un marcador final igualado significa tanda de penales, y tú eliges quién gana la tanda.',
          )}{' '}
          {t(
            'You can edit any time until the match locks, shortly before kick-off.',
            'Puedes editar en cualquier momento hasta que el partido se cierre, poco antes del inicio.',
          )}
        </p>
      </div>

      <div className="form-card">
        <div className="rule-card-head">
          <span className="rule-icon">⚽</span>
          <h2>{t('Points per match', 'Puntos por partido')}</h2>
        </div>
        {c ? (
          <ul className="rules-list">
            <li>
              <span className="rules-pts">{c.points_tendency}</span>{' '}
              {t(
                'Correct result (home win / draw / away win)',
                'Resultado correcto (gana local / empate / gana visitante)',
              )}
            </li>
            <li>
              <span className="rules-pts">+{c.points_exact}</span>{' '}
              {t(
                `Exact final score (on top of the result → ${c.points_tendency + c.points_exact} in all)`,
                `Marcador final exacto (se suma al resultado → ${c.points_tendency + c.points_exact} en total)`,
              )}
            </li>
            <li>
              <span className="rules-pts">{c.points_advance}</span>{' '}
              {t('Correct team advancing', 'Equipo que avanza correcto')}
            </li>
          </ul>
        ) : (
          <p className="muted">{t('Scoring not configured yet.', 'El puntaje aún no está configurado.')}</p>
        )}
        <p className="muted small">
          {t(
            `These stack, so a flawless match (exact score + right team through) is worth ${c ? c.points_tendency + c.points_exact + c.points_advance : 10} before the round multiplier.`,
            `Se acumulan, así que un partido perfecto (marcador exacto + equipo correcto que avanza) vale ${c ? c.points_tendency + c.points_exact + c.points_advance : 10} antes del multiplicador de ronda.`,
          )}
        </p>
      </div>

      <div className="form-card">
        <div className="rule-card-head">
          <span className="rule-icon">🏅</span>
          <h2>{t('Tournament awards', 'Premios del torneo')}</h2>
        </div>
        <p>
          {t(
            'On top of the matches, pick a player for each tournament award — Golden Ball (best player), Golden Boot (top scorer) and Golden Glove (best goalkeeper).',
            'Además de los partidos, elige un jugador para cada premio del torneo: Balón de Oro (mejor jugador), Bota de Oro (máximo goleador) y Guante de Oro (mejor portero).',
          )}{' '}
          {t(
            'Each is worth a big bonus if you call it right, and picks lock before the knockouts start.',
            'Cada uno vale un gran bono si aciertas, y las elecciones se cierran antes de que empiece la fase eliminatoria.',
          )}{' '}
          {t('Make yours on the', 'Haz las tuyas en la pestaña')}{' '}
          <strong>{t('Awards', 'Premios')}</strong> {t('tab.', '.')}
        </p>
      </div>

      <div className="form-card">
        <div className="rule-card-head">
          <span className="rule-icon">📈</span>
          <h2>{t('Round multipliers', 'Multiplicadores de ronda')}</h2>
        </div>
        <p>
          {t(
            "Later rounds are worth more. Each match's points are multiplied by:",
            'Las rondas posteriores valen más. Los puntos de cada partido se multiplican por:',
          )}
        </p>
        <table className="mini-table">
          <tbody>
            {orderedRounds.map((r) => (
              <tr key={r.code}>
                <td>{roundName(r.code)}</td>
                <td className="num mini-mult">×{r.multiplier}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="form-card">
        <div className="rule-card-head">
          <span className="rule-icon">🧮</span>
          <h2>{t('Worked example', 'Ejemplo resuelto')}</h2>
        </div>
        {c && (
          <p>
            {t('Suppose a Quarter-final (×', 'Supongamos que un cuarto de final (×')}
            {orderedRounds.find((r) => r.code === 'QF')?.multiplier ?? 3}
            {t(
              ') ends 2–1 and that team advances. If you predicted exactly 2–1 and the right team to advance, you\'d earn',
              ') termina 2–1 y ese equipo avanza. Si pronosticaste exactamente 2–1 y el equipo correcto que avanza, ganarías',
            )}{' '}
            <strong>
              ({c.points_tendency} + {c.points_exact} + {c.points_advance}) ×{' '}
              {orderedRounds.find((r) => r.code === 'QF')?.multiplier ?? 3} ={' '}
              {(c.points_tendency + c.points_exact + c.points_advance) *
                Number(orderedRounds.find((r) => r.code === 'QF')?.multiplier ?? 3)}{' '}
              {t('points', 'puntos')}
            </strong>
            .
          </p>
        )}
      </div>

      <div className="form-card">
        <div className="rule-card-head">
          <span className="rule-icon">🤝</span>
          <h2>{t('Fair play', 'Juego limpio')}</h2>
        </div>
        <ul className="rules-list-plain">
          <li>{t('You can only see and edit your own predictions.', 'Solo puedes ver y editar tus propios pronósticos.')}</li>
          <li>{t('Predictions lock automatically before kick-off — no late changes.', 'Los pronósticos se cierran automáticamente antes del inicio: nada de cambios tardíos.')}</li>
          <li>{t('The admin enters official results; the table updates instantly.', 'El administrador ingresa los resultados oficiales; la tabla se actualiza al instante.')}</li>
        </ul>
      </div>
    </div>
  )
}
