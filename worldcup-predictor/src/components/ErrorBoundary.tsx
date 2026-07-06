import { Component, type ErrorInfo, type ReactNode } from 'react'
import { captureError } from '../lib/monitoring'
import { getLang } from '../lib/i18n'

interface Props {
  children: ReactNode
}
interface State {
  hasError: boolean
}

/**
 * Catches render-time crashes anywhere below it, reports them to monitoring,
 * and shows a friendly recover screen instead of a blank white page.
 */
export default class ErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false }

  static getDerivedStateFromError(): State {
    return { hasError: true }
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    captureError(error, { componentStack: info.componentStack })
  }

  render(): ReactNode {
    if (!this.state.hasError) return this.props.children
    const es = getLang() === 'es'
    return (
      <div className="center-screen">
        <div className="login-card" style={{ textAlign: 'center' }}>
          <div className="login-badge">⚠️</div>
          <h1 className="login-title">
            {es ? 'Algo salió mal' : 'Something went wrong'}
          </h1>
          <p className="muted">
            {es
              ? 'Ocurrió un error inesperado. Intenta recargar la página.'
              : 'An unexpected error occurred. Please try reloading the page.'}
          </p>
          <button className="btn btn-primary" onClick={() => window.location.reload()}>
            {es ? 'Recargar' : 'Reload'}
          </button>
        </div>
      </div>
    )
  }
}
