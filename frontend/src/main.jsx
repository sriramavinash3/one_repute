import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { Toaster } from 'sonner'
import './index.css'
import App from './App.jsx'
import { AuthProvider } from './contexts/AuthContext'
import { SubscriptionProvider } from './contexts/SubscriptionContext'
import { ReadinessProvider } from './contexts/ReadinessContext'
import FullScreenLoader from './components/feedback/FullScreenLoader'

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 60 * 1000,
      retry: 1
    }
  }
})

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <ReadinessProvider>
        <AuthProvider>
          <SubscriptionProvider>
            <App />
            <FullScreenLoader />
            <Toaster position="top-right" richColors />
          </SubscriptionProvider>
        </AuthProvider>
      </ReadinessProvider>
    </QueryClientProvider>
  </StrictMode>
)
