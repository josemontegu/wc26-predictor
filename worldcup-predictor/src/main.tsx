import React from 'react'
import ReactDOM from 'react-dom/client'
import { HashRouter } from 'react-router-dom'
import App from './App'
import ErrorBoundary from './components/ErrorBoundary'
import { AuthProvider } from './context/AuthContext'
import { applyTheme, getInitialTheme } from './lib/theme'
import { LangProvider, getInitialLang } from './lib/i18n'
import { initMonitoring } from './lib/monitoring'
// Self-hosted Inter (variable, with optical sizing) — one family for body and
// display; no Google Fonts CDN dependency.
import '@fontsource-variable/inter/opsz.css'
// A distinct display face for headings + wordmark only (body stays Inter).
import '@fontsource-variable/bricolage-grotesque/wght.css'
import './index.css'

applyTheme(getInitialTheme())
document.documentElement.setAttribute('lang', getInitialLang())
// Fire-and-forget: a no-op unless VITE_SENTRY_DSN is configured.
void initMonitoring()

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <ErrorBoundary>
      <HashRouter>
        <LangProvider>
          <AuthProvider>
            <App />
          </AuthProvider>
        </LangProvider>
      </HashRouter>
    </ErrorBoundary>
  </React.StrictMode>,
)
