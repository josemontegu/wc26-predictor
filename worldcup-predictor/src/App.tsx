import { Navigate, Route, Routes } from 'react-router-dom'
import { useAuth } from './context/AuthContext'
import { supabaseConfigured } from './lib/supabase'
import { useT } from './lib/i18n'
import Layout from './components/Layout'
import Spinner from './components/Spinner'
import LoginPage from './pages/LoginPage'
import ProfilePage from './pages/ProfilePage'
import MatchesPage from './pages/MatchesPage'
import MatchDetailPage from './pages/MatchDetailPage'
import LeaderboardPage from './pages/LeaderboardPage'
import RulesPage from './pages/RulesPage'
import { TermsPage, PrivacyPage } from './pages/LegalPage'
import AdminPage from './pages/AdminPage'
import BracketPage from './pages/BracketPage'
import AwardsPage from './pages/AwardsPage'
import StatsPage from './pages/StatsPage'

export default function App() {
  const { session, profile, loading } = useAuth()
  const t = useT()

  if (!supabaseConfigured) {
    return (
      <div className="config-error">
        <h1>{t('⚙️ Configuration needed', '⚙️ Configuración necesaria')}</h1>
        <p>
          {t('This app needs Supabase credentials. Set ', 'Esta app necesita credenciales de Supabase. Define ')}
          <code>VITE_SUPABASE_URL</code>{t(' and ', ' y ')}
          <code>VITE_SUPABASE_ANON_KEY</code>{t(' in a ', ' en un archivo ')}
          <code>.env</code>{t(' file (local) or as repository secrets (GitHub Pages), then rebuild.', ' (local) o como secretos del repositorio (GitHub Pages), y luego reconstruye.')}
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
    // Legal pages must be readable before signing up; everything else → login.
    return (
      <Routes>
        <Route path="/terms" element={<TermsPage />} />
        <Route path="/privacy" element={<PrivacyPage />} />
        <Route path="*" element={<LoginPage />} />
      </Routes>
    )
  }

  // Signed in but no nickname/emoji yet → force setup before anything else.
  const needsProfile = !profile || !profile.nickname.trim() || !profile.emoji

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
        <Route path="/awards" element={<AwardsPage />} />
        <Route path="/stats" element={<StatsPage />} />
        <Route path="/match/:id" element={<MatchDetailPage />} />
        <Route path="/leaderboard" element={<LeaderboardPage />} />
        <Route path="/rules" element={<RulesPage />} />
        <Route path="/terms" element={<TermsPage />} />
        <Route path="/privacy" element={<PrivacyPage />} />
        <Route path="/profile" element={<ProfilePage />} />
        <Route path="/admin" element={<AdminPage />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </Layout>
  )
}
