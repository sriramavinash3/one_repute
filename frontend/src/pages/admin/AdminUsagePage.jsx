import { useState, useMemo } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { motion, AnimatePresence } from 'framer-motion'
import { 
  Bot, MessageSquareWarning, Activity, DatabaseZap, AlertTriangle, 
  Settings2, Filter, MoreVertical, TrendingUp, AlertCircle, ShieldAlert, Sparkles, XOctagon, Edit
} from 'lucide-react'
import { USE_MOCK_DATA } from '../../config/env'
import { MOCK_USAGE_INSIGHTS, MOCK_OUTLETS, MOCK_CUSTOMERS } from '../../config/mockData'
import { fetchUsageInsights } from '../../services/adminService'
import { fetchAdminOutlets } from '../../services/outletService'
import Button from '../../components/ui/button'
import Input from '../../components/ui/input'
import { 
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger 
} from '../../components/ui/dropdown-menu'
import { DialogContent, DialogDescription, DialogRoot, DialogTitle } from '../../components/ui/dialog'
import apiClient from '../../services/apiClient'
import { toast } from 'sonner'

const stagger = {
  hidden: { opacity: 0 },
  show: { opacity: 1, transition: { staggerChildren: 0.1 } }
}

const item = {
  hidden: { opacity: 0, y: 15 },
  show: { opacity: 1, y: 0 }
}

