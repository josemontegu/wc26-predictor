// Optional production error monitoring.
//
// Active only when VITE_SENTRY_DSN is set, so local and un-configured builds are
// completely unaffected. Sentry is loaded via dynamic import, so it is code-split
// into its own chunk and only fetched at runtime when a DSN is present.

type SentryModule = typeof import('@sentry/react')
let sentry: SentryModule | null = null

export async function initMonitoring(): Promise<void> {
  const dsn = import.meta.env.VITE_SENTRY_DSN as string | undefined
  if (!dsn) return
  try {
    const S = await import('@sentry/react')
    S.init({
      dsn,
      environment: import.meta.env.MODE,
      // Sample a fraction of transactions; errors are always captured.
      tracesSampleRate: 0.1,
      // Don't attach IPs / user identifiers by default.
      sendDefaultPii: false,
    })
    sentry = S
  } catch (e) {
    // Never let monitoring setup break the app.
    // eslint-disable-next-line no-console
    console.error('Monitoring failed to initialise', e)
  }
}

/** Report a handled error. Falls back to the console when monitoring is off. */
export function captureError(error: unknown, context?: Record<string, unknown>): void {
  if (sentry) {
    sentry.captureException(error, context ? { extra: context } : undefined)
  } else {
    // eslint-disable-next-line no-console
    console.error(error, context ?? '')
  }
}
