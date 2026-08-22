import { useEffect } from 'react'
import { useReadiness } from '../contexts/ReadinessContext'

export function usePageReadiness({
  componentId,
  isReady = true,
  outletId = null,
  isDataComplete = true,
  onRefetch = null,
}) {
  const { registerComponent, unregisterComponent, reportComponentStatus, registerRefetch } = useReadiness()

  useEffect(() => {
    if (!componentId) return
    registerComponent(componentId, { isReady, outletId, isDataComplete })

    return () => {
      unregisterComponent(componentId)
    }
  }, [componentId, isReady, outletId, isDataComplete, registerComponent, unregisterComponent])

  useEffect(() => {
    if (!componentId) return
    reportComponentStatus(componentId, { isReady, outletId, isDataComplete })
  }, [componentId, isReady, outletId, isDataComplete, reportComponentStatus])

  useEffect(() => {
    if (!onRefetch) return
    const unbind = registerRefetch(onRefetch)
    return () => {
      if (unbind) unbind()
    }
  }, [onRefetch, registerRefetch])
}