export default function AdminUsagePage() {
  const queryClient = useQueryClient()
  const [settingsDialogOpen, setSettingsDialogOpen] = useState(false)
  const [selectedOutlet, setSelectedOutlet] = useState(null)

  const { data: usage } = useQuery({
    queryKey: ['admin-usage-insights'],
    queryFn: async () => {
      if (USE_MOCK_DATA) return MOCK_USAGE_INSIGHTS
      return await fetchUsageInsights()
    }
  })

  const { data: outletPayload } = useQuery({
    queryKey: ['admin-outlets'],
    queryFn: async () => {
      if (USE_MOCK_DATA) return { outlets: MOCK_OUTLETS }
      return fetchAdminOutlets()
    }
  })

  const { data: customers = [] } = useQuery({
    queryKey: ['admin-customers'],
    queryFn: async () => {
      if (USE_MOCK_DATA) return MOCK_CUSTOMERS;
      const { collection, getDocs } = await import('firebase/firestore')
      const { db } = await import('../../firebase/firebase')
      const snap = await getDocs(collection(db, 'customers'))
      return snap.docs.map((doc) => ({ id: doc.id, ...doc.data() }))
    }
  })

  const updateOutletMutation = useMutation({
    mutationFn: async ({ id, updates }) => {
      const { data } = await apiClient.patch(`/api/admin/outlets/${id}/settings`, updates)
      return data
    },
    onSuccess: () => {
      queryClient.invalidateQueries(['admin-outlets'])
      setSettingsDialogOpen(false)
      toast.success('Outlet settings updated successfully')
    },
    onError: (err) => {
      toast.error(err?.response?.data?.error || 'Failed to update outlet settings')
    }
  })

  const outlets = outletPayload?.outlets || []

  const adminAccounts = useMemo(() => {
    return customers.map(c => {
      const custOutlets = outlets.filter(o => o.customerId === c.id)
      const aiReplies = custOutlets.reduce((acc, o) => acc + (o.reviewCount || 0), 0)
      const waAlerts = custOutlets.reduce((acc, o) => acc + (o.escalations || 0), 0)
      
      return {
        id: c.id,
        customerName: c.name || 'Unknown',
        planType: c.plan || 'Free Trial',
        aiReplies: aiReplies,
        waAlerts: waAlerts,
        aiCost: aiReplies * 0.01,
        waCost: waAlerts * 0.05,
        original: c
      }
    })
  }, [outlets, customers])

  if (!usage) return <div className="p-8 text-center text-slatey-500">Loading Usage Data...</div>

  const { global, highUsageCustomers, lowUsageCustomers, marginRiskAccounts } = usage

  const handleOpenSettings = (outletData) => {
    setSelectedOutlet({
      ...outletData.original,
      aiUsageLimit: outletData.original.aiUsageLimit || 100,
      isAutomationPaused: outletData.original.isAutomationPaused || false,
      responseTone: outletData.original.responseTone || 'Professional',
      whatsappAlertNumber: outletData.original.whatsappAlertNumber || '',
    })
    setSettingsDialogOpen(true)
  }

  const submitSettings = () => {
    updateOutletMutation.mutate({
      id: selectedOutlet.id,
      updates: {
        aiUsageLimit: Number(selectedOutlet.aiUsageLimit),
        isAutomationPaused: selectedOutlet.isAutomationPaused,
        responseTone: selectedOutlet.responseTone,
        whatsappAlertNumber: selectedOutlet.whatsappAlertNumber
      }
    })
  }

  return (
    <motion.div className="space-y-6 pb-12" variants={stagger} initial="hidden" animate="show">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <h2 className="text-2xl font-bold text-slatey-900 flex items-center gap-2">
            <Activity className="h-6 w-6 text-brand-600" />
            AI & Automation Usage
          </h2>
          <p className="text-sm text-slatey-500 mt-1">Platform performance, cost estimation, and automation health.</p>
        </div>
        
        <div className="flex flex-wrap items-center gap-2">
          {['Customer', 'Outlet', 'High AI usage', 'Failed automation', 'High cost', 'Low activity', 'Date range'].map(f => (
            <select key={f} className="text-xs font-medium bg-white border border-slatey-200 rounded-lg px-3 py-2 text-slatey-600 outline-none hover:border-brand-300 transition-colors shadow-sm cursor-pointer">
              <option>{f}</option>
            </select>
          ))}
          <Button variant="primary" className="ml-2 shadow-brand text-xs px-3 py-1.5 h-auto">
            <Filter className="h-3.5 w-3.5" /> Apply
          </Button>
        </div>
      </div>

      <motion.div variants={stagger} className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <motion.div variants={item} className="bg-white p-5 rounded-2xl border border-slatey-200 shadow-glow col-span-2 lg:col-span-1">
          <div className="flex items-center gap-3 mb-4">
            <div className="p-2 bg-brand-50 rounded-xl text-brand-600">
              <Bot className="h-5 w-5" />
            </div>
            <h3 className="font-semibold text-slatey-800">AI Engine</h3>
          </div>
          <div className="space-y-3">
            <div className="flex justify-between items-center">
              <span className="text-sm text-slatey-500">Responses Generated</span>
              <span className="font-bold text-slatey-800">{global.aiResponsesGenerated?.toLocaleString() || 0}</span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-sm text-slatey-500">Cost Estimate</span>
              <span className="font-bold text-amber-600">${global.aiCostEstimate?.toFixed(2) || '0.00'}</span>
            </div>
            <div className="flex justify-between items-center pt-2 border-t border-slatey-100">
              <span className="text-sm text-slatey-500 flex items-center gap-1"><XOctagon className="h-3 w-3 text-rose-500"/> Failed Responses</span>
              <span className="font-bold text-rose-600">{global.failedAiResponses || 0}</span>
            </div>
          </div>
        </motion.div>

        <motion.div variants={item} className="bg-white p-5 rounded-2xl border border-slatey-200 shadow-glow col-span-2 lg:col-span-1">
          <div className="flex items-center gap-3 mb-4">
            <div className="p-2 bg-emerald-50 rounded-xl text-emerald-600">
              <MessageSquareWarning className="h-5 w-5" />
            </div>
            <h3 className="font-semibold text-slatey-800">WhatsApp Alerts</h3>
          </div>
          <div className="space-y-3">
            <div className="flex justify-between items-center">
              <span className="text-sm text-slatey-500">Alerts Sent</span>
              <span className="font-bold text-slatey-800">{global.whatsappAlertsSent?.toLocaleString() || 0}</span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-sm text-slatey-500">Cost Estimate</span>
              <span className="font-bold text-amber-600">${global.whatsappCostEstimate?.toFixed(2) || '0.00'}</span>
            </div>
            <div className="flex justify-between items-center pt-2 border-t border-slatey-100">
              <span className="text-sm text-slatey-500 flex items-center gap-1"><XOctagon className="h-3 w-3 text-rose-500"/> Failed Alerts</span>
              <span className="font-bold text-rose-600">{global.failedWhatsappAlerts || 0}</span>
            </div>
          </div>
        </motion.div>

        <motion.div variants={item} className="bg-white p-5 rounded-2xl border border-slatey-200 shadow-glow col-span-2 flex flex-col">
          <div className="flex items-center gap-3 mb-4">
            <div className="p-2 bg-blue-50 rounded-xl text-blue-600">
              <DatabaseZap className="h-5 w-5" />
            </div>
            <h3 className="font-semibold text-slatey-800">System Health & Sync</h3>
          </div>
          <div className="grid grid-cols-2 gap-4 flex-1">
            <div className="flex flex-col justify-center bg-slatey-50 rounded-xl p-4 border border-slatey-100">
              <span className="text-sm text-slatey-500 mb-1">Automation Success</span>
              <div className="flex items-end gap-2">
                <span className="text-2xl font-bold text-emerald-600">{global.automationSuccessRate || 100}%</span>
                <Sparkles className="h-4 w-4 text-emerald-500 mb-1" />
              </div>
            </div>
            <div className="flex flex-col justify-center bg-rose-50/50 rounded-xl p-4 border border-rose-100">
              <span className="text-sm text-slatey-600 mb-1">Review Sync Failures</span>
              <div className="flex items-end gap-2">
                <span className="text-2xl font-bold text-rose-600">{global.reviewSyncFailures || 0}</span>
                <AlertCircle className="h-4 w-4 text-rose-500 mb-1" />
              </div>
            </div>
          </div>
        </motion.div>
      </motion.div>

      <div className="grid gap-6 md:grid-cols-3">
        <motion.div variants={item} className="bg-white p-5 rounded-2xl border border-slatey-200 shadow-glow">
          <h3 className="text-sm font-semibold text-brand-700 bg-brand-50 w-fit px-2 py-1 rounded-md mb-4 flex items-center gap-1">
            <TrendingUp className="h-3 w-3" /> High Usage Customers
          </h3>
          <div className="space-y-4">
            {highUsageCustomers?.map((c, i) => (
              <div key={i} className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-slatey-800">{c.name}</p>
                  <p className="text-[10px] text-slatey-400 mt-0.5">{c.aiResponses.toLocaleString()} responses</p>
                </div>
                <span className="text-xs font-bold text-amber-600 bg-amber-50 px-2 py-1 rounded-lg">${c.cost.toFixed(2)}</span>
              </div>
            ))}
          </div>
        </motion.div>

        <motion.div variants={item} className="bg-white p-5 rounded-2xl border border-slatey-200 shadow-glow">
          <h3 className="text-sm font-semibold text-slatey-600 bg-slatey-100 w-fit px-2 py-1 rounded-md mb-4 flex items-center gap-1">
             Low Usage Customers
          </h3>
          <div className="space-y-4">
            {lowUsageCustomers?.map((c, i) => (
              <div key={i} className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-slatey-800">{c.name}</p>
                  <p className="text-[10px] text-slatey-400 mt-0.5">{c.status}</p>
                </div>
                <span className="text-xs font-bold text-slatey-500">{c.aiResponses} usages</span>
              </div>
            ))}
          </div>
        </motion.div>

        <motion.div variants={item} className="bg-white p-5 rounded-2xl border border-rose-200 shadow-glow ring-1 ring-rose-50">
          <h3 className="text-sm font-semibold text-rose-700 bg-rose-50 w-fit px-2 py-1 rounded-md mb-4 flex items-center gap-1">
            <ShieldAlert className="h-3 w-3" /> Margin Risk Accounts
          </h3>
          <div className="space-y-4">
            {marginRiskAccounts?.map((c, i) => (
              <div key={i} className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-slatey-800">{c.name}</p>
                  <p className="text-[10px] text-slatey-400 mt-0.5">Fee: ${c.monthlyFee} | Cost: ${c.cost}</p>
                </div>
                <span className="text-xs font-bold text-rose-600 bg-rose-50 px-2 py-1 rounded-lg">{c.margin}</span>
              </div>
            ))}
          </div>
        </motion.div>
      </div>

      <motion.div variants={item} className="bg-white rounded-2xl border border-slatey-200 shadow-glow overflow-hidden">
        <div className="px-6 py-5 border-b border-slatey-100 flex items-center justify-between">
          <div>
            <h3 className="text-base font-bold text-slatey-900">Automation Accounts & Billing</h3>
            <p className="text-xs text-slatey-500 mt-1">Control API access, limits, and retry failed webhooks directly.</p>
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm border-collapse">
            <thead className="bg-slatey-50/80 text-xs font-medium uppercase tracking-wider text-slatey-500">
              <tr>
                <th className="px-6 py-4">Customer Name</th>
                <th className="px-6 py-4">Plan Type</th>
                <th className="px-6 py-4">AI Replies</th>
                <th className="px-6 py-4">WA Alerts</th>
                <th className="px-6 py-4">Cost (AI)</th>
                <th className="px-6 py-4">Cost (WA)</th>
                <th className="px-6 py-4 text-right">Admin Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slatey-100">
              {adminAccounts.map((acc) => (
                <tr key={acc.id} className="group hover:bg-slatey-50/50 transition-colors">
                  <td className="px-6 py-4 font-semibold text-slatey-800">
                    {acc.customerName}
                  </td>
                  <td className="px-6 py-4">
                    <span className="inline-flex px-2 py-1 rounded-md text-[11px] font-bold uppercase tracking-wider bg-slatey-100 text-slatey-700">
                      {acc.planType}
                    </span>
                  </td>
                  <td className="px-6 py-4 font-medium text-slatey-700">
                    {acc.aiReplies.toLocaleString()}
                  </td>
                  <td className="px-6 py-4 font-medium text-slatey-700">
                    {acc.waAlerts.toLocaleString()}
                  </td>
                  <td className="px-6 py-4">
                    <span className="font-bold text-slatey-800">${acc.aiCost.toFixed(2)}</span>
                  </td>
                  <td className="px-6 py-4">
                    <span className="font-bold text-slatey-800">${acc.waCost.toFixed(2)}</span>
                  </td>
                  <td className="px-6 py-4 text-right">
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <button className="p-1.5 rounded-md hover:bg-slatey-100 text-slatey-400 hover:text-slatey-700 transition">
                          <MoreVertical className="h-4 w-4" />
                        </button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end" className="w-56">
                        <DropdownMenuItem className="text-xs font-medium cursor-pointer" onClick={() => handleOpenSettings(acc)}>
                          <Edit className="h-4 w-4 mr-2" /> Edit Outlet Settings
                        </DropdownMenuItem>
                        <DropdownMenuItem className="text-xs font-medium text-brand-600 cursor-pointer" onClick={() => toast.success('Retrying failed automation...')}>
                          Retry failed automation
                        </DropdownMenuItem>
                        <DropdownMenuItem className="text-xs cursor-pointer" onClick={() => toast.success('Reconnecting outlet...')}>
                          Reconnect outlet
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </motion.div>

      <DialogRoot open={settingsDialogOpen} onOpenChange={setSettingsDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogTitle>Update Outlet Settings</DialogTitle>
          <DialogDescription>Manage automation limits and configuration.</DialogDescription>
          {selectedOutlet && (
            <div className="mt-4 space-y-4">
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-slatey-500">AI Usage Limit ($)</label>
                <Input type="number" value={selectedOutlet.aiUsageLimit} onChange={e => setSelectedOutlet(p => ({...p, aiUsageLimit: e.target.value}))} />
              </div>
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-slatey-500">Response Tone</label>
                <select 
                  className="w-full rounded-xl border border-slatey-200 px-3 py-2 text-sm outline-none focus:border-brand-400"
                  value={selectedOutlet.responseTone}
                  onChange={e => setSelectedOutlet(p => ({...p, responseTone: e.target.value}))}
                >
                  <option value="Professional">Professional</option>
                  <option value="Friendly">Friendly</option>
                  <option value="Empathetic">Empathetic</option>
                </select>
              </div>
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-slatey-500">WhatsApp Alert Number</label>
                <Input value={selectedOutlet.whatsappAlertNumber} onChange={e => setSelectedOutlet(p => ({...p, whatsappAlertNumber: e.target.value}))} />
              </div>
              <div className="flex gap-4">
                <label className="flex items-center gap-2 text-sm text-slatey-700">
                  <input type="checkbox" checked={selectedOutlet.isAutomationPaused} onChange={e => setSelectedOutlet(p => ({...p, isAutomationPaused: e.target.checked}))} />
                  Pause AI Automation
                </label>
              </div>
            </div>
          )}
          <div className="mt-6 flex justify-end gap-3">
            <Button variant="ghost" onClick={() => setSettingsDialogOpen(false)}>Cancel</Button>
            <Button onClick={submitSettings} isLoading={updateOutletMutation.isPending}>Save Settings</Button>
          </div>
        </DialogContent>
      </DialogRoot>
    </motion.div>
  )
}
