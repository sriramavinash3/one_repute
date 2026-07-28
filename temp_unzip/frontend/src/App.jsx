import AppRouter from './routes/AppRouter'
import ErrorBoundary from './components/feedback/ErrorBoundary'

function App() {
  return (
    <ErrorBoundary>
      <AppRouter />
    </ErrorBoundary>
  )
}

export default App
