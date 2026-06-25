import { type ReactNode } from 'react'
import { NavLink } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { DEMO } from '../lib/supabase'
import ThemeToggle from './ThemeToggle'

const tabs = [
  { to: '/', label: 'Matches', icon: '⚽', end: true },
  { to: '/bracket', label: 'Bracket', icon: '🗺️', end: false },
  { to: '/awards', label: 'Awards', icon: '🏅', end: false },
  { to: '/leaderboard', label: 'Table', icon: '🏆', end: false },
  { to: '/rules', label: 'Rules', icon: '📖', end: false },
  { to: '/profile', label: 'You', icon: '👤', end: false },
]

export default function Layout({ children }: { children: ReactNode }) {
  const { isAdmin, profile } = useAuth()

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
              <span className="brand-nick">
                {profile.emoji && <span className="brand-nick-emoji">{profile.emoji}</span>}
                {profile.nickname}
              </span>
            )}
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
            <span className="tab-label">Admin</span>
          </NavLink>
        )}
      </nav>
    </div>
  )
}
