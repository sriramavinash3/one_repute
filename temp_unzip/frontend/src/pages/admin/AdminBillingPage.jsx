import { useEffect, useState } from 'react'
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Legend } from 'recharts'
import { motion } from 'framer-motion'
import { collection, query, where, getDocs } from 'firebase/firestore'
import { db } from '../../firebase/firebase'

const stagger = {
  hidden: { opacity: 0 },
  show: { opacity: 1, transition: { staggerChildren: 0.1 } }
}

const fadeUp = {
  hidden: { opacity: 0, y: 12 },
  show: { opacity: 1, y: 0 }
}


export default function AdminBillingPage() {
  const [activeOutlets, setActiveOutlets] = useState(0)
  const [totalOutlets, setTotalOutlets] = useState(0)
  const [loading, setLoading] = useState(true)
  const costPerOutlet = Number(import.meta.env.VITE_COST_PER_OUTLET || 0)
  const [error, setError] = useState('')

  const [trendData, setTrendData] = useState([])

  useEffect(() => {
    async function fetchOutletStats() {
      setLoading(true)
      setError('')
      try {
        // Fetch active outlets
        const activeQ = query(collection(db, 'outlets'), where('isActive', '==', true))
        const activeSnap = await getDocs(activeQ)
        setActiveOutlets(activeSnap.size)

        // Fetch total outlets
        const allSnap = await getDocs(collection(db, 'outlets'))
        setTotalOutlets(allSnap.size)

        // Trend analytics: group by month for last 12 months
        const now = new Date()
        const months = []
        for (let i = 11; i >= 0; i--) {
          const d = new Date(now.getFullYear(), now.getMonth() - i, 1)
          months.push({
            key: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`,
            label: d.toLocaleString('default', { month: 'short', year: '2-digit' }),
            active: 0,
            total: 0
          })
        }
        allSnap.forEach(doc => {
          const data = doc.data()
          const created = data.createdAt?.toDate ? data.createdAt.toDate() : (data.createdAt ? new Date(data.createdAt) : null)
          if (!created) return
          const key = `${created.getFullYear()}-${String(created.getMonth() + 1).padStart(2, '0')}`
          const idx = months.findIndex(m => m.key === key)
          if (idx !== -1) {
            months[idx].total += 1
            if (data.isActive) months[idx].active += 1
          }
        })
        setTrendData(months)
      } catch (err) {
        setError('Failed to fetch outlets')
      } finally {
        setLoading(false)
      }
    }
    fetchOutletStats()
  }, [])

  const inactiveOutlets = totalOutlets - activeOutlets
  const totalRevenue = activeOutlets * costPerOutlet
  const potentialRevenue = totalOutlets * costPerOutlet

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
              <div className="text-3xl font-bold text-brand-600">{activeOutlets}</div>
              <div className="text-slatey-500 text-sm mt-1">Active Outlets</div>
            </div>
            <div className="rounded-xl bg-white dark:bg-slatey-900/40 p-6 shadow border border-slatey-100 dark:border-slatey-800">
              <div className="text-3xl font-bold text-slatey-700 dark:text-slatey-200">{totalOutlets}</div>
              <div className="text-slatey-500 text-sm mt-1">Total Outlets</div>
            </div>
            <div className="rounded-xl bg-white dark:bg-slatey-900/40 p-6 shadow border border-slatey-100 dark:border-slatey-800">
              <div className="text-3xl font-bold text-amber-600">{inactiveOutlets}</div>
              <div className="text-slatey-500 text-sm mt-1">Inactive Outlets</div>
            </div>
            <div className="rounded-xl bg-white dark:bg-slatey-900/40 p-6 shadow border border-slatey-100 dark:border-slatey-800">
              <div className="text-3xl font-bold text-emerald-600">₹{totalRevenue.toLocaleString()}</div>
              <div className="text-slatey-500 text-sm mt-1">Total Revenue (Cash)</div>
            </div>
            <div className="rounded-xl bg-white dark:bg-slatey-900/40 p-6 shadow border border-slatey-100 dark:border-slatey-800">
              <div className="text-3xl font-bold text-blue-600">₹{potentialRevenue.toLocaleString()}</div>
              <div className="text-slatey-500 text-sm mt-1">Potential Revenue (if all active)</div>
            </div>
            <div className="rounded-xl bg-white dark:bg-slatey-900/40 p-6 shadow border border-slatey-100 dark:border-slatey-800">
              <div className="text-3xl font-bold text-slatey-700 dark:text-slatey-200">₹{costPerOutlet}</div>
              <div className="text-slatey-500 text-sm mt-1">Cost Per Outlet</div>
            </div>
          </div>
        )}


         {/* Trend Graph */}
        {!loading && !error && trendData.length > 0 && (
          <div className="bg-white dark:bg-slatey-900/40 rounded-xl p-6 mb-8 border border-slatey-100 dark:border-slatey-800">
            <h3 className="font-semibold mb-4 text-slatey-800 dark:text-slatey-100">Yearly Trend (Active Outlets & Revenue)</h3>
            <ResponsiveContainer width="100%" height={260}>
              <LineChart data={trendData} margin={{ top: 16, right: 24, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="label" />
                <YAxis />
                <Tooltip formatter={(value, name) => name === 'revenue' ? `₹${value}` : value} />
                <Legend />
                <Line type="monotone" dataKey="active" stroke="#10b981" name="Active Outlets" strokeWidth={2} />
                <Line type="monotone" dataKey={d => d.active * costPerOutlet} stroke="#6366f1" name="Revenue" strokeWidth={2} dot={false} legendType="rect" />
              </LineChart>
            </ResponsiveContainer>
          </div>
        )}
      </motion.div>
    </motion.div>
  )
}

