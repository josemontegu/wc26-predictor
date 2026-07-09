import { useEffect, useState } from 'react'
import { BookOpen, Calculator, Goal, Handshake, Pin, Target, TrendingUp, Trophy, Zap } from 'lucide-react'
import { Link } from 'react-router-dom'
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
      <h1><BookOpen className="h-icon" aria-hidden="true" /> {t('How it works', 'Cómo funciona')}</h1>

      <div className="form-card">
        <div className="rule-card-head">
          <Target className="rule-icon" size={20} aria-hidden="true" />
          <h2>{t('The game', 'El juego')}</h2>
        </div>
        <ul className="rules-list-plain">
          <li>
            {t(
              'Predict every knockout match of the 2026 World Cup, from the Round of 32 to the Final.',
              'Pronostica cada partido de eliminación del Mundial 2026, desde los dieciseisavos hasta la final.',
            )}
          </li>
          <li>
            {t('You set one thing per match: the', 'Defines una sola cosa por partido: el')}{' '}
            <strong>{t('final score', 'marcador final')}</strong>{' '}
            {t('(after extra time, if it goes there).', '(tras el tiempo extra, si llega a eso).')}
          </li>
          <li>
            <strong>{t('Who advances', 'Quién avanza')}</strong>{' '}
            {t('and whether it went to', 'y si se definió por')}{' '}
            <strong>{t('penalties', 'penales')}</strong>{' '}
            {t(
              'follow from your score. If you predict a draw, you pick who wins the shootout.',
              'se derivan de tu marcador. Si pronosticas un empate, eliges quién gana la tanda.',
            )}
          </li>
          <li>
            {t(
              'Edit as often as you like until the match locks, shortly before kick-off.',
              'Edita las veces que quieras hasta que el partido se cierre, poco antes del inicio.',
            )}
          </li>
        </ul>
      </div>

      <div className="form-card">
        <div className="rule-card-head">
          <Goal className="rule-icon" size={20} aria-hidden="true" />
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
          <TrendingUp className="rule-icon" size={20} aria-hidden="true" />
          <h2>{t('Round multipliers', 'Multiplicadores de ronda')}</h2>
        </div>
        <p>
          {t(
            "Later rounds are worth more. Each match's points are multiplied by:",
            'Las rondas posteriores valen más. Los puntos de cada partido se multiplican por:',
          )}
        </p>
        <div className="mult-rows">
          {orderedRounds.map((r) => (
            <div className="mult-row" key={r.code}>
              <span className="mult-name">{roundName(r.code)}</span>
              <span className="mult-x">×{r.multiplier}</span>
            </div>
          ))}
        </div>
      </div>

      <div className="form-card">
        <div className="rule-card-head">
          <Calculator className="rule-icon" size={20} aria-hidden="true" />
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
          <Trophy className="rule-icon" size={20} aria-hidden="true" />
          <h2>{t('Tournament awards', 'Premios del torneo')}</h2>
        </div>
        <ul className="rules-list-plain">
          <li>
            {t(
              'Pick a player for each tournament award: Golden Ball (best player), Golden Boot (top scorer) and Golden Glove (best goalkeeper).',
              'Elige un jugador para cada premio del torneo: Balón de Oro (mejor jugador), Bota de Oro (máximo goleador) y Guante de Oro (mejor portero).',
            )}
          </li>
          <li>{t('Each is worth a big bonus if you call it right.', 'Cada uno vale un gran bono si aciertas.')}</li>
          <li>
            {t(
              'Award picks lock when the Round of 32 ends (just before the Round of 16), earlier than a normal match lock.',
              'Las elecciones de premios se cierran cuando termina la fase de 32 (justo antes de los octavos), antes que el cierre normal de un partido.',
            )}
          </li>
          <li>
            {t('Make yours on the', 'Haz las tuyas en la pestaña')}{' '}
            <strong>{t('Awards', 'Premios')}</strong> {t('tab.', '.')}
          </li>
        </ul>
      </div>

      <div className="form-card">
        <div className="rule-card-head">
          <Zap className="rule-icon" size={20} aria-hidden="true" />
          <h2>{t('Bullets', 'Bullets')}</h2>
        </div>
        <ul className="rules-list-plain">
          <li>
            {t(
              'Every so often a big match gets a Bullet: a quick yes/no call, like "Will Ronaldo score?".',
              'De vez en cuando un partido grande tiene un Bullet: una apuesta rápida de sí/no, como "¿Marcará Ronaldo?".',
            )}
          </li>
          <li>
            {t(
              'It\'s worth a flat bonus (shown on the card), never multiplied by the round.',
              'Vale un bono fijo (indicado en la tarjeta), nunca se multiplica por la ronda.',
            )}
          </li>
          <li>
            {t(
              'All or nothing: it only counts if everyone who predicted that match also answers the Bullet before kick-off. If anyone misses it, it counts for no one.',
              'Todo o nada: solo cuenta si todos los que pronosticaron ese partido también responden el Bullet antes del inicio. Si alguien no responde, no cuenta para nadie.',
            )}
          </li>
          <li>
            {t(
              'It locks with the match, everyone\'s calls are revealed afterwards, and answering is optional.',
              'Se cierra con el partido, las respuestas de todos se revelan después, y responder es opcional.',
            )}
          </li>
        </ul>
      </div>

      <div className="form-card">
        <div className="rule-card-head">
          <Handshake className="rule-icon" size={20} aria-hidden="true" />
          <h2>{t('Fair play', 'Juego limpio')}</h2>
        </div>
        <ul className="rules-list-plain">
          <li>
            {t(
              'You can only see and edit your own predictions. Once a match locks, everyone\'s picks are revealed together on its page.',
              'Solo puedes ver y editar tus propios pronósticos. Cuando un partido se cierra, los pronósticos de todos se revelan juntos en su página.',
            )}
          </li>
          <li>
            {t(
              'Ties in the table are broken by points, then exact scores, then correct advancing picks. Still level? They share the same position.',
              'Los empates en la tabla se resuelven por puntos, luego marcadores exactos, luego aciertos de avance. ¿Siguen igualados? Comparten la misma posición.',
            )}
          </li>
          <li>
            {t(
              'The admin enters official results, and scores also sync automatically from a live feed within minutes of full-time, day or night.',
              'El administrador ingresa los resultados oficiales, y los marcadores también se sincronizan automáticamente desde un feed en vivo a los pocos minutos del final, de día o de noche.',
            )}
          </li>
        </ul>
      </div>

      <div className="form-card">
        <div className="rule-card-head">
          <Pin className="rule-icon" size={20} aria-hidden="true" />
          <h2>{t('Good to know', 'Para tener en cuenta')}</h2>
        </div>
        <ul className="rules-list-plain">
          <li>{t('This is a private game among friends, just for fun. No real money is involved.', 'Este es un juego privado entre amigos, solo por diversión. No hay dinero real de por medio.')}</li>
          <li>{t('Not affiliated with, or endorsed by, FIFA or the World Cup.', 'No está afiliado ni respaldado por la FIFA ni el Mundial.')}</li>
        </ul>
      </div>

      <p className="muted small legal-links">
        <Link to="/terms">{t('Terms of Service', 'Términos del Servicio')}</Link>
        {' · '}
        <Link to="/privacy">{t('Privacy Policy', 'Política de Privacidad')}</Link>
      </p>
    </div>
  )
}
