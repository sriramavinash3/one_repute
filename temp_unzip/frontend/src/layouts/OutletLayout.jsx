import { useMemo, useState } from 'react'
import { Outlet, useNavigate } from 'react-router-dom'
import { BarChart3, FileText, LayoutDashboard, MessageSquareWarning, Settings, Link2, LogOut, Menu, BrainCircuit } from 'lucide-react'
import Sidebar from '../components/navigation/Sidebar'
import Topbar from '../components/navigation/Topbar'
import Button from '../components/ui/button'
import { useAuth } from '../contexts/AuthContext'

export default function OutletLayout() {
  const [mobileOpen, setMobileOpen] = useState(false)
  const { profile, signOut } = useAuth()
  const navigate = useNavigate()

  const handleLogout = async () => {
    await signOut()
    navigate('/login')
  }

  const items = useMemo(
    () => [
      { to: '/outlet-dashboard', label: 'Dashboard', icon: <LayoutDashboard className="h-4 w-4" />, end: true },
      { to: '/outlet-dashboard/reviews', label: 'Reviews', icon: <FileText className="h-4 w-4" /> },
      { to: '/outlet-dashboard/escalations', label: 'Escalations', icon: <MessageSquareWarning className="h-4 w-4" /> },
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

  return (
    <div className="dashboard-shell">
      <div className="flex">
        <Sidebar header={<span>Outlet Workspace</span>} items={items} footer={footer} className="hidden lg:flex" />

        <div className="flex min-h-screen flex-1 flex-col">
          <div className="flex items-center gap-3 border-b border-slatey-200 bg-white px-6 py-3 lg:hidden">
            <Button variant="ghost" size="sm" onClick={() => setMobileOpen(true)}>
              <Menu className="h-4 w-4" />
            </Button>
            <span className="text-sm font-semibold text-slatey-800">Outlet Workspace</span>
          </div>

          <Topbar title="Outlet Performance" user={profile} onLogout={handleLogout} />
          <main className="flex-1 px-6 py-6">
            <Outlet />
          </main>
        </div>
      </div>

      {mobileOpen ? (
        <div className="fixed inset-0 z-50 bg-slatey-900/40 lg:hidden" onClick={() => setMobileOpen(false)}>
          <div
            className="absolute left-0 top-0 h-full w-64 bg-white px-5 py-6"
            onClick={(event) => event.stopPropagation()}
          >
            <Sidebar header={<span>Outlet Workspace</span>} items={items} footer={footer} className="flex" />
          </div>
        </div>
      ) : null}
    </div>
  )
}
