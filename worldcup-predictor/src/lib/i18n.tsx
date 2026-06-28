import {
  createContext,
  useCallback,
  useContext,
  useState,
  type ReactNode,
} from 'react'

// Lightweight bilingual i18n. Components call `const t = useT()` and wrap any
// user-facing string as `t('English', 'Español')`. English doubles as the key,
// so there are no missing-translation gaps. The chosen language is persisted and
// also exposed via getLang() for non-component helpers (date/round formatting).

export type Lang = 'en' | 'es'

const KEY = 'wc26_lang'

// Module-level mirror of the active language so plain functions (formatters)
// can read it without a hook. Kept in sync by getInitialLang() and setLang().
let current: Lang = 'en'

export function getInitialLang(): Lang {
  try {
    const s = localStorage.getItem(KEY)
    if (s === 'en' || s === 'es') {
      current = s
      return s
    }
  } catch {
    /* ignore */
  }
  try {
    if (typeof navigator !== 'undefined' && navigator.language?.toLowerCase().startsWith('es')) {
      current = 'es'
      return 'es'
    }
  } catch {
    /* ignore */
  }
  current = 'en'
  return 'en'
}

/** Current language for non-React helpers (e.g. date/round formatting). */
export function getLang(): Lang {
  return current
}

interface LangCtx {
  lang: Lang
  setLang: (l: Lang) => void
}

const LangContext = createContext<LangCtx>({ lang: 'en', setLang: () => {} })

export function LangProvider({ children }: { children: ReactNode }) {
  const [lang, setLangState] = useState<Lang>(getInitialLang())

  const setLang = useCallback((l: Lang) => {
    current = l
    setLangState(l)
    try {
      localStorage.setItem(KEY, l)
    } catch {
      /* ignore */
    }
    try {
      document.documentElement.setAttribute('lang', l)
    } catch {
      /* ignore */
    }
  }, [])

  return <LangContext.Provider value={{ lang, setLang }}>{children}</LangContext.Provider>
}

export function useLang() {
  return useContext(LangContext)
}

export type TFn = (en: string, es: string) => string

/** Returns a `t(en, es)` translator bound to the current language. */
export function useT(): TFn {
  const { lang } = useLang()
  return useCallback((en: string, es: string) => (lang === 'es' ? es : en), [lang])
}
