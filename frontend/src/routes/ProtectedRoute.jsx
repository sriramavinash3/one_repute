import { useEffect } from 'react'
import { Navigate, useLocation } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import { useReadiness } from '../contexts/ReadinessContext'
export default function ProtectedRoute({ allowedRoles, children }) {
  const { user, profile, loading, outletLoading, outlet } = useAuth()
  const { startReadinessCheck, setStatus } = useReadiness()
  const isOutletRoute = allowedRoles && allowedRoles.includes('outlet')

  useEffect(() => {
    if (loading || outletLoading) {
      startReadinessCheck({
        targetOutletId: outlet?.id || null,
        message: 'Verifying user authentication & outlet workspace…'
      })
    }
  }, [loading, outletLoading, outlet?.id, startReadinessCheck])

  if (loading || outletLoading) {
    return null
  }

  if (!user) {
    return <Navigate to="/login" replace />
  }

  const isAdminRoute = allowedRoles && allowedRoles.includes('admin')
  const isUserAdmin = (user.email || '').toLowerCase() === 'admin@onerepute.com' || profile?.role === 'admin'

  if (isAdminRoute && !isUserAdmin) {
    return <Navigate to="/login" replace />
  }

  if (allowedRoles && profile && !allowedRoles.includes(profile.role) && !isUserAdmin) {
    return <Navigate to="/login" replace />
  }

  return children
}
