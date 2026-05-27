import { useMemo } from 'react'
import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis, Bar, BarChart, Cell } from 'recharts'
import { motion } from 'framer-motion'
import { TrendingUp, Users, MessageSquare, Activity, Calendar } from 'lucide-react'
import ChartCard from '../../components/analytics/ChartCard'
import StatCard from '../../components/analytics/StatCard'
import { useQuery } from '@tanstack/react-query'
import { db } from '../../firebase/firebase'
import { collection, getDocs, limit, orderBy, query } from 'firebase/firestore'
import EmptyState from '../../components/feedback/EmptyState'
import { computeRatingStats, computeStatusCounts, groupReviewsByOutlet, toDate } from '../../utils/analytics'

const stagger = {
  hidden: { opacity: 0 },
  show: {
    opacity: 1,
    transition: { staggerChildren: 0.1 }
  }
}

const item = {
  hidden: { opacity: 0, y: 15 },
  show: { opacity: 1, y: 0 }
}

export default function AdminAnalyticsPage() {
  const { data: reviews = [] } = useQuery({
    queryKey: ['admin-analytics-reviews'],
    queryFn: async () => {
      const q = query(collection(db, 'reviews'), orderBy('createdAt', 'desc'), limit(1000))
      const snap = await getDocs(q)
      return snap.docs.map((doc) => ({ id: doc.id, ...doc.data() }))
    }
  })

  const { data: outlets = [] } = useQuery({
    queryKey: ['admin-analytics-outlets'],
    queryFn: async () => {
      const snap = await getDocs(collection(db, 'outlets'))
      return snap.docs.map((doc) => ({ id: doc.id, ...doc.data() }))
    }
  })

  const ratingStats = computeRatingStats(reviews)
  const statusCounts = computeStatusCounts(reviews)
  const volumeData = useMemo(() => {
    const buckets = {}
    const now = new Date()

    for (let i = 4; i >= 0; i -= 1) {
      const start = new Date(now)
      start.setDate(now.getDate() - i * 7)
      const label = `Week ${5 - i}`
      buckets[label] = { name: label, total: 0, automated: 0 }
    }

    reviews.forEach((review) => {
      const date = toDate(review.createdAt || review.reviewTimestamp)
      if (!date) return
      const diffWeeks = Math.min(4, Math.floor((now - date) / (7 * 24 * 60 * 60 * 1000)))
      const label = `Week ${5 - diffWeeks}`
      const bucket = buckets[label]
      if (!bucket) return
      bucket.total += 1
      if (['responded', 'suggested'].includes(String(review.status))) {
        bucket.automated += 1
      }
    })

    return Object.values(buckets)
  }, [reviews])

  const sentimentTrend = useMemo(() => {
    const now = new Date()
    const buckets = []

    for (let i = 3; i >= 0; i -= 1) {
      const start = new Date(now)
      start.setDate(now.getDate() - i * 7)
      buckets.push({ name: `Week ${4 - i}`, positive: 0, neutral: 0, negative: 0 })
    }

    reviews.forEach((review) => {
      const date = toDate(review.createdAt || review.reviewTimestamp)
      if (!date) return
      const diffWeeks = Math.min(3, Math.floor((now - date) / (7 * 24 * 60 * 60 * 1000)))
      const bucket = buckets[3 - diffWeeks]
      if (!bucket) return
      const rating = Number(review.rating || 0)
      if (rating >= 4) bucket.positive += 1
      else if (rating <= 2) bucket.negative += 1
      else bucket.neutral += 1
    })

    return buckets
  }, [reviews])

  const outletBenchmarks = useMemo(() => {
    const grouped = groupReviewsByOutlet(reviews, outlets)
    return grouped.map((entry) => {
      const total = entry.reviewCount
      const automation = reviews.filter((r) => r.outletId === entry.outletId && ['responded', 'suggested'].includes(String(r.status))).length
      return {
        name: entry.name,
        avgRating: entry.avgRating,
        automationRate: total ? Math.round((automation / total) * 100) : 0
      }
    })
  }, [reviews, outlets])

  return (
    <motion.div className="space-y-6" variants={stagger} initial="hidden" animate="show">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold text-slatey-900">System Analytics</h2>
          <p className="text-sm text-slatey-500">Cross-outlet performance benchmarks and growth trends.</p>
        </div>
        <div className="flex items-center gap-2 rounded-xl border border-slatey-200 bg-white px-3 py-2 text-sm font-medium text-slatey-600">
          <Calendar className="h-4 w-4 text-slatey-400" />
          Last 30 Days
        </div>
      </div>

      <motion.div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4" variants={stagger}>
        <motion.div variants={item}>
          <StatCard title="Global Review Volume" value={`${reviews.length}`} delta="" icon={<MessageSquare className="h-5 w-5" />} />
        </motion.div>
        <motion.div variants={item}>
          <StatCard title="Active Outlets" value={`${outlets.length}`} delta="" icon={<Users className="h-5 w-5" />} />
        </motion.div>
        <motion.div variants={item}>
          <StatCard
            title="Automation Volume"
            value={`${Math.round(((statusCounts.responded + statusCounts.suggested) / Math.max(reviews.length, 1)) * 100)}%`}
            delta=""
            icon={<TrendingUp className="h-5 w-5" />}
          />
        </motion.div>
        <motion.div variants={item}>
          <StatCard title="Avg Rating" value={`${ratingStats.averageRating.toFixed(1)} ★`} delta="" icon={<Activity className="h-5 w-5" />} />
        </motion.div>
      </motion.div>

      <div className="grid gap-6 lg:grid-cols-2">
        <motion.div variants={item}>
          <ChartCard title="Review Volume vs Automation">
            <div className="h-72">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={volumeData}>
                  <defs>
                    <linearGradient id="colorTotal" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#6366f1" stopOpacity={0.15}/>
                      <stop offset="95%" stopColor="#6366f1" stopOpacity={0}/>
                    </linearGradient>
                    <linearGradient id="colorAuto" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#10b981" stopOpacity={0.15}/>
                      <stop offset="95%" stopColor="#10b981" stopOpacity={0}/>
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
                  <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fontSize: 12, fill: '#94a3b8' }} />
                  <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 12, fill: '#94a3b8' }} />
                  <Tooltip 
                    contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 8px 30px rgba(0,0,0,0.08)' }}
                  />
                  <Area type="monotone" dataKey="total" stroke="#6366f1" strokeWidth={2} fillOpacity={1} fill="url(#colorTotal)" name="Total Reviews" />
                  <Area type="monotone" dataKey="automated" stroke="#10b981" strokeWidth={2} fillOpacity={1} fill="url(#colorAuto)" name="AI Handled" />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </ChartCard>
        </motion.div>

        <motion.div variants={item}>
          <ChartCard title="Sentiment Shift (Weekly)">
            <div className="h-72">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={sentimentTrend} stackOffset="expand">
                  <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
                  <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fontSize: 12, fill: '#94a3b8' }} />
                  <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 12, fill: '#94a3b8' }} hide />
                  <Tooltip 
                    contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 8px 30px rgba(0,0,0,0.08)' }}
                    formatter={(val) => `${val}%`}
                  />
                  <Bar dataKey="positive" stackId="a" fill="#10b981" radius={[0, 0, 0, 0]} />
                  <Bar dataKey="neutral" stackId="a" fill="#94a3b8" radius={[0, 0, 0, 0]} />
                  <Bar dataKey="negative" stackId="a" fill="#ef4444" radius={[6, 6, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
            <div className="mt-4 flex items-center justify-center gap-4 text-[10px] uppercase tracking-wider font-semibold text-slatey-400">
              <div className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-emerald-500"></span> Positive</div>
              <div className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-slatey-400"></span> Neutral</div>
              <div className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-rose-500"></span> Negative</div>
            </div>
          </ChartCard>
        </motion.div>
      </div>

      <motion.div variants={item}>
        <ChartCard title="Outlet Benchmarks (Rating vs Automation)">
          <div className="h-80">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={outletBenchmarks} layout="vertical">
                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" horizontal={false} />
                <XAxis type="number" domain={[0, 100]} hide />
                <YAxis dataKey="name" type="category" axisLine={false} tickLine={false} tick={{ fontSize: 12, fontWeight: 500, fill: '#475569' }} width={100} />
                <Tooltip 
                  cursor={{ fill: '#f8fafc' }}
                  contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 8px 30px rgba(0,0,0,0.08)' }}
                />
                <Bar dataKey="automationRate" radius={[0, 6, 6, 0]} barSize={24}>
                  {outletBenchmarks.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={entry.avgRating >= 4.5 ? '#4f46e5' : '#818cf8'} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
          {outletBenchmarks.length === 0 && (
            <EmptyState
              title="No benchmark data"
              description="Outlet benchmarks will populate after reviews sync."
            />
          )}
          <p className="mt-2 text-center text-xs text-slatey-400">Bars represent AI automation rate per outlet. Color intensity represents average rating.</p>
        </ChartCard>
      </motion.div>
    </motion.div>
  )
}
