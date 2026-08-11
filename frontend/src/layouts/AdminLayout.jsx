import { useMemo, useState } from 'react'
import { Outlet, useNavigate } from 'react-router-dom'
import {
  BarChart3,
  Building2,
  FileText,
  MessageSquareWarning,
  Sparkles,
  CreditCard,
  LayoutDashboard,
  LogOut,
  Menu,
  Users,
  Ticket,
  Tag,
  Archive,
  Activity,
  Star
} from 'lucide-react'
import Sidebar from '../components/navigation/Sidebar'
import Topbar from '../components/navigation/Topbar'
import Button from '../components/ui/button'
import Seo from '../components/seo/Seo'
import { useAuth } from '../contexts/AuthContext'
import Logo from '../components/common/Logo'

export default function AdminLayout() {
  const [mobileOpen, setMobileOpen] = useState(false)
  const { profile, signOut } = useAuth()
  const navigate = useNavigate()

  const handleLogout = async () => {
    await signOut()
    navigate('/login')
  }

  const items = useMemo(
    () => [
      { to: '/admin-dashboard', label: 'Dashboard', icon: <LayoutDashboard className="h-4 w-4" />, end: true },
      { to: '/admin-dashboard/customers', label: 'Customers', icon: <Users className="h-4 w-4" /> },
      { to: '/admin-dashboard/outlets', label: 'Outlets', icon: <Building2 className="h-4 w-4" /> },
      { to: '/admin-dashboard/reviews', label: 'Reviews', icon: <FileText className="h-4 w-4" /> },
      { to: '/admin-dashboard/escalations', label: 'Escalations', icon: <MessageSquareWarning className="h-4 w-4" /> },
      { to: '/admin-dashboard/analytics', label: 'Analytics', icon: <BarChart3 className="h-4 w-4" /> },
      { to: '/admin-dashboard/tickets', label: 'Tickets', icon: <Ticket className="h-4 w-4" /> },
      { to: '/admin-dashboard/discounts', label: 'Discounts', icon: <Tag className="h-4 w-4" /> },
      { to: '/admin-dashboard/reports', label: 'Reports', icon: <Archive className="h-4 w-4" /> },
      { to: '/admin-dashboard/usage', label: 'Usage', icon: <Activity className="h-4 w-4" /> },
      { to: '/admin-dashboard/intelligence', label: 'Intelligence', icon: <Star className="h-4 w-4" /> },
      { to: '/admin-dashboard/ai-logs', label: 'System Logs', icon: <Sparkles className="h-4 w-4" /> },
      { to: '/admin-dashboard/billing', label: 'Billing', icon: <CreditCard className="h-4 w-4" /> },
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

  const adminHeader = <Logo subtitle="Admin Command" to="/admin-dashboard" size="sm" />

  return (
    <div className="dashboard-shell">
      <Seo
        title="Admin Dashboard | One Repute"
        description="Admin command center for One Repute."
        path="/admin-dashboard"
        noindex
      />
      <div className="flex">
        <Sidebar
          header={adminHeader}
          items={items}
          footer={footer}
          className="hidden lg:flex"
        />

        <div className="flex min-h-screen flex-1 flex-col">
          <div className="flex items-center gap-3 border-b border-slatey-200 bg-white px-6 py-3 lg:hidden">
            <Button variant="ghost" size="sm" onClick={() => setMobileOpen(true)}>
              <Menu className="h-4 w-4" />
            </Button>
            <Logo subtitle="Admin" to="/admin-dashboard" size="sm" />
          </div>

          <Topbar title="Admin Command Center" user={profile} onLogout={handleLogout} />
          <main className="flex-1 px-3 py-4 sm:px-6 sm:py-6 overflow-x-hidden">
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
            <Sidebar header={adminHeader} items={items} footer={footer} className="flex h-full w-full border-r-0" onItemClick={() => setMobileOpen(false)} />
          </div>
        </div>
      ) : null}
    </div>
  )
}
