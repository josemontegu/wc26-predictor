import { AlertTriangle, FileText, Lock, type LucideIcon } from 'lucide-react'
import { Link } from 'react-router-dom'
import { useT } from '../lib/i18n'

// Bilingual [en, es] string.
type Bi = [string, string]
interface Section {
  h: Bi
  p?: Bi[]
  list?: Bi[]
}

const UPDATED: Bi = ['Last updated: 6 July 2026', 'Última actualización: 6 de julio de 2026']

function LegalDoc({
  icon: Icon,
  title,
  intro,
  sections,
}: {
  icon: LucideIcon
  title: Bi
  intro: Bi[]
  sections: Section[]
}) {
  const t = useT()
  return (
    <div className="page legal-page">
      <Link to="/" className="btn btn-ghost back-btn">
        ← {t('Back', 'Atrás')}
      </Link>
      <h1>
        <Icon className="h-icon" aria-hidden="true" /> {t(title[0], title[1])}
      </h1>
      <p className="muted small">{t(UPDATED[0], UPDATED[1])}</p>

      <div className="notice notice-info legal-draft">
        <AlertTriangle className="ic" aria-hidden="true" />{' '}
        {t(
          'Working draft, not legal advice. The details below are sensible defaults. Please confirm them and have a qualified professional review this document before an official launch.',
          'Borrador de trabajo, no es asesoramiento legal. Los datos a continuación son valores razonables por defecto. Por favor confírmalos y haz que un profesional cualificado revise este documento antes de un lanzamiento oficial.',
        )}
      </div>

      {intro.map((p, i) => (
        <p key={`intro-${i}`}>{t(p[0], p[1])}</p>
      ))}

      {sections.map((s, i) => (
        <section className="legal-section" key={i}>
          <h2>{t(s.h[0], s.h[1])}</h2>
          {s.p?.map((p, j) => (
            <p key={j}>{t(p[0], p[1])}</p>
          ))}
          {s.list && (
            <ul className="rules-list-plain">
              {s.list.map((li, j) => (
                <li key={j}>{t(li[0], li[1])}</li>
              ))}
            </ul>
          )}
        </section>
      ))}

      <p className="muted small legal-foot">
        {t('See also our ', 'Consulta también nuestra ')}
        <Link to={Icon === FileText ? '/privacy' : '/terms'}>
          {Icon === FileText
            ? t('Privacy Policy', 'Política de Privacidad')
            : t('Terms of Service', 'Términos del Servicio')}
        </Link>
        .
      </p>
    </div>
  )
}

