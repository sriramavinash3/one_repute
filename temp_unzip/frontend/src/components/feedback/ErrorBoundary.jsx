import { Component } from 'react'
import Button from '../ui/button'

export default class ErrorBoundary extends Component {
  constructor(props) {
    super(props)
    this.state = { hasError: false }
  }

  static getDerivedStateFromError() {
    return { hasError: true }
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="flex min-h-screen flex-col items-center justify-center gap-4">
          <h1 className="text-2xl font-semibold text-slatey-900">Something went wrong</h1>
          <p className="text-sm text-slatey-500">Try refreshing the page or go back to the dashboard.</p>
          <Button onClick={() => window.location.reload()}>Reload</Button>
        </div>
      )
    }

    return this.props.children
  }
}
