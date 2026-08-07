import { Navigate, useLocation } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import FullScreenLoader from '../components/feedback/FullScreenLoader'

export default function ProtectedRoute({ allowedRoles, children }) {
  const { user, profile, loading, outletLoading } = useAuth()

  if (loading || outletLoading) {
    return <FullScreenLoader />
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