export function TermsPage() {
  return (
    <LegalDoc
      icon={FileText}
      title={['Terms of Service', 'Términos del Servicio']}
      intro={[
        [
          'Polla LDF ("the Service") is a free, private, for-entertainment prediction game operated by José Montegú. By creating an account or using the Service, you agree to these Terms. If you do not agree, please do not use the Service.',
          'Polla LDF ("el Servicio") es un juego de pronósticos gratuito, privado y con fines de entretenimiento, operado por José Montegú. Al crear una cuenta o usar el Servicio, aceptas estos Términos. Si no estás de acuerdo, no uses el Servicio.',
        ],
      ]}
      sections={[
        {
          h: ['1. Eligibility', '1. Elegibilidad'],
          p: [
            [
              'You must be at least 18 years old and able to form a binding agreement to use the Service. You agree to provide accurate information and to keep it up to date.',
              'Debes tener al menos 18 años y capacidad para celebrar un acuerdo vinculante para usar el Servicio. Aceptas proporcionar información veraz y mantenerla actualizada.',
            ],
          ],
        },
        {
          h: ['2. Your account', '2. Tu cuenta'],
          p: [
            [
              'Sign-in is passwordless: we email you a one-time magic link. You are responsible for keeping access to your email secure and for all activity under your account. Do not share your account, impersonate others, or create more than one account.',
              'El inicio de sesión no usa contraseña: te enviamos un enlace de acceso de un solo uso por correo. Eres responsable de mantener seguro el acceso a tu correo y de toda la actividad de tu cuenta. No compartas tu cuenta, no suplantes a otras personas ni crees más de una cuenta.',
            ],
          ],
        },
        {
          h: ['3. Fair play', '3. Juego limpio'],
          p: [
            [
              'The game depends on everyone playing fairly. By using the Service you agree that:',
              'El juego depende de que todos jueguen limpio. Al usar el Servicio, aceptas que:',
            ],
          ],
          list: [
            [
              'Predictions lock shortly before kick-off and are final once locked.',
              'Los pronósticos se cierran poco antes del inicio y son definitivos una vez cerrados.',
            ],
            [
              'The administrator enters official results and configures scoring; their decisions on results, scoring and standings are final.',
              'El administrador ingresa los resultados oficiales y configura la puntuación; sus decisiones sobre resultados, puntuación y clasificación son definitivas.',
            ],
            [
              'You will not cheat, exploit bugs, use automated access, or otherwise gain an unfair advantage.',
              'No harás trampa, no explotarás errores, no usarás acceso automatizado ni obtendrás ventajas indebidas de otro modo.',
            ],
            [
              'Your nickname and emoji are visible to your pool. Keep them appropriate and non-offensive.',
              'Tu apodo y emoji son visibles para tu grupo. Mantenlos apropiados y no ofensivos.',
            ],
          ],
        },
        {
          h: ['4. No gambling, no prizes', '4. Sin apuestas ni premios'],
          p: [
            [
              'The Service is for entertainment among friends only. It does not involve real-money betting, wagering, or any purchase, and awards no prizes. If a pool ever chooses to attach prizes, that arrangement is organised solely by its participants, is not part of the Service, and must comply with all applicable laws.',
              'El Servicio es solo para entretenimiento entre amigos. No implica apuestas con dinero real ni compra alguna, y no otorga premios. Si un grupo decide asociar premios, ese acuerdo lo organizan únicamente sus participantes, no forma parte del Servicio y debe cumplir todas las leyes aplicables.',
            ],
          ],
        },
        {
          h: ['5. Results and data accuracy', '5. Exactitud de resultados y datos'],
          p: [
            [
              'Match results and fixtures may be drawn from third-party sports data sources. This data may be delayed, incomplete or inaccurate, and is provided without guarantee. Where a source conflicts with reality, the administrator’s entered result is authoritative.',
              'Los resultados y partidos pueden provenir de fuentes de datos deportivos de terceros. Estos datos pueden estar retrasados, incompletos o ser inexactos, y se ofrecen sin garantía. Cuando una fuente contradiga la realidad, el resultado ingresado por el administrador prevalece.',
            ],
          ],
        },
        {
          h: ['6. Your content', '6. Tu contenido'],
          p: [
            [
              'You retain your nickname, emoji and predictions. You grant José Montegú a non-exclusive licence to store, process and display them to the members of your pool as needed to operate the game.',
              'Conservas tu apodo, emoji y pronósticos. Otorgas a José Montegú una licencia no exclusiva para almacenarlos, procesarlos y mostrarlos a los miembros de tu grupo según sea necesario para operar el juego.',
            ],
          ],
        },
        {
          h: ['7. Availability and changes', '7. Disponibilidad y cambios'],
          p: [
            [
              'The Service is provided "as is" and "as available". We may modify, suspend or discontinue any part of it at any time, and downtime or data loss may occur. We are not obligated to maintain any feature.',
              'El Servicio se ofrece "tal cual" y "según disponibilidad". Podemos modificar, suspender o discontinuar cualquier parte en cualquier momento, y pueden producirse interrupciones o pérdida de datos. No estamos obligados a mantener ninguna funcionalidad.',
            ],
          ],
        },
        {
          h: ['8. Acceptable use', '8. Uso aceptable'],
          p: [
            [
              'You agree not to probe, scan or breach security; scrape or bulk-extract data; disrupt or overload the Service; reverse engineer it; or use it for any unlawful purpose.',
              'Aceptas no sondear, escanear ni vulnerar la seguridad; no extraer datos de forma masiva; no interrumpir ni sobrecargar el Servicio; no aplicar ingeniería inversa; ni usarlo con fines ilícitos.',
            ],
          ],
        },
        {
          h: ['9. Intellectual property', '9. Propiedad intelectual'],
          p: [
            [
              'The Service, including its code, design and content (other than your own content and third-party data), is owned by José Montegú and protected by law. No rights are granted to you except the limited right to use the Service under these Terms.',
              'El Servicio, incluidos su código, diseño y contenido (salvo tu propio contenido y los datos de terceros), es propiedad de José Montegú y está protegido por la ley. No se te otorga ningún derecho salvo el derecho limitado a usar el Servicio conforme a estos Términos.',
            ],
          ],
        },
        {
          h: ['10. No affiliation', '10. Sin afiliación'],
          p: [
            [
              'The Service is independent and is not affiliated with, endorsed by, sponsored by, or associated with FIFA, the FIFA World Cup, or any football association, team or player. All trademarks, team names and related marks belong to their respective owners and are used for identification only.',
              'El Servicio es independiente y no está afiliado, respaldado, patrocinado ni asociado con la FIFA, la Copa Mundial de la FIFA, ni ninguna asociación, equipo o jugador de fútbol. Todas las marcas, nombres de equipos y marcas relacionadas pertenecen a sus respectivos titulares y se usan solo con fines de identificación.',
            ],
          ],
        },
        {
          h: ['11. Termination', '11. Terminación'],
          p: [
            [
              'We may suspend or terminate your access if you breach these Terms or misuse the Service. You may stop using the Service at any time and request deletion of your account (see the Privacy Policy).',
              'Podemos suspender o cancelar tu acceso si incumples estos Términos o haces mal uso del Servicio. Puedes dejar de usar el Servicio en cualquier momento y solicitar la eliminación de tu cuenta (consulta la Política de Privacidad).',
            ],
          ],
        },
        {
          h: ['12. Disclaimers and limitation of liability', '12. Renuncias y limitación de responsabilidad'],
          p: [
            [
              'To the fullest extent permitted by law, the Service is provided without warranties of any kind, express or implied. José Montegú will not be liable for any indirect, incidental, special or consequential damages, or for any loss of data, arising from your use of the Service. Nothing in these Terms limits liability that cannot be limited by law.',
              'En la máxima medida permitida por la ley, el Servicio se ofrece sin garantías de ningún tipo, expresas o implícitas. José Montegú no será responsable de daños indirectos, incidentales, especiales o consecuentes, ni de la pérdida de datos, derivados de tu uso del Servicio. Nada en estos Términos limita la responsabilidad que no pueda limitarse por ley.',
            ],
          ],
        },
        {
          h: ['13. Governing law', '13. Ley aplicable'],
          p: [
            [
              'These Terms are governed by the laws of Chile, without regard to its conflict-of-law rules. Disputes will be subject to the courts of Chile, except where mandatory local law provides otherwise.',
              'Estos Términos se rigen por las leyes de Chile, sin perjuicio de sus normas de conflicto de leyes. Las controversias se someterán a los tribunales de Chile, salvo que la ley local imperativa disponga otra cosa.',
            ],
          ],
        },
        {
          h: ['14. Changes to these Terms', '14. Cambios en estos Términos'],
          p: [
            [
              'We may update these Terms from time to time. Material changes will be reflected by the "Last updated" date above. Continued use of the Service after changes take effect means you accept the updated Terms.',
              'Podemos actualizar estos Términos ocasionalmente. Los cambios importantes se reflejarán en la fecha de "Última actualización" anterior. El uso continuado del Servicio tras la entrada en vigor de los cambios implica que aceptas los Términos actualizados.',
            ],
          ],
        },
        {
          h: ['15. Contact', '15. Contacto'],
          p: [
            [
              'Questions about these Terms? Contact us at jpmontegu@gmail.com.',
              '¿Preguntas sobre estos Términos? Escríbenos a jpmontegu@gmail.com.',
            ],
          ],
        },
      ]}
    />
  )
}

