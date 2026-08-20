import { createContext, useContext, useEffect, useRef, useState, useCallback } from 'react'
import { subscribeRequestCount } from '../services/apiClient'

const ReadinessContext = createContext(null)

const MAX_RETRIES = 3

export function ReadinessProvider({ children }) {
  const [status, setStatus] = useState('idle') // 'idle' | 'loading' | 'fetching' | 'validating' | 'rendering' | 'ready' | 'error'
  const [stageMessage, setStageMessage] = useState('Loading workspace…')
  const [targetOutletId, setTargetOutletId] = useState(null)
  const [activeRequestsCount, setActiveRequestsCount] = useState(0)
  const [retryCount, setRetryCount] = useState(0)
  const [errorMessage, setErrorMessage] = useState(null)

  const componentsMapRef = useRef(new Map())
  const refetchCallbacksRef = useRef(new Set())
  const validationTimerRef = useRef(null)
  const isValidatingRef = useRef(false)

  // Subscribe to apiClient request count in real time
  useEffect(() => {
    const unsubscribe = subscribeRequestCount((count) => {
      setActiveRequestsCount(count)
    })
    return () => unsubscribe()
  }, [])

  // Listen for outlet switch events across the app
  useEffect(() => {
    const handleOutletSwitchStart = (event) => {
      const { newOutletId, targetName } = event.detail || {}
      console.debug('[ReadinessContext] Outlet switch event received:', { newOutletId, targetName })
      setTargetOutletId(newOutletId || null)
      setStageMessage(targetName ? `Loading workspace for ${targetName}…` : 'Switching outlet context…')
      setErrorMessage(null)
      setRetryCount(0)
      setStatus('loading')
    }
    if (typeof window !== 'undefined') {
      window.addEventListener('switch-outlet-start', handleOutletSwitchStart)
    }
    return () => {
      if (typeof window !== 'undefined') {
        window.removeEventListener('switch-outlet-start', handleOutletSwitchStart)
      }
    }
  }, [])

  // Register / Unregister active HTTP requests from apiClient
  const incrementRequests = useCallback(() => {
    setActiveRequestsCount((prev) => prev + 1)
  }, [])

  const decrementRequests = useCallback(() => {
    setActiveRequestsCount((prev) => Math.max(0, prev - 1))
  }, [])

  // Register re-fetch callbacks from active pages
  const registerRefetch = useCallback((callback) => {
    if (typeof callback === 'function') {
      refetchCallbacksRef.current.add(callback)
    }
    return () => {
      refetchCallbacksRef.current.delete(callback)
    }
  }, [])

  // Start a global readiness check (e.g., when switching outlets, routing, or refreshing)
  const startReadinessCheck = useCallback(({ targetOutletId = null, message = 'Loading workspace…' } = {}) => {
    console.debug('[ReadinessContext] Starting readiness check:', { targetOutletId, message })
    setTargetOutletId(targetOutletId)
    setStageMessage(message)
    setErrorMessage(null)
    setRetryCount(0)
    setStatus('loading')
  }, [])

  // Register a page/component to participate in readiness verification
  const registerComponent = useCallback((id, statusObj) => {
    componentsMapRef.current.set(id, statusObj)
    console.debug('[ReadinessContext] Registered component:', id, statusObj)
  }, [])

  const unregisterComponent = useCallback((id) => {
    componentsMapRef.current.delete(id)
    console.debug('[ReadinessContext] Unregistered component:', id)
  }, [])

  const reportComponentStatus = useCallback((id, statusObj) => {
    componentsMapRef.current.set(id, statusObj)
    console.debug('[ReadinessContext] Component status updated:', id, statusObj)
  }, [])

  // Re-trigger all registered page/data fetching routines
  const triggerRefetch = useCallback(async () => {
    console.debug('[ReadinessContext] Triggering re-fetch across registered callbacks...')
    setStatus('fetching')
    setStageMessage('Re-fetching required data…')
    
    const callbacks = Array.from(refetchCallbacksRef.current)
    await Promise.all(
      callbacks.map(async (cb) => {
        try {
          await cb()
        } catch (err) {
          console.warn('[ReadinessContext] Re-fetch callback error:', err)
        }
      })
    )
  }, [])

  // Manual retry trigger when error state is reached
  const retry = useCallback(async () => {
    console.debug('[ReadinessContext] Manual retry initiated.')
    setErrorMessage(null)
    setRetryCount(0)
    setStatus('loading')
    setStageMessage('Retrying data initialization…')
    await triggerRefetch()
  }, [triggerRefetch])

  // Core Complete Load Verification Loop
  useEffect(() => {
    if (status === 'idle' || status === 'ready' || status === 'error') return

    if (validationTimerRef.current) clearTimeout(validationTimerRef.current)

    validationTimerRef.current = setTimeout(async () => {
      if (isValidatingRef.current) return
      isValidatingRef.current = true

      try {
        setStageMessage((prev) => {
          if (activeRequestsCount > 0) return `Waiting for pending network requests (${activeRequestsCount} active)…`
          return 'Validating data completeness & outlet consistency…'
        })

        // 1. Check HTTP Requests
        if (activeRequestsCount > 0) {
          console.debug('[ReadinessContext] Verification pending: active HTTP requests =', activeRequestsCount)
          isValidatingRef.current = false
          return
        }

        // 2. Check Component Readiness & Outlet Consistency
        let allReady = true
        let failedReason = null

        const components = Array.from(componentsMapRef.current.entries())
        if (components.length === 0) {
          console.debug('[ReadinessContext] Verification pending: no components registered yet.')
          isValidatingRef.current = false
          return
        }

        for (const [id, compStatus] of components) {
          if (!compStatus) continue
          if (!compStatus.isReady) {
            allReady = false
            failedReason = `Component ${id} is not ready`
            break
          }
          if (compStatus.isDataComplete === false) {
            allReady = false
            failedReason = `Component ${id} data is incomplete`
            break
          }
          if (targetOutletId && compStatus.outletId && compStatus.outletId !== targetOutletId) {
            allReady = false
            failedReason = `Component ${id} rendered stale outlet ${compStatus.outletId} (expected ${targetOutletId})`
            break
          }
        }

        if (allReady) {
          // 3. UI Rendering Verification
          setStatus('rendering')
          setStageMessage('Rendering user interface…')

          // Ensure DOM painting / framing completes
          await new Promise((r) => requestAnimationFrame(() => setTimeout(r, 100)))

          console.debug('[ReadinessContext] Verification succeeded! System is ready.')
          setStatus('ready')
          setStageMessage('Ready')
          isValidatingRef.current = false
          return
        }

        // 4. Validation Failed -> Handle Re-fetch or Retry Fallback
        console.warn('[ReadinessContext] Validation failed:', failedReason)

        if (retryCount < MAX_RETRIES) {
          const nextRetry = retryCount + 1
          console.log(`[ReadinessContext] Attempting automatic re-fetch (${nextRetry}/${MAX_RETRIES})...`)
          setRetryCount(nextRetry)
          setStatus('fetching')
          setStageMessage(`Data incomplete or stale. Auto re-fetching (Attempt ${nextRetry}/${MAX_RETRIES})…`)

          await triggerRefetch()
        } else {
          // Max retries exceeded -> Error State with Retry option
          console.error('[ReadinessContext] Max retries reached. Transitioning to error state.')
          setStatus('error')
          setErrorMessage(
            failedReason || 'Application failed to initialize complete ready state after repeated attempts.'
          )
        }
      } catch (err) {
        console.error('[ReadinessContext] Readiness verification exception:', err)
        if (retryCount < MAX_RETRIES) {
          setRetryCount((r) => r + 1)
          await triggerRefetch()
        } else {
          setStatus('error')
          setErrorMessage(err?.message || 'Failed to verify complete application load.')
        }
      } finally {
        isValidatingRef.current = false
      }
    }, 250)

    return () => {
      if (validationTimerRef.current) clearTimeout(validationTimerRef.current)
    }
  }, [status, activeRequestsCount, targetOutletId, retryCount, triggerRefetch])

  const value = {
    status,
    isLoading: status !== 'ready' && status !== 'idle',
    stageMessage,
    targetOutletId,
    activeRequestsCount,
    retryCount,
    maxRetries: MAX_RETRIES,
    errorMessage,
    startReadinessCheck,
    registerComponent,
    unregisterComponent,
    reportComponentStatus,
    registerRefetch,
    incrementRequests,
    decrementRequests,
    triggerRefetch,
    retry,
    setStatus,
  }

  return <ReadinessContext.Provider value={value}>{children}</ReadinessContext.Provider>
}

export function useReadiness() {
  const context = useContext(ReadinessContext)
  if (!context) {
    return {
      status: 'idle',
      isLoading: false,
      stageMessage: '',
      targetOutletId: null,
      activeRequestsCount: 0,
      retryCount: 0,
      maxRetries: MAX_RETRIES,
      errorMessage: null,
      startReadinessCheck: () => {},
      registerComponent: () => {},
      unregisterComponent: () => {},
      reportComponentStatus: () => {},
      registerRefetch: () => () => {},
      incrementRequests: () => {},
      decrementRequests: () => {},
      triggerRefetch: async () => {},
      retry: async () => {},
      setStatus: () => {},
    }
  }
  return context
}
