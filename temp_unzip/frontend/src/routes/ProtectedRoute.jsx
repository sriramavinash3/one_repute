import { Navigate, useLocation } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import FullScreenLoader from '../components/feedback/FullScreenLoader'

export default function ProtectedRoute({ allowedRoles, children }) {
  const { user, profile, loading, outletLoading, needsGoogleConnect } = useAuth()
  const location = useLocation()

  if (loading || outletLoading) {
    return <FullScreenLoader />
  }

  if (!user) {
    return <Navigate to="/login" replace />
  }

  // if (allowedRoles && profile && !allowedRoles.includes(profile.role)) {
  //   return <Navigate to="/login" replace />
  // }

  // if (profile?.role === 'outlet' && needsGoogleConnect && location.pathname !== '/connect-google') {
  //   return <Navigate to="/connect-google" replace />
  // }

  return children
}
