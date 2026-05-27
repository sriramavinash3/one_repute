import { useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { db } from '../../firebase/firebase'
import { collection, getCountFromServer, getDocs, limit, orderBy, query } from 'firebase/firestore'
import { fetchCredits } from '../../services/adminService'
import { Bar, BarChart, CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis, Cell } from 'recharts'
import { Clock, MessageCircle, Store, ThumbsUp, TriangleAlert, Wand2 } from 'lucide-react'
import { motion } from 'framer-motion'
import StatCard from '../../components/analytics/StatCard'
import ChartCard from '../../components/analytics/ChartCard'
import Button from '../../components/ui/button'
import EmptyState from '../../components/feedback/EmptyState'
import { buildDailyTrend, buildRatingDistribution, computeRatingStats, computeStatusCounts, groupReviewsByOutlet } from '../../utils/analytics'

const stagger = {
  hidden: { opacity: 0 },
  show: {
    opacity: 1,
    transition: {
      staggerChildren: 0.1
    }
  }
}

const item = {
  hidden: { opacity: 0, y: 20 },
  show: { opacity: 1, y: 0 }
}

export default function AdminDashboardPage() {
  const { data: stats } = useQuery({
    queryKey: ['admin-global-stats'],
    queryFn: async () => {
      const outletsSnap = await getCountFromServer(collection(db, 'outlets'))
      const reviewsSnap = await getCountFromServer(collection(db, 'reviews'))

      return {
        totalOutlets: outletsSnap.data().count,
        totalReviews: reviewsSnap.data().count
      }
    }
  })

  const { data: outlets = [] } = useQuery({
    queryKey: ['admin-outlets-basic'],
    queryFn: async () => {
      const snap = await getDocs(collection(db, 'outlets'))
      return snap.docs.map((doc) => ({ id: doc.id, ...doc.data() }))
    }
  })

  const { data: reviews = [] } = useQuery({
    queryKey: ['admin-reviews-recent'],
    queryFn: async () => {
      const q = query(collection(db, 'reviews'), orderBy('createdAt', 'desc'), limit(500))
      const snap = await getDocs(q)
      return snap.docs.map((doc) => ({ id: doc.id, ...doc.data() }))
    }
  })

  const { data: credits = {}, isLoading: creditsLoading } = useQuery({
    queryKey: ['admin-credits'],
    queryFn: async () => {
      try {
        const result = await fetchCredits()
        return result?.credits || {}
      } catch (err) {
        return {}
      }
    }
  })

  const formatNumber = (value, digits = 4) => {
    if (typeof value === 'number') {
      return value.toFixed(digits)
    }
    if (typeof value === 'string' && value.trim().length > 0) {
      return value
    }
    return 'N/A'
  }

  const openAiCreditValue =
    credits.openai?.totalCredits != null
      ? `${formatNumber(credits.openai.totalCredits, 4)} USD`
      : 'N/A'

  const openAiCreditSubtext =
    credits.openai?.totalUsage != null
      ? `Usage: ${formatNumber(credits.openai.totalUsage, 4)} USD`
      : ''

  const twilioCreditValue = credits.twilio?.creditsLeft != null
    ? `${formatNumber(credits.twilio.creditsLeft, 4)} ${credits.twilio.currency || 'USD'}`
    : 'N/A'
  const twilioSubtext = (credits.twilio?.usedCredits != null || credits.twilio?.usageType)
    ? [
      credits.twilio?.usedCredits != null ? `Usage: ${formatNumber(credits.twilio.usedCredits, 4)}` : null,
      credits.twilio?.usageType || null,
    ]
      .filter(Boolean)
      .join(' • ')
    : ''

  const apifyCreditValue = credits.apify?.creditsLeft != null
    ? `${formatNumber(credits.apify.creditsLeft, 4)} USD`
    : 'N/A'
  const apifySubtext = [
    credits.apify?.usedCredits != null ? `Usage: ${formatNumber(credits.apify.usedCredits, 4)}` : null,
    credits.apify?.usageType ? credits.apify.usageType : null,
    credits.apify?.cycle?.start && credits.apify?.cycle?.end
      ? `${new Date(credits.apify.cycle.start).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })} - ${new Date(credits.apify.cycle.end).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}`
      : null,
  ]
    .filter(Boolean)
    .join(' • ')

  // Inline skeletons for loading state
  const skeletonValue = <span className="inline-block animate-pulse rounded bg-slatey-100 h-8 w-32" />
  const skeletonSub = <span className="inline-block animate-pulse rounded bg-slatey-100 h-3 w-40 mt-2" />

  const openAiValueNode = creditsLoading ? skeletonValue : openAiCreditValue
  const openAiSubNode = creditsLoading ? skeletonSub : openAiCreditSubtext
  const twilioValueNode = creditsLoading ? skeletonValue : twilioCreditValue
  const twilioSubNode = creditsLoading ? skeletonSub : twilioSubtext
  const apifyValueNode = creditsLoading ? skeletonValue : apifyCreditValue
  const apifySubNode = creditsLoading ? skeletonSub : apifySubtext

  // Convert Firestore Timestamp (or plain value) to JS Date
  const toDate = (ts) => {
    if (!ts) return null
    return typeof ts.toDate === 'function' ? ts.toDate() : new Date(ts)
  }

  const now = new Date()
  const msDay = 24 * 60 * 60 * 1000

  // Outlets: count created in last 30 days
  const newOutletsThisMonth = outlets.filter((o) => {
    const d = toDate(o.createdAt)
    return d && now.getTime() - d.getTime() <= 30 * msDay
  }).length

  const outletsDeltaStr = newOutletsThisMonth > 0 ? `+${newOutletsThisMonth} new this month` : `${newOutletsThisMonth} new this month`

  // Reviews: compare last 7 days vs previous 7 days
  const recent7 = reviews.filter((r) => {
    const d = toDate(r.createdAt)
    return d && now.getTime() - d.getTime() <= 7 * msDay
  }).length

  const prev7 = reviews.filter((r) => {
    const d = toDate(r.createdAt)
    const age = d ? now.getTime() - d.getTime() : Infinity
    return d && age > 7 * msDay && age <= 14 * msDay
  }).length

  let reviewsDeltaStr = ''
  if (prev7 === 0) {
    reviewsDeltaStr = recent7 === 0 ? 'No new reviews' : `+${recent7} new this week`
  } else {
    const pct = Math.round(((recent7 - prev7) / prev7) * 100)
    const sign = pct > 0 ? `+${pct}%` : `${pct}%`
    reviewsDeltaStr = `${sign} week over week`
  }

  const ratingStats = computeRatingStats(reviews)
  const statusCounts = computeStatusCounts(reviews)
  const trendData = buildDailyTrend(reviews, 7)
  const ratingData = buildRatingDistribution(reviews)
  const topOutlets = useMemo(() => groupReviewsByOutlet(reviews, outlets).slice(0, 4), [reviews, outlets])

  return (
    <motion.div
      className="space-y-6"
      variants={stagger}
      initial="hidden"
      animate="show"
    >
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slatey-900 dark:text-slatey-100">System Overview</h1>
          <p className="text-sm text-slatey-500 dark:text-slatey-400">Global performance metrics across all {stats?.totalOutlets || '...'} outlets.</p>
        </div>
        <div className="flex items-center gap-2 rounded-full bg-emerald-50 px-3 py-1 text-xs font-medium text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-400">
          <span className="relative flex h-2 w-2">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75"></span>
            <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-500"></span>
          </span>
          System Online
        </div>
      </div>

      <motion.div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3" variants={stagger}>
        <motion.div variants={item}>
          <StatCard title="Total outlets" value={stats?.totalOutlets || '0'} delta={outletsDeltaStr} icon={<Store className="h-5 w-5" />} />
        </motion.div>
        <motion.div variants={item}>
          <StatCard title="Total reviews" value={stats?.totalReviews?.toLocaleString() || '0'} delta={reviewsDeltaStr} icon={<MessageCircle className="h-5 w-5" />} />
        </motion.div>
        <motion.div variants={item}>
          <StatCard
            title="Positive rating"
            value={`${Math.round((ratingStats.positiveReviews / Math.max(reviews.length, 1)) * 100)}%`}
            delta=""
            icon={<ThumbsUp className="h-5 w-5" />}
          />
        </motion.div>
        <motion.div variants={item}>
          <StatCard
            title="Escalation rate"
            value={`${Math.round((statusCounts.escalated / Math.max(reviews.length, 1)) * 100)}%`}
            delta=""
            icon={<TriangleAlert className="h-5 w-5" />}
          />
        </motion.div>
        <motion.div variants={item}>
          <StatCard
            title="AI responses"
            value={`${statusCounts.responded + statusCounts.suggested}`}
            delta=""
            icon={<Wand2 className="h-5 w-5" />}
          />
        </motion.div>
        <motion.div variants={item}>
          <StatCard
            title="Avg rating"
            value={`${ratingStats.averageRating.toFixed(1)} ★`}
            delta=""
            icon={<Clock className="h-5 w-5" />}
          />
        </motion.div>
        <motion.div variants={item}>
          <StatCard
            title="OpenAI credits"
            value={openAiValueNode}
            delta={openAiSubNode}
            icon={<Wand2 className="h-5 w-5" />}
          />
        </motion.div>
        <motion.div variants={item}>
          <StatCard
            title="Twilio credits"
            value={twilioValueNode}
            delta={twilioSubNode}
            icon={<MessageCircle className="h-5 w-5" />}
          />
        </motion.div>
        <motion.div variants={item}>
          <StatCard
            title="Apify credits"
            value={apifyValueNode}
            delta={apifySubNode}
            icon={<Store className="h-5 w-5" />}
          />
        </motion.div>
      </motion.div>

      <div className="grid gap-6 lg:grid-cols-2">
        <motion.div variants={item}>
          <ChartCard title="Review Trends">
            <div className="h-72">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={trendData}>
                  <defs>
                    <linearGradient id="colorReviews" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#6366f1" stopOpacity={0.1} />
                      <stop offset="95%" stopColor="#6366f1" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} className="dark:stroke-slatey-800" />
                  <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fontSize: 12, fill: '#64748b' }} className="dark:opacity-70" />
                  <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 12, fill: '#64748b' }} className="dark:opacity-70" />
                  <Tooltip
                    contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 4px 12px rgba(0,0,0,0.1)' }}
                  />
                  <Line type="monotone" dataKey="reviews" stroke="#6366f1" strokeWidth={3} dot={{ r: 4, fill: '#6366f1', strokeWidth: 2, stroke: '#fff' }} activeDot={{ r: 6 }} />
                  <Line type="monotone" dataKey="escalations" stroke="#f59e0b" strokeWidth={2} dot={false} strokeDasharray="5 5" />
                </LineChart>
              </ResponsiveContainer>
            </div>
            <div className="mt-4 flex items-center justify-center gap-6 text-xs font-medium text-slatey-500">
              <div className="flex items-center gap-2">
                <span className="h-3 w-3 rounded-full bg-brand-500"></span>
                Reviews
              </div>
              <div className="flex items-center gap-2">
                <span className="h-3 w-3 rounded-full bg-amber-500"></span>
                Escalations
              </div>
            </div>
          </ChartCard>
        </motion.div>

        <motion.div variants={item}>
          <ChartCard title="Global Rating Distribution">
            <div className="h-72">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={ratingData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
                  <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fontSize: 12, fill: '#64748b' }} />
                  <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 12, fill: '#64748b' }} />
                  <Tooltip
                    cursor={{ fill: '#f8fafc', opacity: 0.05 }}
                    contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 4px 12px rgba(0,0,0,0.1)', backgroundColor: 'var(--card-bg)' }}
                  />
                  <Bar dataKey="value" radius={[6, 6, 0, 0]} barSize={40}>
                    {ratingData.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={index > 2 ? '#4f46e5' : index === 2 ? '#94a3b8' : '#ef4444'} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
            <div className="mt-4 flex items-center justify-center gap-6 text-xs font-medium text-slatey-500">
              <div className="flex items-center gap-2">
                <span className="h-3 w-3 rounded-full bg-brand-600"></span>
                High (4-5★)
              </div>
              <div className="flex items-center gap-2">
                <span className="h-3 w-3 rounded-full bg-slatey-400"></span>
                Neutral (3★)
              </div>
              <div className="flex items-center gap-2">
                <span className="h-3 w-3 rounded-full bg-rose-500"></span>
                Critical (1-2★)
              </div>
            </div>
          </ChartCard>
        </motion.div>
      </div>

      <motion.div
        variants={item}
        className="rounded-2xl border border-slatey-200 bg-white/80 p-6 shadow-glow dark:border-slatey-800 dark:bg-slatey-900/80"
      >
        <div className="flex items-center justify-between mb-6">
          <h3 className="font-semibold text-slatey-800 dark:text-slatey-200">Top Performing Outlets</h3>
          <Button variant="ghost" size="sm" className="text-brand-600 dark:text-brand-400">View all</Button>
        </div>
        {topOutlets.length > 0 ? (
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
            {topOutlets.map((outlet) => (
              <div key={outlet.outletId} className="flex flex-col rounded-xl border border-slatey-100 bg-slatey-50/50 p-4 transition-all hover:shadow-sm hover:bg-white dark:border-slatey-800 dark:bg-slatey-950/50 dark:hover:bg-slatey-800">
                <span className="text-sm font-semibold text-slatey-800 dark:text-slatey-200">{outlet.name}</span>
                <div className="mt-2 flex items-center justify-between">
                  <div className="flex items-center gap-1 text-sm font-medium text-slatey-600 dark:text-slatey-400">
                    <ThumbsUp className="h-3.5 w-3.5 text-brand-500" />
                    {outlet.avgRating.toFixed(1)}
                  </div>
                  <div className="text-xs text-slatey-400 dark:text-slatey-500">
                    {outlet.reviewCount} reviews
                  </div>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <EmptyState
            title="No outlet performance data"
            description="Reviews will populate outlet rankings once syncs begin."
          />
        )}
      </motion.div>
    </motion.div>
  )
}
