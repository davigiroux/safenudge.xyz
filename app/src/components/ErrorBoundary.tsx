import { Component, type ReactNode } from 'react'

type Props = { children: ReactNode }
type State = { hasError: boolean; error: Error | null }

export class ErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false, error: null }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error }
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen bg-surface flex items-center justify-center px-4">
          <div className="text-center max-w-md">
            <h1 className="font-headline text-headline-sm text-on-surface mb-2">
              Algo deu errado
            </h1>
            <p className="font-body text-body-md text-on-surface-variant mb-6">
              {this.state.error?.message || 'Erro inesperado'}
            </p>
            <button
              onClick={() => window.location.reload()}
              className="px-6 py-3 rounded-xl btn-primary-gradient text-on-primary font-label text-label-lg"
            >
              Recarregar
            </button>
          </div>
        </div>
      )
    }
    return this.props.children
  }
}
