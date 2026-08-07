import { Component } from 'react'
import Button from '../ui/button'

export default class ErrorBoundary extends Component {
  constructor(props) {
    super(props)
    this.state = { hasError: false }
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error }
  }

  componentDidCatch(error, errorInfo) {
    console.error('[ErrorBoundary caught error]', error, errorInfo)
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="flex min-h-screen flex-col items-center justify-center gap-4 p-6 text-center">
          <h1 className="text-2xl font-semibold text-slatey-900">Something went wrong</h1>
          <p className="text-sm text-slatey-500 max-w-md">
            {this.state.error?.message || 'An unexpected rendering error occurred. Please refresh or try again.'}
          </p>
          <Button onClick={() => window.location.reload()}>Reload Page</Button>
        </div>
      )
    }

    return this.props.children
  }
}
