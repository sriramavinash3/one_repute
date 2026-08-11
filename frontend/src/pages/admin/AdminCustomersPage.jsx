import { useState, useMemo } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { motion, AnimatePresence } from 'framer-motion'
import { Search, Building2, Store, ExternalLink, MoreVertical, Edit, TriangleAlert, TrendingUp } from 'lucide-react'
import { collection, getDocs } from 'firebase/firestore'
import { db } from '../../firebase/firebase'
import { Card } from '../../components/ui/card'
import Button from '../../components/ui/button'
import Input from '../../components/ui/input'
import StatusBadge from '../../components/feedback/StatusBadge'
import EmptyState from '../../components/feedback/EmptyState'
import Skeleton from '../../components/feedback/Skeleton'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '../../components/ui/dropdown-menu'
import { DialogContent, DialogDescription, DialogRoot, DialogTitle } from '../../components/ui/dialog'
import { fetchAdminOutlets } from '../../services/outletService'
import { fetchUsageInsights, fetchAdminCustomers, normalizeCustomers } from '../../services/adminService'
import apiClient from '../../services/apiClient'
import { Link } from 'react-router-dom'
import { USE_MOCK_DATA } from '../../config/env'
import { MOCK_CUSTOMERS, MOCK_OUTLETS } from '../../config/mockData'
import { toast } from 'sonner'

const stagger = {
  hidden: { opacity: 0 },
  show: { opacity: 1, transition: { staggerChildren: 0.05 } }
}

const item = {
  hidden: { opacity: 0, y: 10 },
  show: { opacity: 1, y: 0 }
}

