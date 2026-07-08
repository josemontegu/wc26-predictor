import { Languages } from 'lucide-react'
import { useLang } from '../lib/i18n'

export default function LangToggle() {
  const { lang, setLang } = useLang()
  const next = lang === 'en' ? 'es' : 'en'
  return (
    <button
      className="lang-toggle"
      onClick={() => setLang(next)}
      aria-label={lang === 'en' ? 'Cambiar a español' : 'Switch to English'}
      title={lang === 'en' ? 'Español' : 'English'}
    >
      <Languages size={19} aria-hidden="true" />
    </button>
  )
}
