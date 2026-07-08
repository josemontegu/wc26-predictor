import { type ReactNode } from 'react'
import { Link, NavLink } from 'react-router-dom'
import { BarChart3, BookOpen, GitFork, ListOrdered, Target, Trophy, Wrench } from 'lucide-react'
import { useAuth } from '../context/AuthContext'
import { DEMO } from '../lib/supabase'
import { useT } from '../lib/i18n'
import ThemeToggle from './ThemeToggle'
import LangToggle from './LangToggle'

export default function Layout({ children }: { children: ReactNode }) {
  const { isAdmin, profile } = useAuth()
  const t = useT()

  const tabs = [
    { to: '/', label: t('Matches', 'Partidos'), Icon: Target, end: true },
    { to: '/bracket', label: t('Bracket', 'Llave'), Icon: GitFork, end: false },
    { to: '/awards', label: t('Awards', 'Premios'), Icon: Trophy, end: false },
    { to: '/leaderboard', label: t('Table', 'Tabla'), Icon: ListOrdered, end: false },
    { to: '/stats', label: t('Stats', 'Stats'), Icon: BarChart3, end: false },
    { to: '/rules', label: t('Rules', 'Reglas'), Icon: BookOpen, end: false },
  ]

  return (
    <div className="app-shell">
      <header className="app-header">
        <div className="app-header-inner">
          <Link to="/" className="brand" aria-label={t('Home', 'Inicio')}>
            <span className="brand-badge">⚽</span>
            <span className="brand-word">
              Polla <span className="brand-accent">LDF</span>
            </span>
          </Link>
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
        {tabs.map((tab) => (
          <NavLink
            key={tab.to}
            to={tab.to}
            end={tab.end}
            className={({ isActive }) => `tab ${isActive ? 'tab-active' : ''}`}
          >
            <tab.Icon className="tab-icon" size={22} strokeWidth={2} aria-hidden="true" />
            <span className="tab-label">{tab.label}</span>
          </NavLink>
        ))}
        {isAdmin && (
          <NavLink
            to="/admin"
            className={({ isActive }) => `tab ${isActive ? 'tab-active' : ''}`}
          >
            <Wrench className="tab-icon" size={22} strokeWidth={2} aria-hidden="true" />
            <span className="tab-label">{t('Admin', 'Admin')}</span>
          </NavLink>
        )}
      </nav>
    </div>
  )
}
