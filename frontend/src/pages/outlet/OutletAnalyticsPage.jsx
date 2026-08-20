import {
  Area, AreaChart, CartesianGrid, Line, LineChart,
  ResponsiveContainer, Tooltip, XAxis, YAxis
} from 'recharts'
import { motion } from 'framer-motion'
import { TrendingUp, TrendingDown, Minus, Star } from 'lucide-react'
import ChartCard from '../../components/analytics/ChartCard'
import StatCard from '../../components/analytics/StatCard'
import { useEffect, useMemo, useState } from 'react'
import { collection, onSnapshot, orderBy, query, where, limit } from 'firebase/firestore'
import { db } from '../../firebase/firebase'
import { useAuth } from '../../contexts/AuthContext'
import { USE_MOCK_DATA } from '../../config/env'
import { MOCK_REVIEWS } from '../../config/mockData'
import EmptyState from '../../components/feedback/EmptyState'
import { buildDailyTrend, computeRatingStats, computeStatusCounts, toDate } from '../../utils/analytics'

import { usePageReadiness } from '../../hooks/usePageReadiness'

const stagger = {
  hidden: {},
  show: { transition: { staggerChildren: 0.08 } }
}
const fadeUp = {
  hidden: { opacity: 0, y: 12 },
  show: { opacity: 1, y: 0, transition: { duration: 0.3 } }
}

function Trend({ delta }) {
  if (delta > 0) return <span className="flex items-center gap-1 text-emerald-600"><TrendingUp className="h-3.5 w-3.5" />+{delta}%</span>
  if (delta < 0) return <span className="flex items-center gap-1 text-red-500"><TrendingDown className="h-3.5 w-3.5" />{delta}%</span>
  return <span className="flex items-center gap-1 text-slatey-400"><Minus className="h-3.5 w-3.5" />Stable</span>
}