export default function AdminCustomersPage() {
  const [query, setQuery] = useState('')
  const [planFilter, setPlanFilter] = useState('all')
  const [statusFilter, setStatusFilter] = useState('all')
  const [editDialogOpen, setEditDialogOpen] = useState(false)
  const [editingCustomer, setEditingCustomer] = useState(null)
  
  const queryClient = useQueryClient()

  const { data: rawCustomers, isLoading: customersLoading, error: customersError, refetch: refetchCustomers } = useQuery({
    queryKey: ['admin-customers'],
    queryFn: async () => {
      if (USE_MOCK_DATA) return MOCK_CUSTOMERS;
      return fetchAdminCustomers()
    }
  })

  const customers = useMemo(() => {
    return normalizeCustomers(rawCustomers)
  }, [rawCustomers]);

  const { data: outletData, isLoading: outletsLoading } = useQuery({
    queryKey: ['admin-outlets'],
    queryFn: async () => {
      if (USE_MOCK_DATA) return { outlets: MOCK_OUTLETS, total: MOCK_OUTLETS.length };
      return fetchAdminOutlets();
    }
  })

  const { data: usageInsights = {}, isLoading: usageLoading } = useQuery({
    queryKey: ['admin-usage-insights'],
    queryFn: async () => fetchUsageInsights()
  })

  const updateCustomerMutation = useMutation({
    mutationFn: async ({ id, updates }) => {
      const { data } = await apiClient.patch(`/api/admin/customers/${id}`, updates)
      return data
    },
    onSuccess: () => {
      queryClient.invalidateQueries(['admin-customers'])
      setEditDialogOpen(false)
      toast.success('Customer updated successfully')
    },
    onError: (err) => {
      toast.error(err?.response?.data?.error || 'Failed to update customer')
    }
  })

  const isLoading = customersLoading || outletsLoading || usageLoading
  const outlets = outletData?.outlets || []

  // Map to count outlets per customer
  const outletCountMap = useMemo(() => {
    const counts = {}
    outlets.forEach(o => {
      if (o.customerId) {
        counts[o.customerId] = (counts[o.customerId] || 0) + 1
      }
    })
    return counts
  }, [outlets])

  // Extract usage from usageInsights payload
  const usageMap = useMemo(() => {
    const map = {}
    const arr = [
      ...(usageInsights.highUsageCustomers || []),
      ...(usageInsights.lowUsageCustomers || []),
      ...(usageInsights.marginRiskAccounts || [])
    ]
    arr.forEach(c => {
      if (c.customerId && !map[c.customerId]) {
        map[c.customerId] = c
      }
    })
    return map
  }, [usageInsights])

  const filtered = useMemo(() => {
    if (!Array.isArray(customers)) return []
    return customers.filter(c => {
      const q = query.trim().toLowerCase()
      const searchMatch = !q ||
        c.name?.toLowerCase().includes(q) ||
        c.id?.toLowerCase().includes(q) ||
        c.email?.toLowerCase().includes(q) ||
        c.contactPerson?.toLowerCase().includes(q)

      const customerPlan = (c.plan || '').toLowerCase().replace('plan_', '')
      const targetPlan = planFilter.toLowerCase().replace('plan_', '')
      const planMatch = planFilter === 'all' || customerPlan === targetPlan || customerPlan.includes(targetPlan)

      const cStatus = (c.accountStatus || c.subscriptionStatus || 'Active').toLowerCase()
      const statusMatch = statusFilter === 'all' ||
        cStatus === statusFilter.toLowerCase() ||
        (statusFilter.toLowerCase() === 'active' && (cStatus === 'active' || cStatus === 'trialing' || cStatus === 'trial')) ||
        (statusFilter.toLowerCase() === 'trial' && (cStatus === 'trial' || cStatus === 'trialing')) ||
        (statusFilter.toLowerCase() === 'inactive' && (cStatus === 'inactive' || cStatus === 'canceled'))

      return searchMatch && planMatch && statusMatch
    })
  }, [customers, query, planFilter, statusFilter])

  const handleEditCustomer = (customer) => {
    setEditingCustomer({ ...customer })
    setEditDialogOpen(true)
  }

  const submitEdit = () => {
    updateCustomerMutation.mutate({
      id: editingCustomer.id,
      updates: {
        contactPerson: editingCustomer.contactPerson,
        email: editingCustomer.email,
        phone: editingCustomer.phone,
        renewalDate: editingCustomer.renewalDate,
        internalNote: editingCustomer.internalNote,
        isChurnRisk: editingCustomer.isChurnRisk,
        isUpsellTarget: editingCustomer.isUpsellTarget
      }
    })
  }

  return (
    <motion.div className="space-y-6" variants={stagger} initial="hidden" animate="show">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold text-slatey-900">Customers Management</h2>
          <p className="text-sm text-slatey-500">Manage customer accounts, usage, and subscriptions.</p>
        </div>
      </div>

      <Card className="p-4 border-none shadow-glow">
        <div className="flex flex-wrap items-center gap-4">
          <div className="flex flex-1 min-w-[200px] w-full sm:w-auto items-center gap-3 rounded-xl border border-slatey-200 bg-slatey-50/50 px-4 py-2 focus-within:border-brand-400 focus-within:ring-2 focus-within:ring-brand-100 transition-all">
            <Search className="h-4 w-4 text-slatey-400" />
            <input
              className="w-full bg-transparent text-sm text-slatey-700 outline-none"
              placeholder="Search by company name or ID..."
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
          </div>
          <select
            value={planFilter}
            onChange={(e) => setPlanFilter(e.target.value)}
            className="rounded-xl border border-slatey-200 px-3 py-2 text-sm text-slatey-700 outline-none focus:border-brand-400 w-full sm:w-auto"
          >
            <option value="all">All Plans</option>
            <option value="Starter">Starter</option>
            <option value="Growth">Growth</option>
            <option value="Pro">Pro</option>
            <option value="Enterprise">Enterprise</option>
            <option value="Trial">Trial</option>
          </select>
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="rounded-xl border border-slatey-200 px-3 py-2 text-sm text-slatey-700 outline-none focus:border-brand-400 w-full sm:w-auto"
          >
            <option value="all">All Statuses</option>
            <option value="Active">Active</option>
            <option value="Inactive">Inactive</option>
          </select>
        </div>
      </Card>

      <div className="rounded-2xl border border-slatey-200 bg-white shadow-sm dark:border-slatey-800 dark:bg-slatey-900/40 overflow-x-auto">
        <table className="w-full border-collapse text-left text-sm">
          <thead className="bg-slatey-50/80 text-xs font-medium uppercase tracking-wider text-slatey-500 dark:bg-slatey-900 dark:text-slatey-400">
            <tr>
              <th className="px-6 py-4">Customer</th>
              <th className="px-6 py-4">Onboarding & Trial</th>
              <th className="px-6 py-4 text-center">Outlets</th>
              <th className="px-6 py-4 text-center">Reviews</th>
              <th className="px-6 py-4">Subscription</th>
              <th className="px-6 py-4">Billing & Coupon</th>
              <th className="px-6 py-4">Status</th>
              <th className="px-6 py-4 text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slatey-100 dark:divide-slatey-800/50">
            <AnimatePresence mode="popLayout">
              {isLoading ? (
                Array(4).fill(0).map((_, i) => (
                  <tr key={i}>
                    <td className="px-6 py-4" colSpan={8}><Skeleton className="h-12 w-full" /></td>
                  </tr>
                ))
              ) : filtered.length > 0 ? (
                filtered.map((customer) => {
                  const numOutlets = outletCountMap[customer.id] || 0
                  const usage = usageMap[customer.id] || { aiResponses: 0, cost: 0, whatsappAlerts: 0 }
                  const aiCost = (usage.aiResponses * 0.01).toFixed(2)
                  const waCost = (usage.whatsappAlerts * 0.05).toFixed(2)
                  const healthScore = usage.aiResponses > 1000 ? 'Excellent' : (usage.aiResponses > 100 ? 'Good' : 'Needs attention')
                  
                  return (
                    <motion.tr
                      key={customer.id}
                      variants={item}
                      layout
                      className="group transition-colors hover:bg-slatey-50/50 dark:hover:bg-slatey-800/30"
                    >
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-3">
                          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-indigo-50 text-indigo-600 dark:bg-indigo-500/10 dark:text-indigo-400">
                            <Building2 className="h-5 w-5" />
                          </div>
                          <div className="flex flex-col max-w-xs">
                            <span className="font-semibold text-slatey-900 dark:text-slatey-100 whitespace-normal break-words">{customer.name || 'Unknown Company'}</span>
                            <span className="text-[11px] text-slatey-400 font-mono mt-0.5">ID: {customer.id}</span>
                            <span className="text-[11px] text-slatey-500">{customer.industry || 'General'}</span>
                          </div>
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        <div className="flex flex-col">
                          <span className="text-xs text-slatey-600 dark:text-slatey-300">Onboarded: {customer.onboardedDate || 'N/A'}</span>
                          <span className="text-xs text-slatey-500">Trial Ends: {customer.trialEndDate || 'N/A'}</span>
                        </div>
                      </td>
                      <td className="px-6 py-4 text-center">
                        <div className="inline-flex items-center justify-center gap-1.5 rounded-full bg-slatey-100 px-3 py-1 text-xs font-semibold text-slatey-700 dark:bg-slatey-800 dark:text-slatey-300">
                          <Store className="h-3.5 w-3.5 text-slatey-400" />
                          {numOutlets}
                        </div>
                      </td>
                      <td className="px-6 py-4 text-center font-semibold text-slatey-700 dark:text-slatey-300">
                        {usage.totalReviews || 0}
                      </td>
                      <td className="px-6 py-4">
                        <div className="flex flex-col">
                          <span className="text-sm text-slatey-700">{
                            customer.plan === 'plan_starter' ? 'Starter' :
                            customer.plan === 'plan_growth' ? 'Growth' :
                            customer.plan === 'plan_premium' ? 'Premium' :
                            customer.plan || 'Free Trial'
                          }</span>
                          <span className="text-xs text-slatey-500">{customer.billingCycle || 'Monthly'}</span>
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        <div className="flex flex-col gap-0.5">
                          <span className="text-sm text-slatey-700">Renews: {customer.renewalDate || 'N/A'}</span>
                          {customer.discountCode && (
                            <span className="text-[11px] bg-emerald-50 text-emerald-600 px-1.5 py-0.5 rounded font-mono w-max">
                              Coupon: {customer.discountCode}
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        <div className="flex flex-col items-start gap-1">
                          <StatusBadge status={customer.accountStatus || 'Active'} />
                        </div>
                      </td>
                      <td className="px-6 py-4 text-right">
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <button className="rounded-lg p-1.5 text-slatey-400 hover:bg-slatey-50 dark:hover:bg-slatey-800">
                              <MoreVertical className="h-4 w-4" />
                            </button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">

                            <DropdownMenuItem className="flex items-center gap-2 cursor-pointer" onClick={() => handleEditCustomer(customer)}>
                              <Edit className="h-4 w-4" /> Edit Details & Risk
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </td>
                    </motion.tr>
                  )
                })
              ) : (
                <tr>
                  <td colSpan={8} className="py-12">
                    <EmptyState
                      title="No customers found"
                      description="Try adjusting your search query or filters."
                    />
                  </td>
                </tr>
              )}
            </AnimatePresence>
          </tbody>
        </table>
      </div>

      <DialogRoot open={editDialogOpen} onOpenChange={setEditDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogTitle>Update Customer: {editingCustomer?.name}</DialogTitle>
          <DialogDescription>Modify contact info, risk status, or internal notes.</DialogDescription>
          {editingCustomer && (
            <div className="mt-4 space-y-4">
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-slatey-500">Contact Person</label>
                <Input value={editingCustomer.contactPerson || ''} onChange={e => setEditingCustomer(p => ({...p, contactPerson: e.target.value}))} />
              </div>
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-slatey-500">Contact Email</label>
                <Input value={editingCustomer.email || ''} onChange={e => setEditingCustomer(p => ({...p, email: e.target.value}))} />
              </div>
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-slatey-500">WhatsApp Number</label>
                <Input value={editingCustomer.phone || ''} onChange={e => setEditingCustomer(p => ({...p, phone: e.target.value}))} />
              </div>
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-slatey-500">Renewal Date</label>
                <Input type="date" value={editingCustomer.renewalDate || ''} onChange={e => setEditingCustomer(p => ({...p, renewalDate: e.target.value}))} />
              </div>
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-slatey-500">Internal Note</label>
                <textarea 
                  className="w-full rounded-xl border border-slatey-200 p-2 text-sm text-slatey-700 outline-none focus:border-brand-400" 
                  rows={2}
                  value={editingCustomer.internalNote || ''} 
                  onChange={e => setEditingCustomer(p => ({...p, internalNote: e.target.value}))} 
                />
              </div>
              <div className="flex gap-4">
                <label className="flex items-center gap-2 text-sm text-slatey-700">
                  <input type="checkbox" checked={editingCustomer.isChurnRisk || false} onChange={e => setEditingCustomer(p => ({...p, isChurnRisk: e.target.checked}))} />
                  Mark as Churn Risk
                </label>
                <label className="flex items-center gap-2 text-sm text-slatey-700">
                  <input type="checkbox" checked={editingCustomer.isUpsellTarget || false} onChange={e => setEditingCustomer(p => ({...p, isUpsellTarget: e.target.checked}))} />
                  Mark as Upsell Target
                </label>
              </div>
            </div>
          )}
          <div className="mt-6 flex justify-end gap-3">
            <Button variant="ghost" onClick={() => setEditDialogOpen(false)}>Cancel</Button>
            <Button onClick={submitEdit} isLoading={updateCustomerMutation.isPending}>Save Changes</Button>
          </div>
        </DialogContent>
      </DialogRoot>
    </motion.div>
  )
}
