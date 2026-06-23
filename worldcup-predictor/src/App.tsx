import { Navigate, Route, Routes } from 'react-router-dom'
import { useAuth } from './context/AuthContext'
import { supabaseConfigured } from './lib/supabase'
import Layout from './components/Layout'
import Spinner from './components/Spinner'
import LoginPage from './pages/LoginPage'
import ProfilePage from './pages/ProfilePage'
import MatchesPage from './pages/MatchesPage'
import MatchDetailPage from './pages/MatchDetailPage'
import LeaderboardPage from './pages/LeaderboardPage'
import RulesPage from './pages/RulesPage'
import AdminPage from './pages/AdminPage'
import BracketPage from './pages/BracketPage'

export default function App() {
  const { session, profile, loading } = useAuth()

  if (!supabaseConfigured) {
    return (
      <div className="config-error">
        <h1>⚙️ Configuration needed</h1>
        <p>
          This app needs Supabase credentials. Set <code>VITE_SUPABASE_URL</code> and{' '}
          <code>VITE_SUPABASE_ANON_KEY</code> in a <code>.env</code> file (local) or as
          repository secrets (GitHub Pages), then rebuild.
        </p>
      </div>
    )
  }

  if (loading) {
    return (
      <div className="center-screen">
        <Spinner />
      </div>
    )
  }

  if (!session) {
    return <LoginPage />
  }

  // Signed in but profile incomplete → force profile setup before anything else.
  const needsProfile =
    !profile || !profile.display_name.trim() || !profile.nickname.trim()

  if (needsProfile) {
    return (
      <Layout>
        <ProfilePage forced />
      </Layout>
    )
  }

  return (
    <Layout>
      <Routes>
        <Route path="/" element={<MatchesPage />} />
        <Route path="/bracket" element={<BracketPage />} />
        <Route path="/match/:id" element={<MatchDetailPage />} />
        <Route path="/leaderboard" element={<LeaderboardPage />} />
        <Route path="/rules" element={<RulesPage />} />
        <Route path="/profile" element={<ProfilePage />} />
        <Route path="/admin" element={<AdminPage />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </Layout>
  )
}
