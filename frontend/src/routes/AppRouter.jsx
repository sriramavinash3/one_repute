import { Suspense, lazy } from 'react'
import { BrowserRouter, Route, Routes } from 'react-router-dom'
import ProtectedRoute from './ProtectedRoute'
import FullScreenLoader from '../components/feedback/FullScreenLoader'
import AdminLayout from '../layouts/AdminLayout'
import OutletLayout from '../layouts/OutletLayout'

const LandingPage = lazy(() => import('../pages/LandingPage'))
const LoginPage = lazy(() => import('../pages/LoginPage'))
const OnboardingPage = lazy(() => import('../pages/RegisterPage'))

const AdminDashboardPage = lazy(() => import('../pages/admin/AdminDashboardPage'))
const AdminOutletsPage = lazy(() => import('../pages/admin/AdminOutletsPage'))
const AdminOutletDetailPage = lazy(() => import('../pages/admin/AdminOutletDetailPage'))
const AdminReviewsPage = lazy(() => import('../pages/admin/AdminReviewsPage'))
const AdminEscalationsPage = lazy(() => import('../pages/admin/AdminEscalationsPage'))
const AdminAnalyticsPage = lazy(() => import('../pages/admin/AdminAnalyticsPage'))
const AdminLogsPage = lazy(() => import('../pages/admin/AdminLogsPage'))
const AdminLogDetailPage = lazy(() => import('../pages/admin/AdminLogDetailPage'))
const AdminBillingPage = lazy(() => import('../pages/admin/AdminBillingPage'))


const OutletDashboardPage = lazy(() => import('../pages/outlet/OutletDashboardPage'))
const OutletReviewsPage = lazy(() => import('../pages/outlet/OutletReviewsPage'))
const OutletAnalyticsPage = lazy(() => import('../pages/outlet/OutletAnalyticsPage'))
const OutletEscalationsPage = lazy(() => import('../pages/outlet/OutletEscalationsPage'))
const OutletGooglePage = lazy(() => import('../pages/outlet/OutletGooglePage'))
const OutletSettingsPage = lazy(() => import('../pages/outlet/OutletSettingsPage'))

const NotFoundPage = lazy(() => import('../pages/NotFoundPage'))

export default function AppRouter() {
  return (
    <BrowserRouter>
      <Suspense fallback={<FullScreenLoader />}> 
        <Routes>
          <Route path="/" element={<LandingPage />} />
          <Route path="/login" element={<LoginPage />} />
          <Route path="/onboarding" element={<OnboardingPage />} />
          {/* Google connection page removed for scraper-only architecture */}

          <Route
            path="/admin-dashboard"
            element={
              <ProtectedRoute allowedRoles={['admin']}>
                <AdminLayout />
              </ProtectedRoute>
            }
          >
            <Route index element={<AdminDashboardPage />} />
            <Route path="outlets" element={<AdminOutletsPage />} />
            <Route path="outlets/:id" element={<AdminOutletDetailPage />} />
            <Route path="reviews" element={<AdminReviewsPage />} />
            <Route path="escalations" element={<AdminEscalationsPage />} />
            <Route path="analytics" element={<AdminAnalyticsPage />} />
            <Route path="ai-logs" element={<AdminLogsPage />} />
            <Route path="ai-logs/:id" element={<AdminLogDetailPage />} />
            <Route path="billing" element={<AdminBillingPage />} />
          </Route>

          <Route
            path="/outlet-dashboard"
            element={
              <ProtectedRoute allowedRoles={['outlet']}>
                <OutletLayout />
              </ProtectedRoute>
            }
          >
            <Route index element={<OutletDashboardPage />} />
            <Route path="reviews" element={<OutletReviewsPage />} />
            <Route path="escalations" element={<OutletEscalationsPage />} />
            <Route path="analytics" element={<OutletAnalyticsPage />} />
            {/* Google connection page removed for scraper-only architecture */}
            <Route path="settings" element={<OutletSettingsPage />} />
          </Route>

          <Route path="*" element={<NotFoundPage />} />
        </Routes>
      </Suspense>
    </BrowserRouter>
  )
}
