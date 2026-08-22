import { useMemo, useState } from 'react'
import { Outlet, useNavigate } from 'react-router-dom'
import { BarChart3, FileText, LayoutDashboard, MessageSquareWarning, Settings, LogOut, Menu, BrainCircuit, QrCode } from 'lucide-react'
import { toast } from 'sonner'
import Sidebar from '../components/navigation/Sidebar'
import Topbar from '../components/navigation/Topbar'
import Button from '../components/ui/button'
import { useAuth } from '../contexts/AuthContext'
import Logo from '../components/common/Logo'
import Seo from '../components/seo/Seo'
import { FEATURE_FLAGS } from '../config/featureFlags'

const SMART_QR_LOCKED_MESSAGE = 'Smart QR Code Campaigns will be updated soon. Stay tuned.'

export default function OutletLayout() {
  const [mobileOpen, setMobileOpen] = useState(false)
  const { profile, outlet, signOut } = useAuth()
  const navigate = useNavigate()

  const handleLogout = async () => {
    await signOut()
    navigate('/login')
  }

  const handleLockedClick = (item) => {
    toast.info(item.lockedMessage || 'This feature is temporarily unavailable.')
  }

  const items = useMemo(
    () => [
      { to: '/outlet-dashboard', label: 'Dashboard', icon: <LayoutDashboard className="h-4 w-4" />, end: true },
      { to: '/outlet-dashboard/reviews', label: 'Reviews', icon: <FileText className="h-4 w-4" /> },
      { to: '/outlet-dashboard/escalations', label: 'Escalations', icon: <MessageSquareWarning className="h-4 w-4" /> },
      ...(FEATURE_FLAGS.SMART_QR_CAMPAIGNS
        ? [{ to: '/outlet-dashboard/qr', label: 'Smart QR', icon: <QrCode className="h-4 w-4" /> }]
        : [{
            to: '/outlet-dashboard/qr',
            label: 'Smart QR',
            icon: <QrCode className="h-4 w-4" />,
            locked: true,
            lockedMessage: SMART_QR_LOCKED_MESSAGE
          }]),
      { to: '/outlet-dashboard/analytics', label: 'Analytics', icon: <BarChart3 className="h-4 w-4" /> },
      { to: '/outlet-dashboard/reputation', label: 'Reputation', icon: <BrainCircuit className="h-4 w-4" /> },
      { to: '/outlet-dashboard/settings', label: 'Settings', icon: <Settings className="h-4 w-4" /> }
    ],
    []
  )

  const footer = (
    <div className="border-t border-slatey-100 ">
      <button
        onClick={handleLogout}
        className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium text-rose-500 transition hover:bg-rose-50"
      >
        <LogOut className="h-4 w-4" />
        Logout
      </button>
    </div>
  )

  const headerContent = (
    <div className="flex flex-col w-full gap-2 mb-4">
      <Logo subtitle="Outlet Workspace" to="/outlet-dashboard" size="sm" />
    </div>
  )

  return (
    <div className="dashboard-shell">
      <Seo
        title="Outlet Dashboard | One Repute"
        description="Your One Repute outlet workspace for reviews, escalations, and analytics."
        path="/outlet-dashboard"
        noindex
      />
      <div className="flex h-full w-full overflow-hidden">
        <Sidebar header={headerContent} items={items} footer={footer} className="hidden lg:flex" onLockedClick={handleLockedClick} />

        <div className="flex h-full flex-1 flex-col min-w-0 overflow-hidden">
          <div className="flex items-center gap-3 border-b border-slatey-200 bg-white px-6 py-3 lg:hidden shrink-0">
            <Button variant="ghost" size="sm" onClick={() => setMobileOpen(true)}>
              <Menu className="h-4 w-4" />
            </Button>
            <span className="text-sm font-semibold text-slatey-800">
              {outlet?.name || 'Outlet Workspace'}
            </span>
          </div>

          <Topbar title="Outlet Performance" user={profile} onLogout={handleLogout} />
          <main className="flex-1 px-3 py-4 sm:px-6 sm:py-6 overflow-x-hidden overflow-y-auto">
            <Outlet />
          </main>
        </div>
      </div>

      {mobileOpen ? (
        <div className="fixed inset-0 z-50 bg-slatey-900/40 lg:hidden" onClick={() => setMobileOpen(false)}>
          <div
            className="absolute left-0 top-0 h-full w-72 max-w-[85vw] bg-white p-0 shadow-2xl dark:bg-slatey-900"
            onClick={(event) => event.stopPropagation()}
          >
            <Sidebar header={headerContent} items={items} footer={footer} className="flex h-full w-full border-r-0" onItemClick={() => setMobileOpen(false)} onLockedClick={handleLockedClick} />
          </div>
        </div>
      ) : null}
    </div>
  )
}
