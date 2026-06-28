import React from 'react'
import ReactDOM from 'react-dom/client'
import { HashRouter } from 'react-router-dom'
import App from './App'
import { AuthProvider } from './context/AuthContext'
import { applyTheme, getInitialTheme } from './lib/theme'
import { LangProvider, getInitialLang } from './lib/i18n'
import './index.css'

applyTheme(getInitialTheme())
document.documentElement.setAttribute('lang', getInitialLang())

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <HashRouter>
      <LangProvider>
        <AuthProvider>
          <App />
        </AuthProvider>
      </LangProvider>
    </HashRouter>
  </React.StrictMode>,
)
