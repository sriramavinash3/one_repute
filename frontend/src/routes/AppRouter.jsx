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
const AdminCustomersPage = lazy(() => import('../pages/admin/AdminCustomersPage'))
const AdminTicketsPage = lazy(() => import('../pages/admin/AdminTicketsPage'))
const AdminDiscountsPage = lazy(() => import('../pages/admin/AdminDiscountsPage'))
const AdminReportsPage = lazy(() => import('../pages/admin/AdminReportsPage'))
const AdminUsagePage = lazy(() => import('../pages/admin/AdminUsagePage'))
const AdminIntelligencePage = lazy(() => import('../pages/admin/AdminIntelligencePage'))

const OutletDashboardPage = lazy(() => import('../pages/outlet/OutletDashboardPage'))
const OutletReviewsPage = lazy(() => import('../pages/outlet/OutletReviewsPage'))
const OutletAnalyticsPage = lazy(() => import('../pages/outlet/OutletAnalyticsPage'))
const OutletEscalationsPage = lazy(() => import('../pages/outlet/OutletEscalationsPage'))
const OutletSettingsPage = lazy(() => import('../pages/outlet/OutletSettingsPage'))
const OutletReputationPage = lazy(() => import('../pages/outlet/OutletReputationPage'))
const OutletQrPage = lazy(() => import('../pages/outlet/OutletQrPage'))

const ResetPasswordPage = lazy(() => import('../pages/ResetPasswordPage'))
const VerifyEmailPage = lazy(() => import('../pages/VerifyEmailPage'))

const NotFoundPage = lazy(() => import('../pages/NotFoundPage'))

import { useEffect, useState } from 'react'
import { INTERNATIONAL_BILLING_ENABLED } from '../config/featureFlags'
import InternationalBillingModal from '../components/common/InternationalBillingModal'

function InternationalBillingUrlGuard() {
  const [showLockedModal, setShowLockedModal] = useState(() => {
    if (INTERNATIONAL_BILLING_ENABLED || typeof window === 'undefined') return false
    const searchParams = new URLSearchParams(window.location.search)
    const region = (searchParams.get('region') || '').toUpperCase()
    const currency = (searchParams.get('currency') || '').toUpperCase()
    const country = (searchParams.get('country') || '').toUpperCase()
    const billing = (searchParams.get('billing') || '').toLowerCase()

    return (
      region === 'INT' ||
      (currency && currency !== 'INR') ||
      (country && country !== 'IN') ||
      billing.includes('international') ||
      window.location.pathname.includes('/billing/international')
    )
  })

  useEffect(() => {
    if (showLockedModal && typeof window !== 'undefined') {
      const searchParams = new URLSearchParams(window.location.search)
      searchParams.delete('region')
      searchParams.delete('currency')
      searchParams.delete('country')
      searchParams.delete('billing')
      const newSearch = searchParams.toString()
      const newUrl = window.location.pathname + (newSearch ? `?${newSearch}` : '') + window.location.hash
      window.history.replaceState({}, '', newUrl)
    }
  }, [showLockedModal])

  return (
    <InternationalBillingModal
      isOpen={showLockedModal}
      onClose={() => setShowLockedModal(false)}
    />
  )
}

export default function AppRouter() {
  return (
    <BrowserRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
      <InternationalBillingUrlGuard />
      <Suspense fallback={<FullScreenLoader />}> 
        <Routes>
          <Route path="/" element={<LandingPage />} />
          <Route path="/login" element={<LoginPage />} />
          <Route path="/onboarding" element={<OnboardingPage />} />
          <Route path="/reset-password" element={<ResetPasswordPage />} />
          <Route path="/verify-email" element={<VerifyEmailPage />} />

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
            <Route path="customers" element={<AdminCustomersPage />} />
            <Route path="tickets" element={<AdminTicketsPage />} />
            <Route path="discounts" element={<AdminDiscountsPage />} />
            <Route path="reports" element={<AdminReportsPage />} />
            <Route path="usage" element={<AdminUsagePage />} />
            <Route path="intelligence" element={<AdminIntelligencePage />} />
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
            <Route path="reputation" element={<OutletReputationPage />} />
            <Route path="qr" element={<OutletQrPage />} />
            {/* Google connection page removed for scraper-only architecture */}
            <Route path="settings" element={<OutletSettingsPage />} />
          </Route>

          <Route path="*" element={<NotFoundPage />} />
        </Routes>
      </Suspense>
    </BrowserRouter>
  )
}