export default function OutletAnalyticsPage() {
  const { outlet, profile, outletLoading } = useAuth()
  const [reviews, setReviews] = useState([])
  const [loading, setLoading] = useState(true)

  const outletId = outlet?.id || profile?.outletId

  usePageReadiness({
    componentId: 'OutletAnalyticsPage',
    isReady: !outletLoading && !loading && Boolean(outletId),
    outletId,
    isDataComplete: !outletLoading && !loading,
  })

  useEffect(() => {
    setLoading(true)
    if (USE_MOCK_DATA) {
      setReviews(MOCK_REVIEWS)
      setLoading(false)
      return
    }

    if (outletLoading) {
      setLoading(true)
      return
    }

    if (!outletId) {
      setReviews([])
      setLoading(false)
      return
    }

    const q = query(
      collection(db, 'reviews'),
      where('outletId', '==', outletId),
      orderBy('createdAt', 'desc'),
      limit(500)
    )

    const unsubscribe = onSnapshot(
      q,
      (snap) => {
        setReviews(snap.docs.map((doc) => ({ id: doc.id, ...doc.data() })))
        setLoading(false)
      },
      () => {
        setReviews([])
        setLoading(false)
      }
    )

    return () => unsubscribe()
  }, [outletId])

  const ratingStats = computeRatingStats(reviews)
  const statusCounts = computeStatusCounts(reviews)

  const monthly = useMemo(() => {
    const now = new Date()
    const buckets = []

    for (let i = 4; i >= 0; i -= 1) {
      const date = new Date(now.getFullYear(), now.getMonth() - i, 1)
      const label = date.toLocaleString(undefined, { month: 'short' })
      buckets.push({
        key: `${date.getFullYear()}-${date.getMonth() + 1}`,
        name: label,
        reviews: 0,
        responses: 0
      })
    }

    const index = new Map(buckets.map((b) => [b.key, b]))

    reviews.forEach((review) => {
      const date = toDate(review.createdAt || review.reviewTimestamp)
      if (!date) return
      const key = `${date.getFullYear()}-${date.getMonth() + 1}`
      const bucket = index.get(key)
      if (!bucket) return
      bucket.reviews += 1
      if (['responded', 'suggested'].includes(String(review.status))) {
        bucket.responses += 1
      }
    })

    return buckets
  }, [reviews])

  const ratingOverTime = useMemo(() => {
    const trend = buildDailyTrend(reviews, 7)
    return trend.map((entry) => {
      const dayReviews = reviews.filter((r) => {
        const date = toDate(r.createdAt || r.reviewTimestamp)
        return date && date.toISOString().slice(0, 10) === entry.key
      })
      const stats = computeRatingStats(dayReviews)
      return { name: entry.name, rating: Number(stats.averageRating.toFixed(2)) }
    })
  }, [reviews])

  const avgResponseMinutes = useMemo(() => {
    const durations = reviews
      .map((review) => {
        const createdAt = toDate(review.createdAt)
        const processedAt = toDate(review.processedAt)
        if (!createdAt || !processedAt) return null
        return (processedAt - createdAt) / 60000
      })
      .filter((value) => typeof value === 'number' && value >= 0)

    if (durations.length === 0) return null
    const avg = durations.reduce((sum, value) => sum + value, 0) / durations.length
    return Math.round(avg)
  }, [reviews])

  const responseRate = Math.round(((statusCounts.responded + statusCounts.suggested) / Math.max(reviews.length, 1)) * 100)

  return (
    <motion.div className="space-y-6" variants={stagger} initial="hidden" animate="show">
      <div>
        <h2 className="text-xl font-semibold">Analytics</h2>
        <p className="text-sm text-slatey-500">Track monthly volume, rating trends, and AI performance.</p>
      </div>

      {/* Summary Cards */}
      <motion.div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4" variants={stagger}>
        {[
          { title: 'Avg rating (30d)', value: `${ratingStats.averageRating.toFixed(1)} ★`, delta: 0, icon: <Star className="h-5 w-5" /> },
          { title: 'Reviews (30d)', value: `${reviews.length}`, delta: 0, icon: <TrendingUp className="h-5 w-5" /> },
          { title: 'Response rate', value: `${responseRate}%`, delta: 0, icon: <TrendingUp className="h-5 w-5" /> },
          { title: 'Avg response time', value: avgResponseMinutes ? `${avgResponseMinutes} min` : 'N/A', delta: 0, icon: <TrendingDown className="h-5 w-5" /> },
        ].map((s) => (
          <motion.div key={s.title} variants={fadeUp}>
            <StatCard
              title={s.title}
              value={s.value}
              delta={<Trend delta={s.delta} />}
              icon={s.icon}
            />
          </motion.div>
        ))}
      </motion.div>

      {/* Main Charts Row */}
      <motion.div className="grid gap-6 lg:grid-cols-2" variants={stagger}>

        <motion.div variants={fadeUp}>
          <ChartCard title="Monthly review volume">
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={monthly}>
                  <defs>
                    <linearGradient id="reviewGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#6366f1" stopOpacity={0.25} />
                      <stop offset="95%" stopColor="#6366f1" stopOpacity={0} />
                    </linearGradient>
                    <linearGradient id="respGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#10b981" stopOpacity={0.2} />
                      <stop offset="95%" stopColor="#10b981" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                  <XAxis dataKey="name" tickLine={false} axisLine={false} tick={{ fontSize: 12 }} />
                  <YAxis tickLine={false} axisLine={false} tick={{ fontSize: 12 }} />
                  <Tooltip contentStyle={{ borderRadius: '12px', fontSize: 12 }} />
                  <Area type="monotone" dataKey="reviews" stroke="#6366f1" fill="url(#reviewGrad)" strokeWidth={2} name="Reviews" />
                  <Area type="monotone" dataKey="responses" stroke="#10b981" fill="url(#respGrad)" strokeWidth={2} name="Responses" />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </ChartCard>
        </motion.div>

        <motion.div variants={fadeUp}>
          <ChartCard title="Weekly average rating">
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={ratingOverTime}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                  <XAxis dataKey="name" tickLine={false} axisLine={false} tick={{ fontSize: 12 }} />
                  <YAxis domain={[3.5, 5]} tickLine={false} axisLine={false} tick={{ fontSize: 12 }} tickCount={4} />
                  <Tooltip contentStyle={{ borderRadius: '12px', fontSize: 12 }} formatter={(v) => [`${v} ★`, 'Avg rating']} />
                  <Line
                    type="monotone" dataKey="rating" stroke="#f59e0b" strokeWidth={2.5}
                    dot={{ r: 4, fill: '#f59e0b', stroke: '#fff', strokeWidth: 2 }}
                    name="Avg Rating"
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </ChartCard>
        </motion.div>
      </motion.div>

      {/* Removed keyword and response time cards as requested */}
    </motion.div>
  )
}
