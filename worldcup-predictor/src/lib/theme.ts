export type Theme = 'light' | 'dark'

const KEY = 'wc26_theme'

export function getInitialTheme(): Theme {
  try {
    const s = localStorage.getItem(KEY)
    if (s === 'light' || s === 'dark') return s
  } catch {
    /* ignore */
  }
  if (typeof window !== 'undefined' && window.matchMedia?.('(prefers-color-scheme: dark)').matches) {
    return 'dark'
  }
  return 'light'
}

export function applyTheme(t: Theme) {
  document.documentElement.setAttribute('data-theme', t)
  const meta = document.querySelector('meta[name="theme-color"]')
  if (meta) meta.setAttribute('content', t === 'dark' ? '#0a0f1a' : '#0b1f3a')
}

export function setTheme(t: Theme) {
  applyTheme(t)
  try {
    localStorage.setItem(KEY, t)
  } catch {
    /* ignore */
  }
}
