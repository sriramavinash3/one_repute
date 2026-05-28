import {
  Bar, BarChart, CartesianGrid, Line, LineChart, ResponsiveContainer,
  Tooltip, XAxis, YAxis, Cell, PieChart, Pie
} from 'recharts'
import { useEffect, useMemo } from 'react'
import { MessageCircle, Sparkles, Star, TriangleAlert, TrendingUp, Clock, CheckCircle2, AlertCircle } from 'lucide-react'
import { motion } from 'framer-motion'
import StatCard from '../../components/analytics/StatCard'
import ChartCard from '../../components/analytics/ChartCard'
import StatusBadge from '../../components/feedback/StatusBadge'
import EmptyState from '../../components/feedback/EmptyState'
import { collection, onSnapshot, orderBy, query, where, limit } from 'firebase/firestore'
import { db } from '../../firebase/firebase'
import { useAuth } from '../../contexts/AuthContext'
import useAppStore from '../../store/appStore'
import { buildDailyTrend, buildRatingDistribution, buildSentimentMix, computeRatingStats, computeStatusCounts } from '../../utils/analytics'
import { formatTimestamp } from '../../utils/format'

const stagger = {
  hidden: {},
  show: { transition: { staggerChildren: 0.07 } }
}

const fadeUp = {
  hidden: { opacity: 0, y: 12 },
  show: { opacity: 1, y: 0, transition: { duration: 0.35 } }
}

