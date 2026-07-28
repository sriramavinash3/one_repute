import { useEffect, useState } from 'react'
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Legend } from 'recharts'
import { motion } from 'framer-motion'
import { collection, query, where, getDocs } from 'firebase/firestore'
import { db } from '../../firebase/firebase'
import apiClient from '../../services/apiClient'

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

  const PLAN_PRICES = {
    plan_starter: 29,
    plan_growth: 79,
    plan_premium: 199
  }

  useEffect(() => {
    async function fetchBillingStats() {
      setLoading(true)
      setError('')
      try {
        const { data } = await apiClient.get('/api/admin/customers')
        const allCustomers = Array.isArray(data) ? data : (data.customers || [])
        
        let activeCount = 0
        let currentRev = 0
        let potentialRev = 0

        allCustomers.forEach(cust => {
          const price = PLAN_PRICES[cust.plan] || 0
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
              months[idx].revenue += (PLAN_PRICES[cust.plan] || 0)
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
      </motion.div>
    </motion.div>
  )
}

