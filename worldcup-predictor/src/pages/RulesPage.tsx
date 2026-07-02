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
            'Each is worth a big bonus if you call it right, and picks lock when the Round of 32 ends (just before the Round of 16).',
            'Cada uno vale un gran bono si aciertas, y las elecciones se cierran cuando termina la fase de 32 (justo antes de los octavos).',
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

      <div className="form-card">
        <div className="rule-card-head">
          <span className="rule-icon">❓</span>
          <h2>{t('FAQ', 'Preguntas frecuentes')}</h2>
        </div>
        <div className="faq">
          <p className="faq-q">{t('Can I change a pick after making it?', '¿Puedo cambiar un pronóstico después de hacerlo?')}</p>
          <p className="faq-a">
            {t(
              'Yes — edit as many times as you like until that match locks, shortly before kick-off. After it locks, it\'s final.',
              'Sí — edítalo las veces que quieras hasta que ese partido se cierre, poco antes del inicio. Una vez cerrado, es definitivo.',
            )}
          </p>

          <p className="faq-q">{t('When exactly do picks lock?', '¿Cuándo se cierran exactamente los pronósticos?')}</p>
          <p className="faq-a">
            {t(
              'Each match locks a minute before kick-off — its card shows a live "closes in…" countdown. The tournament award picks lock when the Round of 32 ends.',
              'Cada partido se cierra un minuto antes del inicio — su tarjeta muestra una cuenta regresiva "cierra en…". Las elecciones de premios se cierran cuando termina la fase de 32.',
            )}
          </p>

          <p className="faq-q">{t('What if a match goes to extra time or penalties?', '¿Y si un partido va a prórroga o penales?')}</p>
          <p className="faq-a">
            {t(
              'You predict the final score after extra time. A level score means a shootout, and you pick who wins it — getting that right earns the "advancing" points.',
              'Pronosticas el marcador final tras la prórroga. Un marcador igualado significa tanda de penales, y eliges quién la gana — acertar eso otorga los puntos de "avance".',
            )}
          </p>

          <p className="faq-q">{t('How are ties in the table broken?', '¿Cómo se desempata en la tabla?')}</p>
          <p className="faq-a">
            {t(
              'Points first, then most exact scores, then most correct advancing picks. If players are still level, they share the same position.',
              'Primero los puntos, luego más marcadores exactos, luego más aciertos de avance. Si siguen igualados, comparten la misma posición.',
            )}
          </p>

          <p className="faq-q">{t('Can others see my picks before a match?', '¿Otros pueden ver mis pronósticos antes de un partido?')}</p>
          <p className="faq-a">
            {t(
              'No. Your picks stay private until the match locks; then everyone\'s are revealed together on the match page.',
              'No. Tus pronósticos son privados hasta que el partido se cierra; entonces se revelan los de todos en la página del partido.',
            )}
          </p>

          <p className="faq-q">{t('Do results update on their own?', '¿Los resultados se actualizan solos?')}</p>
          <p className="faq-a">
            {t(
              'Yes — scores sync from a live feed within minutes of full-time, day or night. The admin can also enter or correct any result.',
              'Sí — los marcadores se sincronizan desde un feed en vivo a los pocos minutos del final, de día o de noche. El admin también puede ingresar o corregir cualquier resultado.',
            )}
          </p>
        </div>
      </div>

      <div className="form-card">
        <div className="rule-card-head">
          <span className="rule-icon">📌</span>
          <h2>{t('Good to know', 'Para tener en cuenta')}</h2>
        </div>
        <ul className="rules-list-plain">
          <li>{t('This is a private game among friends, just for fun — no real money is involved.', 'Este es un juego privado entre amigos, solo por diversión — no hay dinero real de por medio.')}</li>
          <li>{t('Not affiliated with, or endorsed by, FIFA or the World Cup.', 'No está afiliado ni respaldado por la FIFA ni el Mundial.')}</li>
          <li>{t('Match results come from public data and can occasionally lag or need a fix — the admin\'s entry is final.', 'Los resultados provienen de datos públicos y ocasionalmente pueden demorarse o requerir una corrección — la decisión del admin es definitiva.')}</li>
          <li>{t('Your nickname and emoji are shown to the group; your predictions are yours alone until they lock.', 'Tu apodo y emoji se muestran al grupo; tus pronósticos son solo tuyos hasta que se cierran.')}</li>
        </ul>
      </div>
    </div>
  )
}
