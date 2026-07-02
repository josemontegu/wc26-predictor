import { type ReactNode } from 'react'
import { Link, NavLink } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { DEMO } from '../lib/supabase'
import { useT } from '../lib/i18n'
import ThemeToggle from './ThemeToggle'
import LangToggle from './LangToggle'

export default function Layout({ children }: { children: ReactNode }) {
  const { isAdmin, profile } = useAuth()
  const t = useT()

  const tabs = [
    { to: '/', label: t('Matches', 'Partidos'), icon: '⚽', end: true },
    { to: '/bracket', label: t('Bracket', 'Llave'), icon: '🗺️', end: false },
    { to: '/awards', label: t('Awards', 'Premios'), icon: '🏅', end: false },
    { to: '/leaderboard', label: t('Table', 'Tabla'), icon: '🏆', end: false },
    { to: '/stats', label: t('Stats', 'Stats'), icon: '📊', end: false },
    { to: '/rules', label: t('Info', 'Info'), icon: 'ℹ️', end: false },
  ]

  return (
    <div className="app-shell">
      <header className="app-header">
        <div className="app-header-inner">
          <span className="brand">
            <span className="brand-badge">⚽</span>
            <span className="brand-word">
              Polla <span className="brand-accent">LDF</span>
            </span>
          </span>
          <span className="brand-right">
            {DEMO && <span className="demo-badge">Demo</span>}
            {profile?.nickname && (
              <Link to="/profile" className="brand-nick" aria-label={t('Your profile', 'Tu perfil')}>
                {profile.emoji && <span className="brand-nick-emoji">{profile.emoji}</span>}
                {profile.nickname}
              </Link>
            )}
            <LangToggle />
            <ThemeToggle />
          </span>
        </div>
      </header>

      <main className="app-main">{children}</main>

      <nav className="tab-bar">
        {tabs.map((t) => (
          <NavLink
            key={t.to}
            to={t.to}
            end={t.end}
            className={({ isActive }) => `tab ${isActive ? 'tab-active' : ''}`}
          >
            <span className="tab-icon">{t.icon}</span>
            <span className="tab-label">{t.label}</span>
          </NavLink>
        ))}
        {isAdmin && (
          <NavLink
            to="/admin"
            className={({ isActive }) => `tab ${isActive ? 'tab-active' : ''}`}
          >
            <span className="tab-icon">🛠️</span>
            <span className="tab-label">{t('Admin', 'Admin')}</span>
          </NavLink>
        )}
      </nav>
    </div>
  )
}