export default function OutletDashboardPage() {
  const { outlet, profile } = useAuth()
  const reviews = useAppStore((state) => state.reviews)
  const setReviews = useAppStore((state) => state.setReviews)
  const outletId = outlet?.id || profile?.outletId


  useEffect(() => {
    if (!outletId) {
      setReviews([])
      return
    }

    const q = query(
      collection(db, 'reviews'),
      where('outletId', '==', outletId),
      orderBy('createdAt', 'desc'),
      limit(200)
    )

    const unsubscribe = onSnapshot(
      q,
      (snap) => {
        console.debug('[OutletDashboard] snapshot received', { outletId, size: snap.size })
        const items = snap.docs.map((doc) => ({ id: doc.id, ...doc.data() }))
        setReviews(items)
        console.debug('[OutletDashboard] setReviews ->', items.length)
      },
      (err) => {
        console.error('[OutletDashboard] snapshot error', err)
        setReviews([])
      }
    )
    console.debug('[OutletDashboard] listening for reviews with outletId', outletId)

    return () => unsubscribe()
  }, [outletId, setReviews])

  const ratingStats = computeRatingStats(reviews)
  const statusCounts = computeStatusCounts(reviews)
  const weeklyTrend = buildDailyTrend(reviews, 7)
  const sentimentData = buildSentimentMix(reviews)
  const ratingDist = buildRatingDistribution(reviews)
  const recentActivity = useMemo(() => reviews.slice(0, 4), [reviews])

  const autoRate = Math.round(((statusCounts.responded + statusCounts.suggested) / Math.max(reviews.length, 1)) * 100)

  const now = new Date()

  const sevenDaysAgo = new Date()
  sevenDaysAgo.setDate(now.getDate() - 7)

  const fourteenDaysAgo = new Date()
    fourteenDaysAgo.setDate(now.getDate() - 14)

    const currentWeekReviews = reviews.filter((review) => {
    const date = review.createdAt?.toDate?.()

    return date && date >= sevenDaysAgo
  })

  const previousWeekReviews = reviews.filter((review) => {
    const date = review.createdAt?.toDate?.()

    return (
      date &&
      date >= fourteenDaysAgo &&
      date < sevenDaysAgo
    )
  })

  const currentStats = computeRatingStats(currentWeekReviews)
  const previousStats = computeRatingStats(previousWeekReviews)

  const currentStatus = computeStatusCounts(currentWeekReviews)
  const previousStatus = computeStatusCounts(previousWeekReviews)

  const ratingDelta =
    currentStats.averageRating -
    previousStats.averageRating

  const reviewDelta =
    currentWeekReviews.length -
    previousWeekReviews.length

  const escalationDelta =
    currentStatus.escalated -
    previousStatus.escalated

  return (
    <motion.div className="space-y-6" variants={stagger} initial="hidden" animate="show">
      {/* Header & Status */}
      <motion.div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between" variants={fadeUp}>
        <div>
          <h1 className="text-2xl font-bold text-slatey-900 dark:text-white">Overview</h1>
          <p className="text-sm text-slatey-500">
            Welcome back, {outlet?.name || profile?.businessName || 'Business Owner'}
          </p>
        </div>
        <div className="flex items-center">
          <StatusBadge status={outlet?.isActive !== false ? 'active' : 'inactive'} />
        </div>
      </motion.div>

      {/* KPI Stats */}
      <motion.div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4" variants={stagger}>
        <motion.div variants={fadeUp}>
          <StatCard
            title="Avg rating"
            value={
              reviews.length > 0
                ? `${ratingStats.averageRating.toFixed(1)} ★`
                : '—'
            }
            delta={
              previousWeekReviews.length > 0
                ? `${ratingDelta >= 0 ? '↑' : '↓'} ${Math.abs(ratingDelta).toFixed(1)} from last week`
                : 'First week of data'
            }
            icon={<Star className="h-5 w-5" />}
          />
        </motion.div>
        <motion.div variants={fadeUp}>
          <StatCard
            title="Total reviews"
            value={reviews.length > 0 ? `${reviews.length}` : '—'}
            delta={
              reviewDelta > 0
                ? `+${reviewDelta} this week`
                : reviewDelta < 0
                  ? `${reviewDelta} this week`
                  : 'Same as last week'
            }
            icon={<MessageCircle className="h-5 w-5" />}
          />
        </motion.div>
        <motion.div variants={fadeUp}>
          <StatCard
            title="AI responses"
            value={
              reviews.length > 0
                ? `${statusCounts.responded + statusCounts.suggested}`
                : '—'
            }
            delta={
              reviews.length > 0
                ? `${autoRate}% automated`
                : '—'
            }
            icon={<Sparkles className="h-5 w-5" />}
          />
        </motion.div>
        <motion.div variants={fadeUp}>
          <StatCard
            title="Escalations"
            value={
              reviews.length > 0
                ? `${statusCounts.escalated}`
                : '—'
            }
            delta={
              escalationDelta > 0
                ? `↑ ${escalationDelta} more than last week`
                : escalationDelta < 0
                  ? `↓ ${Math.abs(escalationDelta)} fewer than last week`
                  : 'No escalation change'
            }
            icon={<TriangleAlert className="h-5 w-5" />}
          />
        </motion.div>
      </motion.div>

      {/* Charts Row */}
      <motion.div className="grid gap-6 lg:grid-cols-3" variants={stagger}>

        <motion.div className="lg:col-span-2" variants={fadeUp}>
          <ChartCard title="Weekly review & response trend">
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={weeklyTrend}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                  <XAxis dataKey="name" tickLine={false} axisLine={false} tick={{ fontSize: 12 }} />
                  <YAxis tickLine={false} axisLine={false} tick={{ fontSize: 12 }} />
                  <Tooltip
                    contentStyle={{ borderRadius: '12px', border: '1px solid #e2e8f0', fontSize: 12 }}
                  />
                  <Line type="monotone" dataKey="reviews" stroke="#6366f1" strokeWidth={2.5} dot={false} name="Reviews" />
                  <Line type="monotone" dataKey="responded" stroke="#10b981" strokeWidth={2.5} dot={false} name="Responses" strokeDasharray="4 2" />
                </LineChart>
              </ResponsiveContainer>
            </div>
            <div className="mt-3 flex items-center gap-5 text-xs text-slatey-500">
              <span className="flex items-center gap-1.5"><span className="inline-block h-2 w-5 rounded bg-brand-500" /> Reviews</span>
              <span className="flex items-center gap-1.5"><span className="inline-block h-2 w-5 rounded bg-emerald-500" /> Responses</span>
            </div>
          </ChartCard>
        </motion.div>

        <motion.div variants={fadeUp}>
          <ChartCard title="Sentiment mix">
            <div className="flex h-64 flex-col items-center justify-center">
              <ResponsiveContainer width="100%" height={180}>
                <PieChart>
                  <Pie data={sentimentData} cx="50%" cy="50%" innerRadius={52} outerRadius={78} paddingAngle={3} dataKey="value">
                    {sentimentData.map((entry) => (
                      <Cell key={entry.name} fill={entry.color} />
                    ))}
                  </Pie>
                  <Tooltip contentStyle={{ borderRadius: '10px', fontSize: 12 }} />
                </PieChart>
              </ResponsiveContainer>
              <div className="mt-2 flex gap-4 text-xs text-slatey-500">
                {sentimentData.map((s) => (
                  <span key={s.name} className="flex items-center gap-1.5">
                    <span className="inline-block h-2 w-2 rounded-full" style={{ background: s.color }} />
                    {s.name} ({s.name === 'Positive' ? '>3★' : s.name === 'Neutral' ? '3★' : '<3★'}) {s.value}%
                  </span>
                ))}
              </div>
            </div>
          </ChartCard>
        </motion.div>
      </motion.div>

      {/* Rating Distribution + Activity Feed */}
      <motion.div className="grid gap-6 lg:grid-cols-3" variants={stagger}>

        <motion.div variants={fadeUp}>
          <ChartCard title="Rating distribution">
            <div className="h-52">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={ratingDist} layout="vertical" barSize={14}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" horizontal={false} />
                  <XAxis type="number" tickLine={false} axisLine={false} tick={{ fontSize: 11 }} />
                  <YAxis dataKey="name" type="category" tickLine={false} axisLine={false} tick={{ fontSize: 12 }} width={28} />
                  <Tooltip contentStyle={{ borderRadius: '10px', fontSize: 12 }} />
                  <Bar dataKey="value" radius={[0, 6, 6, 0]} name="Reviews">
                    {ratingDist.map((entry, i) => (
                      <Cell key={i} fill={i < 2 ? '#10b981' : i === 2 ? '#f59e0b' : '#ef4444'} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </ChartCard>
        </motion.div>

        <motion.div className="lg:col-span-2" variants={fadeUp}>
          <div className="rounded-2xl border border-slatey-200 bg-white/80 p-5 shadow-sm dark:border-slatey-800 dark:bg-slatey-900/80">
            <div className="flex items-center justify-between">
              <p className="text-sm font-semibold text-slatey-800 dark:text-slatey-200">Recent activity</p>
              <span className="rounded-full bg-brand-50 px-2.5 py-0.5 text-xs font-medium text-brand-600 dark:bg-brand-500/10 dark:text-brand-400">Live</span>
            </div>
            {recentActivity.length > 0 ? (
              <div className="mt-4 divide-y divide-slatey-100">
                {recentActivity.map((item) => (
                  <div key={item.id} className="flex items-start gap-3 py-3">
                    <div className={`mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full ${
                      item.status === 'responded' ? 'bg-emerald-50 text-emerald-600 dark:bg-emerald-500/10 dark:text-emerald-400'
                      : item.status === 'escalated' ? 'bg-red-50 text-red-500 dark:bg-rose-500/10 dark:text-rose-400'
                      : 'bg-amber-50 text-amber-500 dark:bg-amber-500/10 dark:text-amber-400'
                    }`}>
                      {item.status === 'responded' ? <CheckCircle2 className="h-4 w-4" />
                        : item.status === 'escalated' ? <AlertCircle className="h-4 w-4" />
                        : <Clock className="h-4 w-4" />}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between gap-2">
                        <p className="text-sm font-medium text-slatey-800 truncate dark:text-slatey-200">{item.customerName || 'Customer'}</p>
                        <span className="text-xs text-slatey-400 shrink-0">
                          {formatTimestamp(item.reviewTimestamp || item.createdAt)}
                        </span>
                      </div>
                      <p className="mt-0.5 text-xs text-slatey-500 truncate dark:text-slatey-400">{item.text}</p>
                    </div>
                    <StatusBadge status={item.status} />
                  </div>
                ))}
              </div>
            ) : (
              <EmptyState
                title="No recent activity"
                description="Reviews will appear here once sync begins."
              />
            )}
          </div>
        </motion.div>
      </motion.div>

      {/* Response Rate Banner */}
      <motion.div variants={fadeUp}>
        <div className="flex items-center gap-4 rounded-2xl border border-emerald-200 bg-emerald-50/70 px-6 py-4 dark:border-emerald-500/20 dark:bg-emerald-500/5">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-emerald-100 text-emerald-600 dark:bg-emerald-500/20 dark:text-emerald-400">
            <TrendingUp className="h-5 w-5" />
          </div>
          <div>
            <p className="text-sm font-semibold text-emerald-800 dark:text-emerald-200">{autoRate}% auto-response rate this week</p>
            <p className="text-xs text-emerald-600 dark:text-emerald-400">AI handled {statusCounts.responded + statusCounts.suggested} reviews automatically.</p>
          </div>
          <div className="ml-auto text-right">
            <p className="text-2xl font-bold text-emerald-700">{autoRate}%</p>
            <p className="text-xs text-emerald-500">Automation</p>
          </div>
        </div>
      </motion.div>

    </motion.div>
  )
}
