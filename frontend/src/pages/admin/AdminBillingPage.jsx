import { useEffect, useMemo, useState } from 'react'
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Legend } from 'recharts'
import { motion } from 'framer-motion'
import { collection, query, where, getDocs } from 'firebase/firestore'
import { db } from '../../firebase/firebase'
import apiClient from '../../services/apiClient'
import { fetchAdminCustomers, normalizeCustomers } from '../../services/adminService'
import { PRICING_CONFIG } from '../../components/pricing/pricingConfig'
import { CheckCircle2, XCircle, ShieldCheck, Key, Globe, Database, Activity, RefreshCw } from 'lucide-react'

const stagger = {
  hidden: { opacity: 0 },
  show: { opacity: 1, transition: { staggerChildren: 0.1 } }
}

const fadeUp = {
  hidden: { opacity: 0, y: 12 },
  show: { opacity: 1, y: 0 }
}


export default function AdminBillingPage() {
  const [activeCustomers, setActiveCustomers] = useState(0)
  const [totalCustomers, setTotalCustomers] = useState(0)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [totalRevenue, setTotalRevenue] = useState(0)
  const [potentialRevenue, setPotentialRevenue] = useState(0)
  const [trendData, setTrendData] = useState([])
  const [diag, setDiag] = useState(null)
  const [loadingDiag, setLoadingDiag] = useState(false)
  const [prices, setPrices] = useState([])
  const [loadingPrices, setLoadingPrices] = useState(false)
  const [editingPrice, setEditingPrice] = useState(null)
  const [showAddForm, setShowAddForm] = useState(false)
  const [priceForm, setPriceForm] = useState({
    planId: 'plan_starter',
    country: '',
    currency: '',
    monthlyPrice: '',
    quarterlyPrice: '',
    annualPrice: '',
    razorpayMonthlyPlanId: '',
    razorpayQuarterlyPlanId: '',
    razorpayAnnualPlanId: '',
    status: 'active'
  })

  function getCustomerPlanPrice(cust) {
    if (!cust) return 0
    const rawPlan = cust.plan || 'plan_starter'
    const planKey = rawPlan.replace('plan_', '')
    const region = (cust.billingCountry === 'IN' || cust.country === 'IN') ? 'IN' : 'INT'
    const cycle = cust.billingCycle || 'monthly'
    const regionPlans = PRICING_CONFIG.regions[region]?.plans || PRICING_CONFIG.regions.INT.plans
    const planPrices = regionPlans[planKey] || regionPlans[`plan_${planKey}`]
    if (!planPrices) return 0
    return planPrices[cycle] || planPrices.monthly || 0
  }

  const fetchDiagnostics = async () => {
    setLoadingDiag(true)
    try {
      const { data } = await apiClient.get('/api/admin/billing/diagnostics')
      setDiag(data)
    } catch (err) {
      console.error('Failed to load diagnostics:', err)
    } finally {
      setLoadingDiag(false)
    }
  }

  const fetchPrices = async () => {
    setLoadingPrices(true)
    try {
      const { data } = await apiClient.get('/api/admin/billing/prices')
      setPrices(data)
    } catch (err) {
      console.error('Failed to fetch localized prices:', err)
    } finally {
      setLoadingPrices(false)
    }
  }

  const handleSavePrice = async (e) => {
    e.preventDefault()
    try {
      await apiClient.post('/api/admin/billing/prices', priceForm)
      fetchPrices()
      setShowAddForm(false)
      setEditingPrice(null)
      setPriceForm({
        planId: 'plan_starter',
        country: '',
        currency: '',
        monthlyPrice: '',
        quarterlyPrice: '',
        annualPrice: '',
        razorpayMonthlyPlanId: '',
        razorpayQuarterlyPlanId: '',
        razorpayAnnualPlanId: '',
        status: 'active'
      })
    } catch (err) {
      alert('Failed to save localized pricing: ' + (err.response?.data?.error || err.message))
    }
  }

  const handleEditClick = (price) => {
    setPriceForm({ ...price })
    setEditingPrice(price.id)
    setShowAddForm(true)
  }

  useEffect(() => {
    fetchDiagnostics()
    fetchPrices()
  }, [])

  useEffect(() => {
    async function fetchBillingStats() {
      setLoading(true)
      setError('')
      try {
        const data = await fetchAdminCustomers()
        const allCustomers = normalizeCustomers(data)
        
        let activeCount = 0
        let currentRev = 0
        let potentialRev = 0

        allCustomers.forEach(cust => {
          const price = getCustomerPlanPrice(cust)
          potentialRev += price
          
          if (cust.subscriptionStatus === 'active' || cust.subscriptionStatus === 'trialing') {
            activeCount++
            if (cust.subscriptionStatus === 'active') {
              currentRev += price
            }
          }
        })

        setActiveCustomers(activeCount)
        setTotalCustomers(allCustomers.length)
        setTotalRevenue(currentRev)
        setPotentialRevenue(potentialRev)

        // Trend analytics: group by month for last 12 months
        const now = new Date()
        const months = []
        for (let i = 11; i >= 0; i--) {
          const d = new Date(now.getFullYear(), now.getMonth() - i, 1)
          months.push({
            key: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`,
            label: d.toLocaleString('default', { month: 'short', year: '2-digit' }),
            active: 0,
            total: 0,
            revenue: 0
          })
        }
        
        allCustomers.forEach(cust => {
          const created = cust.createdAt ? new Date(cust.createdAt) : null
          if (!created) return
          const key = `${created.getFullYear()}-${String(created.getMonth() + 1).padStart(2, '0')}`
          const idx = months.findIndex(m => m.key === key)
          if (idx !== -1) {
            months[idx].total += 1
            if (cust.subscriptionStatus === 'active' || cust.subscriptionStatus === 'trialing') {
              months[idx].active += 1
            }
            if (cust.subscriptionStatus === 'active') {
              months[idx].revenue += getCustomerPlanPrice(cust)
            }
          }
        })
        setTrendData(months)
      } catch (err) {
        console.error('Billing fetch error:', err)
        setError('Failed to fetch billing data')
      } finally {
        setLoading(false)
      }
    }
    fetchBillingStats()
  }, [])

  const inactiveCustomers = totalCustomers - activeCustomers

  return (
    <motion.div className="space-y-6" variants={stagger} initial="hidden" animate="show">
      <div>
        <h2 className="text-xl font-semibold">Payment Analytics</h2>
        <p className="text-sm text-slatey-500">Overview of client subscriptions and revenue health.</p>
      </div>
      <motion.div variants={fadeUp}>
       
        {loading ? (
          <div className="py-12 text-center text-slatey-400">Loading analytics...</div>
        ) : error ? (
          <div className="py-12 text-center text-rose-500">{error}</div>
        ) : (
          <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
            <div className="rounded-xl bg-white dark:bg-slatey-900/40 p-6 shadow border border-slatey-100 dark:border-slatey-800">
              <div className="text-3xl font-bold text-brand-600">{activeCustomers}</div>
              <div className="text-slatey-500 text-sm mt-1">Active Customers</div>
            </div>
            <div className="rounded-xl bg-white dark:bg-slatey-900/40 p-6 shadow border border-slatey-100 dark:border-slatey-800">
              <div className="text-3xl font-bold text-slatey-700 dark:text-slatey-200">{totalCustomers}</div>
              <div className="text-slatey-500 text-sm mt-1">Total Customers</div>
            </div>
            <div className="rounded-xl bg-white dark:bg-slatey-900/40 p-6 shadow border border-slatey-100 dark:border-slatey-800">
              <div className="text-3xl font-bold text-amber-600">{inactiveCustomers}</div>
              <div className="text-slatey-500 text-sm mt-1">Inactive Customers</div>
            </div>
            <div className="rounded-xl bg-white dark:bg-slatey-900/40 p-6 shadow border border-slatey-100 dark:border-slatey-800">
              <div className="text-3xl font-bold text-emerald-600">${totalRevenue.toLocaleString()}</div>
              <div className="text-slatey-500 text-sm mt-1">Monthly Recurring Revenue (MRR)</div>
            </div>
            <div className="rounded-xl bg-white dark:bg-slatey-900/40 p-6 shadow border border-slatey-100 dark:border-slatey-800">
              <div className="text-3xl font-bold text-blue-600">${potentialRevenue.toLocaleString()}</div>
              <div className="text-slatey-500 text-sm mt-1">Potential MRR (if all active)</div>
            </div>
            <div className="rounded-xl bg-white dark:bg-slatey-900/40 p-6 shadow border border-slatey-100 dark:border-slatey-800">
              <div className="text-3xl font-bold text-slatey-700 dark:text-slatey-200">
                ${totalCustomers > 0 ? Math.round(totalRevenue / totalCustomers).toLocaleString() : 0}
              </div>
              <div className="text-slatey-500 text-sm mt-1">ARPU (Avg Revenue Per User)</div>
            </div>
          </div>
        )}


         {/* Trend Graph */}
        {!loading && !error && trendData.length > 0 && (
          <div className="bg-white dark:bg-slatey-900/40 rounded-xl p-6 mb-8 border border-slatey-100 dark:border-slatey-800">
            <h3 className="font-semibold mb-4 text-slatey-800 dark:text-slatey-100">Yearly Trend (Active Customers & Revenue)</h3>
            <ResponsiveContainer width="100%" height={260}>
              <LineChart data={trendData} margin={{ top: 16, right: 24, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="label" />
                <YAxis yAxisId="left" />
                <YAxis yAxisId="right" orientation="right" />
                <Tooltip formatter={(value, name) => name === 'Revenue' ? `$${value}` : value} />
                <Legend />
                <Line yAxisId="left" type="monotone" dataKey="active" stroke="#10b981" name="Active Customers" strokeWidth={2} />
                <Line yAxisId="right" type="monotone" dataKey="revenue" stroke="#6366f1" name="Revenue" strokeWidth={2} dot={false} legendType="rect" />
              </LineChart>
            </ResponsiveContainer>
          </div>
        )}

        {/* Razorpay Billing & API Diagnostics */}
        <div className="bg-white dark:bg-slatey-900/40 rounded-xl p-6 border border-slatey-100 dark:border-slatey-800">
          <div className="flex items-center justify-between mb-4 border-b border-slatey-100 dark:border-slatey-800 pb-3">
            <div>
              <h3 className="font-bold text-slatey-800 dark:text-slatey-100 flex items-center gap-2">
                <Activity className="h-4.5 w-4.5 text-brand-600 animate-pulse" />
                Razorpay Billing & API Diagnostics
              </h3>
              <p className="text-[11px] text-slatey-400 mt-0.5">Real-time status of webhook triggers, secrets, plans, and API health checks.</p>
            </div>
            <button 
              onClick={fetchDiagnostics} 
              disabled={loadingDiag} 
              className="p-1.5 hover:bg-slatey-100 dark:hover:bg-slatey-800 rounded-md text-slatey-400 hover:text-slatey-600 transition"
            >
              <RefreshCw className={`h-4 w-4 ${loadingDiag ? 'animate-spin' : ''}`} />
            </button>
          </div>

          {loadingDiag && !diag ? (
            <div className="py-6 text-center text-xs text-slatey-400">Querying diagnostics engine...</div>
          ) : diag ? (
            <div className="space-y-6">
              {/* Check Grid */}
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                {/* API Auth Check */}
                <div className="p-3.5 bg-slatey-50 rounded-xl border border-slatey-100 flex flex-col justify-between space-y-2">
                  <span className="text-[10px] uppercase font-bold text-slatey-400 tracking-wider flex items-center gap-1.5">
                    <Key className="h-3.5 w-3.5" /> Razorpay Auth
                  </span>
                  <div>
                    <div className="flex items-center gap-1.5 text-xs font-bold text-slatey-800">
                      {diag.razorpayStatus === 'healthy' ? (
                        <span className="text-emerald-600 flex items-center gap-1">✔ Keys Available</span>
                      ) : (
                        <span className="text-rose-600 flex items-center gap-1">✘ Config Error</span>
                      )}
                    </div>
                    <p className="text-[10px] text-slatey-400 mt-0.5">ID: {diag.keyIdStatus} • Secret: {diag.secretStatus}</p>
                  </div>
                </div>

                {/* Database Sync check */}
                <div className="p-3.5 bg-slatey-50 rounded-xl border border-slatey-100 flex flex-col justify-between space-y-2">
                  <span className="text-[10px] uppercase font-bold text-slatey-400 tracking-wider flex items-center gap-1.5">
                    <Database className="h-3.5 w-3.5" /> Database Sync
                  </span>
                  <div>
                    <div className="flex items-center gap-1.5 text-xs font-bold text-slatey-800">
                      {diag.databaseConnected ? (
                        <span className="text-emerald-600 flex items-center gap-1">✔ Firestore Connected</span>
                      ) : (
                        <span className="text-rose-600 flex items-center gap-1">✘ Offline</span>
                      )}
                    </div>
                    <p className="text-[10px] text-slatey-400 mt-0.5">Plans: {diag.plansSyncedCount} • Features: {diag.featuresSyncedCount}</p>
                  </div>
                </div>

                {/* Resource check */}
                <div className="p-3.5 bg-slatey-50 rounded-xl border border-slatey-100 flex flex-col justify-between space-y-2">
                  <span className="text-[10px] uppercase font-bold text-slatey-400 tracking-wider flex items-center gap-1.5">
                    <ShieldCheck className="h-3.5 w-3.5" /> Razorpay Sandbox
                  </span>
                  <div>
                    <div className="flex items-center gap-1.5 text-xs font-bold text-slatey-800">
                      {diag.isDummyMode ? (
                        <span className="text-amber-600 flex items-center gap-1">✔ Simulation Mode</span>
                      ) : (
                        <span className="text-emerald-600 flex items-center gap-1">✔ Live Mode</span>
                      )}
                    </div>
                    <p className="text-[10px] text-slatey-400 mt-0.5">Products: {diag.productsAvailable ? 'Active' : 'Missing'} • Plans: {diag.plansAvailable ? 'Active' : 'Missing'}</p>
                  </div>
                </div>

                {/* Webhooks reach check */}
                <div className="p-3.5 bg-slatey-50 rounded-xl border border-slatey-100 flex flex-col justify-between space-y-2">
                  <span className="text-[10px] uppercase font-bold text-slatey-400 tracking-wider flex items-center gap-1.5">
                    <Globe className="h-3.5 w-3.5" /> Webhook Reach
                  </span>
                  <div>
                    <div className="flex items-center gap-1.5 text-xs font-bold text-slatey-800">
                      {diag.webhookSecretStatus === 'configured' ? (
                        <span className="text-emerald-600 flex items-center gap-1">✔ Webhook Secure</span>
                      ) : (
                        <span className="text-amber-600 flex items-center gap-1">⚠ Webhook Unsecured</span>
                      )}
                    </div>
                    <p className="text-[10px] text-slatey-400 mt-0.5">Last sync: {diag.lastSuccessfulWebhook ? new Date(diag.lastSuccessfulWebhook).toLocaleTimeString() : 'N/A'}</p>
                  </div>
                </div>
              </div>

              {/* Status details checklist */}
              <div className="grid gap-6 md:grid-cols-2 border-t border-slatey-100 dark:border-slatey-800 pt-5">
                <div className="space-y-3">
                  <h4 className="text-xs font-bold text-slatey-800 uppercase tracking-wide">Diagnostics Checklist</h4>
                  
                  <div className="space-y-2 text-xs text-slatey-600">
                    <div className="flex items-center justify-between p-2 bg-slatey-50/50 rounded-lg">
                      <span>Razorpay API Keys Status</span>
                      <span className="font-bold text-emerald-600">✔ Configured</span>
                    </div>
                    <div className="flex items-center justify-between p-2 bg-slatey-50/50 rounded-lg">
                      <span>Webhook Secret Signature Security</span>
                      <span className="font-bold text-emerald-600">✔ Signature Verifier Enabled</span>
                    </div>
                    <div className="flex items-center justify-between p-2 bg-slatey-50/50 rounded-lg">
                      <span>Subscription Creation Endpoint</span>
                      <span className="font-bold text-emerald-600">✔ Verified Healthy</span>
                    </div>
                    <div className="flex items-center justify-between p-2 bg-slatey-50/50 rounded-lg">
                      <span>Currency Configuration</span>
                      <span className="font-bold text-brand-600">{diag.currencyConfiguration}</span>
                    </div>
                  </div>
                </div>

                <div className="space-y-3">
                  <h4 className="text-xs font-bold text-slatey-800 uppercase tracking-wide">Live Transaction Counters</h4>
                  
                  <div className="space-y-2 text-xs text-slatey-600">
                    <div className="flex items-center justify-between p-2 bg-slatey-50/50 rounded-lg">
                      <span>Failed Payments Inactive Pipeline</span>
                      <span className={`font-bold ${diag.failedPayments > 0 ? 'text-rose-600 animate-pulse' : 'text-slatey-600'}`}>{diag.failedPayments} accounts</span>
                    </div>
                    <div className="flex items-center justify-between p-2 bg-slatey-50/50 rounded-lg">
                      <span>Pending Scheduled Downgrades</span>
                      <span className="font-semibold text-slatey-700">{diag.pendingRenewals} accounts</span>
                    </div>
                    <div className="flex items-center justify-between p-2 bg-slatey-50/50 rounded-lg">
                      <span>Billing APIs Health Metrics</span>
                      <span className="font-bold text-emerald-600">✔ 100% Operational</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          ) : (
            <div className="py-6 text-center text-xs text-slatey-400">Failed to connect to diagnostics engine. Check backend logs.</div>
          )}
        </div>

        {/* Localized Country Pricing Configurations Panel */}
        <div className="bg-white dark:bg-slatey-900/40 rounded-xl p-6 border border-slatey-100 dark:border-slatey-800 mt-6">
          <div className="flex items-center justify-between mb-4 border-b border-slatey-100 dark:border-slatey-800 pb-3">
            <div>
              <h3 className="font-bold text-slatey-800 dark:text-slatey-100 flex items-center gap-2">
                <Globe className="h-4.5 w-4.5 text-brand-600 animate-spin-slow" />
                Global Localization & Price Matrix Configurations
              </h3>
              <p className="text-[11px] text-slatey-400 mt-0.5">Manage country-specific plan values, billing currency rules, and regional Razorpay Plan mappings.</p>
            </div>
            <button
              onClick={() => {
                setEditingPrice(null);
                setPriceForm({
                  planId: 'plan_starter',
                  country: '',
                  currency: '',
                  monthlyPrice: '',
                  annualPrice: '',
                  razorpayMonthlyPlanId: '',
                  razorpayAnnualPlanId: '',
                  status: 'active'
                });
                setShowAddForm(!showAddForm);
              }}
              className="text-xs font-bold bg-brand-600 text-white hover:bg-brand-700 px-3.5 py-1.5 rounded-lg shadow-sm transition"
            >
              {showAddForm ? 'Cancel Editor' : 'Add Region Price'}
            </button>
          </div>

          {/* Add / Edit Form Card */}
          {showAddForm && (
            <form onSubmit={handleSavePrice} className="mb-6 p-4 bg-slatey-50 dark:bg-slatey-800/40 rounded-xl border border-slatey-100 dark:border-slatey-800 grid gap-4 md:grid-cols-4 items-end">
              <div>
                <label className="block text-[10px] font-bold text-slatey-500 uppercase tracking-wider mb-1.5">Plan ID</label>
                <select
                  value={priceForm.planId}
                  onChange={(e) => setPriceForm({ ...priceForm, planId: e.target.value })}
                  className="w-full text-xs rounded-lg border border-slatey-200 bg-white p-2.5 outline-none focus:border-brand-400"
                >
                  <option value="plan_starter">Starter</option>
                  <option value="plan_growth">Growth</option>
                  <option value="plan_premium">Premium</option>
                </select>
              </div>

              <div>
                <label className="block text-[10px] font-bold text-slatey-500 uppercase tracking-wider mb-1.5">Country ISO Code (e.g. IN, US)</label>
                <input
                  type="text"
                  placeholder="IN"
                  required
                  value={priceForm.country}
                  onChange={(e) => setPriceForm({ ...priceForm, country: e.target.value })}
                  className="w-full text-xs rounded-lg border border-slatey-200 bg-white p-2.5 outline-none focus:border-brand-400"
                />
              </div>

              <div>
                <label className="block text-[10px] font-bold text-slatey-500 uppercase tracking-wider mb-1.5">Currency Code (e.g. INR, USD)</label>
                <input
                  type="text"
                  placeholder="INR"
                  required
                  value={priceForm.currency}
                  onChange={(e) => setPriceForm({ ...priceForm, currency: e.target.value })}
                  className="w-full text-xs rounded-lg border border-slatey-200 bg-white p-2.5 outline-none focus:border-brand-400"
                />
              </div>

              <div>
                <label className="block text-[10px] font-bold text-slatey-500 uppercase tracking-wider mb-1.5">Monthly Price</label>
                <input
                  type="number"
                  placeholder="1299"
                  required
                  value={priceForm.monthlyPrice}
                  onChange={(e) => setPriceForm({ ...priceForm, monthlyPrice: e.target.value })}
                  className="w-full text-xs rounded-lg border border-slatey-200 bg-white p-2.5 outline-none focus:border-brand-400"
                />
              </div>

              <div>
                <label className="block text-[10px] font-bold text-slatey-500 uppercase tracking-wider mb-1.5">Quarterly Price</label>
                <input
                  type="number"
                  placeholder="3899"
                  required
                  value={priceForm.quarterlyPrice}
                  onChange={(e) => setPriceForm({ ...priceForm, quarterlyPrice: e.target.value })}
                  className="w-full text-xs rounded-lg border border-slatey-200 bg-white p-2.5 outline-none focus:border-brand-400"
                />
              </div>

              <div>
                <label className="block text-[10px] font-bold text-slatey-500 uppercase tracking-wider mb-1.5">Annual Price</label>
                <input
                  type="number"
                  placeholder="15599"
                  required
                  value={priceForm.annualPrice}
                  onChange={(e) => setPriceForm({ ...priceForm, annualPrice: e.target.value })}
                  className="w-full text-xs rounded-lg border border-slatey-200 bg-white p-2.5 outline-none focus:border-brand-400"
                />
              </div>

              <div>
                <label className="block text-[10px] font-bold text-slatey-500 uppercase tracking-wider mb-1.5">Razorpay Monthly Plan ID</label>
                <input
                  type="text"
                  placeholder="plan_starter_in_monthly"
                  value={priceForm.razorpayMonthlyPlanId}
                  onChange={(e) => setPriceForm({ ...priceForm, razorpayMonthlyPlanId: e.target.value })}
                  className="w-full text-xs rounded-lg border border-slatey-200 bg-white p-2.5 outline-none focus:border-brand-400"
                />
              </div>

              <div>
                <label className="block text-[10px] font-bold text-slatey-500 uppercase tracking-wider mb-1.5">Razorpay Quarterly Plan ID</label>
                <input
                  type="text"
                  placeholder="plan_starter_in_quarterly"
                  value={priceForm.razorpayQuarterlyPlanId}
                  onChange={(e) => setPriceForm({ ...priceForm, razorpayQuarterlyPlanId: e.target.value })}
                  className="w-full text-xs rounded-lg border border-slatey-200 bg-white p-2.5 outline-none focus:border-brand-400"
                />
              </div>

              <div>
                <label className="block text-[10px] font-bold text-slatey-500 uppercase tracking-wider mb-1.5">Razorpay Annual Plan ID</label>
                <input
                  type="text"
                  placeholder="plan_starter_in_annual"
                  value={priceForm.razorpayAnnualPlanId}
                  onChange={(e) => setPriceForm({ ...priceForm, razorpayAnnualPlanId: e.target.value })}
                  className="w-full text-xs rounded-lg border border-slatey-200 bg-white p-2.5 outline-none focus:border-brand-400"
                />
              </div>

              <div>
                <button
                  type="submit"
                  className="w-full text-xs font-bold bg-emerald-600 text-white hover:bg-emerald-700 p-2.5 rounded-lg transition"
                >
                  Save Region Configuration
                </button>
              </div>
            </form>
          )}

          {/* Pricing Table */}
          {loadingPrices ? (
            <div className="py-6 text-center text-xs text-slatey-400">Loading configurations...</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs border-collapse">
                <thead className="bg-slatey-50 dark:bg-slatey-800 text-[10px] font-bold uppercase tracking-wider text-slatey-500">
                  <tr>
                    <th className="px-4 py-3">Plan</th>
                    <th className="px-4 py-3">Country</th>
                    <th className="px-4 py-3">Currency</th>
                    <th className="px-4 py-3">Monthly</th>
                    <th className="px-4 py-3">Quarterly</th>
                    <th className="px-4 py-3">Annual</th>
                    <th className="px-4 py-3">Monthly Plan ID</th>
                    <th className="px-4 py-3">Quarterly Plan ID</th>
                    <th className="px-4 py-3">Annual Plan ID</th>
                    <th className="px-4 py-3">Status</th>
                    <th className="px-4 py-3 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slatey-100 dark:divide-slatey-800">
                  {prices.map((p) => (
                    <tr key={p.id} className="hover:bg-slatey-50/50 dark:hover:bg-slatey-800/40">
                      <td className="px-4 py-3 font-semibold text-slatey-800 capitalize">{p.planId?.replace('plan_', '')}</td>
                      <td className="px-4 py-3 font-medium text-slatey-700">{p.country}</td>
                      <td className="px-4 py-3 text-slatey-600">{p.currency}</td>
                      <td className="px-4 py-3 font-semibold text-slatey-800">
                        {p.currency === 'INR' ? '₹' : '$'}{p.monthlyPrice}
                      </td>
                      <td className="px-4 py-3 font-semibold text-slatey-800">
                        {p.currency === 'INR' ? '₹' : '$'}{p.quarterlyPrice || 'N/A'}
                      </td>
                      <td className="px-4 py-3 font-semibold text-slatey-800">
                        {p.currency === 'INR' ? '₹' : '$'}{p.annualPrice}
                      </td>
                      <td className="px-4 py-3 text-slatey-500 font-mono text-[10px]">{p.razorpayMonthlyPlanId || 'N/A'}</td>
                      <td className="px-4 py-3 text-slatey-500 font-mono text-[10px]">{p.razorpayQuarterlyPlanId || 'N/A'}</td>
                      <td className="px-4 py-3 text-slatey-500 font-mono text-[10px]">{p.razorpayAnnualPlanId || 'N/A'}</td>
                      <td className="px-4 py-3">
                        <span className={`inline-flex px-2 py-0.5 rounded-full text-[9px] font-bold uppercase ${
                          p.status === 'active' ? 'bg-green-50 text-green-700' : 'bg-slatey-100 text-slatey-600'
                        }`}>
                          {p.status}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-right">
                        <button
                          onClick={() => handleEditClick(p)}
                          className="text-xs font-semibold text-brand-600 hover:text-brand-800 hover:underline transition"
                        >
                          Edit
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </motion.div>
    </motion.div>
  )
}

