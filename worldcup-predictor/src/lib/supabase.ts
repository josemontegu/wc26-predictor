import { createClient } from '@supabase/supabase-js'
import { createDemoClient } from './demoClient'

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined

// Demo mode: a fully client-side sandbox with sample data and no backend.
// Enabled by build flag (VITE_DEMO=1), a ?demo URL param, or a localStorage flag.
function detectDemo(): boolean {
  if (import.meta.env.VITE_DEMO === '1') return true
  if (typeof window !== 'undefined') {
    if (window.location.search.toLowerCase().includes('demo')) return true
    try {
      if (window.localStorage.getItem('wc26_demo') === '1') return true
    } catch {
      /* ignore */
    }
  }
  return false
}

export const DEMO = detectDemo()

// Surfaced in the UI so a misconfigured deploy fails loudly, not silently.
export const supabaseConfigured = DEMO || Boolean(url && anonKey)

if (!supabaseConfigured) {
  // eslint-disable-next-line no-console
  console.error(
    'Supabase is not configured. Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY.',
  )
}

export const supabase = DEMO
  ? (createDemoClient() as unknown as ReturnType<typeof createClient>)
  : createClient(url ?? 'http://localhost:54321', anonKey ?? 'public-anon-key', {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
      },
    })