export function PrivacyPage() {
  return (
    <LegalDoc
      icon={Lock}
      title={['Privacy Policy', 'Política de Privacidad']}
      intro={[
        [
          'This Privacy Policy explains what personal data Polla LDF (the "Service", operated by José Montegú) collects, how it is used, and your rights. We aim to collect as little as possible.',
          'Esta Política de Privacidad explica qué datos personales recopila Polla LDF (el "Servicio", operado por José Montegú), cómo se utilizan y cuáles son tus derechos. Buscamos recopilar lo mínimo posible.',
        ],
      ]}
      sections={[
        {
          h: ['1. Information we collect', '1. Información que recopilamos'],
          list: [
            [
              'Account: your email address, used only to sign you in via a magic link.',
              'Cuenta: tu correo electrónico, usado únicamente para iniciar sesión mediante un enlace de acceso.',
            ],
            [
              'Profile: the nickname and emoji avatar you choose.',
              'Perfil: el apodo y el emoji que eliges.',
            ],
            [
              'Game activity: your match predictions, tournament award picks, and the scores and standings derived from them.',
              'Actividad de juego: tus pronósticos, tus elecciones de premios, y las puntuaciones y clasificaciones derivadas de ellos.',
            ],
            [
              'Technical data: standard diagnostic and log data (such as IP address, timestamps and device/browser information) processed by our hosting and authentication providers as part of normal operation and security.',
              'Datos técnicos: datos de diagnóstico y registro habituales (como dirección IP, marcas de tiempo e información de dispositivo/navegador) procesados por nuestros proveedores de alojamiento y autenticación como parte del funcionamiento y la seguridad normales.',
            ],
          ],
          p: [
            [
              'We do not collect passwords (sign-in is passwordless), we do not collect payment information, and we do not use advertising or third-party tracking cookies.',
              'No recopilamos contraseñas (el inicio de sesión no usa contraseña), no recopilamos información de pago y no usamos cookies de publicidad ni de rastreo de terceros.',
            ],
          ],
        },
        {
          h: ['2. How we use your data', '2. Cómo usamos tus datos'],
          p: [
            [
              'We use your data to authenticate you, run the prediction game, calculate and display standings, keep the Service secure, and send the essential sign-in emails you request. We do not sell your data.',
              'Usamos tus datos para autenticarte, operar el juego de pronósticos, calcular y mostrar las clasificaciones, mantener el Servicio seguro y enviarte los correos de inicio de sesión que solicitas. No vendemos tus datos.',
            ],
          ],
        },
        {
          h: ['3. Legal bases', '3. Bases legales'],
          p: [
            [
              'Where applicable law (such as the GDPR) requires it, we rely on: performance of our agreement with you (to run the game you signed up for); our legitimate interests (to keep the Service secure and working); and your consent (to send the sign-in email you request). You can withdraw consent at any time by not using the Service.',
              'Cuando la ley aplicable (como el RGPD) lo exige, nos basamos en: la ejecución de nuestro acuerdo contigo (para operar el juego en el que te inscribiste); nuestros intereses legítimos (para mantener el Servicio seguro y funcional); y tu consentimiento (para enviarte el correo de acceso que solicitas). Puedes retirar el consentimiento en cualquier momento dejando de usar el Servicio.',
            ],
          ],
        },
        {
          h: ['4. What other players can see', '4. Qué pueden ver otros jugadores'],
          p: [
            [
              'Your nickname and emoji are visible to the members of your pool. Your predictions become visible to your pool only after a match locks (before that, they are private). Standings are visible within your pool. Your email address is never shown to other players. The Service is private to your pool and not published to the public web.',
              'Tu apodo y emoji son visibles para los miembros de tu grupo. Tus pronósticos se hacen visibles para tu grupo solo después de que el partido se cierra (antes son privados). Las clasificaciones son visibles dentro de tu grupo. Tu correo electrónico nunca se muestra a otros jugadores. El Servicio es privado para tu grupo y no se publica en la web abierta.',
            ],
          ],
        },
        {
          h: ['5. Service providers', '5. Proveedores de servicios'],
          p: [
            [
              'We use trusted third parties to run the Service: Supabase (database, authentication and email delivery) and our static hosting provider. Match results are fetched from public third-party sports data sources, which do not involve your personal data. These providers process data on our behalf under their own terms and security measures.',
              'Usamos terceros de confianza para operar el Servicio: Supabase (base de datos, autenticación y envío de correos) y nuestro proveedor de alojamiento estático. Los resultados de los partidos se obtienen de fuentes públicas de datos deportivos de terceros, que no implican tus datos personales. Estos proveedores procesan datos en nuestro nombre bajo sus propios términos y medidas de seguridad.',
            ],
          ],
        },
        {
          h: ['6. International transfers', '6. Transferencias internacionales'],
          p: [
            [
              'Your data may be stored and processed in a country other than your own, depending on our providers’ infrastructure region. Where required, we rely on appropriate safeguards for such transfers.',
              'Tus datos pueden almacenarse y procesarse en un país distinto al tuyo, según la región de infraestructura de nuestros proveedores. Cuando es necesario, aplicamos las salvaguardas apropiadas para dichas transferencias.',
            ],
          ],
        },
        {
          h: ['7. Data retention', '7. Conservación de datos'],
          p: [
            [
              'We keep your account and game data while your account is active. You can ask us to delete your account and associated personal data at any time (see "Your rights"). Some minimal technical logs may be retained by our providers for a limited period for security and diagnostics.',
              'Conservamos tu cuenta y datos de juego mientras tu cuenta esté activa. Puedes solicitarnos la eliminación de tu cuenta y los datos personales asociados en cualquier momento (consulta "Tus derechos"). Algunos registros técnicos mínimos pueden conservarse por nuestros proveedores durante un periodo limitado por seguridad y diagnóstico.',
            ],
          ],
        },
        {
          h: ['8. Your rights', '8. Tus derechos'],
          p: [
            [
              'Subject to applicable law, you may request access to, correction of, deletion of, or a copy of your personal data, and object to or restrict certain processing. To exercise any of these, contact us at jpmontegu@gmail.com. You also have the right to lodge a complaint with your local data protection authority.',
              'Sujeto a la ley aplicable, puedes solicitar el acceso, la rectificación, la eliminación o una copia de tus datos personales, y oponerte o restringir ciertos tratamientos. Para ejercer cualquiera de estos derechos, escríbenos a jpmontegu@gmail.com. También tienes derecho a presentar una reclamación ante tu autoridad local de protección de datos.',
            ],
          ],
        },
        {
          h: ['9. Security', '9. Seguridad'],
          p: [
            [
              'Data is encrypted in transit, and access is restricted at the database level (Row-Level Security) so that players can only reach their own predictions and cannot read others’ before a match locks. No method of transmission or storage is completely secure, and we cannot guarantee absolute security.',
              'Los datos se cifran en tránsito y el acceso está restringido a nivel de base de datos (Row-Level Security), de modo que cada jugador solo puede acceder a sus propios pronósticos y no puede leer los de otros antes de que el partido se cierre. Ningún método de transmisión o almacenamiento es completamente seguro, y no podemos garantizar una seguridad absoluta.',
            ],
          ],
        },
        {
          h: ['10. Local storage', '10. Almacenamiento local'],
          p: [
            [
              'We store small items in your browser to run the Service: your session, your language and theme preferences, and the demo-mode flag. These are not used for advertising or cross-site tracking.',
              'Guardamos pequeños elementos en tu navegador para operar el Servicio: tu sesión, tus preferencias de idioma y tema, y el indicador del modo demostración. No se usan para publicidad ni rastreo entre sitios.',
            ],
          ],
        },
        {
          h: ['11. Children', '11. Menores'],
          p: [
            [
              'The Service is not directed to children under 18. We do not knowingly collect personal data from them. If you believe a child has provided us data, contact us and we will delete it.',
              'El Servicio no está dirigido a menores de 18 años. No recopilamos conscientemente datos personales de ellos. Si crees que un menor nos ha proporcionado datos, contáctanos y los eliminaremos.',
            ],
          ],
        },
        {
          h: ['12. Changes to this policy', '12. Cambios en esta política'],
          p: [
            [
              'We may update this Privacy Policy from time to time; the "Last updated" date above reflects the latest version.',
              'Podemos actualizar esta Política de Privacidad ocasionalmente; la fecha de "Última actualización" anterior refleja la versión más reciente.',
            ],
          ],
        },
        {
          h: ['13. Contact', '13. Contacto'],
          p: [
            [
              'For any privacy question or request, contact us at jpmontegu@gmail.com.',
              'Para cualquier consulta o solicitud de privacidad, escríbenos a jpmontegu@gmail.com.',
            ],
          ],
        },
      ]}
    />
  )
}
