import { useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { db } from '../../firebase/firebase'
import { collection, getCountFromServer, getDocs, limit, orderBy, query } from 'firebase/firestore'
import { fetchCredits, fetchUsageInsights, fetchAdminCustomers, normalizeCustomers } from '../../services/adminService'
import { Bar, BarChart, CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis, Cell } from 'recharts'
import { Clock, MessageCircle, Store, ThumbsUp, TriangleAlert, Wand2 } from 'lucide-react'
import { motion } from 'framer-motion'
import StatCard from '../../components/analytics/StatCard'
import ChartCard from '../../components/analytics/ChartCard'
import Button from '../../components/ui/button'
import EmptyState from '../../components/feedback/EmptyState'
import StatusBadge from '../../components/feedback/StatusBadge'
import apiClient from '../../services/apiClient'
import { buildDailyTrend, buildRatingDistribution, computeRatingStats, computeStatusCounts, groupReviewsByOutlet } from '../../utils/analytics'
import { USE_MOCK_DATA } from '../../config/env'
import { MOCK_CUSTOMERS, MOCK_DASHBOARD_STATS, MOCK_OUTLETS, MOCK_REVIEWS, MOCK_TICKETS } from '../../config/mockData'
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
      if (USE_MOCK_DATA) return { totalOutlets: MOCK_DASHBOARD_STATS.totalOutlets, totalReviews: MOCK_DASHBOARD_STATS.totalReviews };
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
      if (USE_MOCK_DATA) return MOCK_OUTLETS;
      const snap = await getDocs(collection(db, 'outlets'))
      return snap.docs.map((doc) => ({ id: doc.id, ...doc.data() }))
    }
  })

  const { data: reviews = [] } = useQuery({
    queryKey: ['admin-reviews-recent'],
    queryFn: async () => {
      if (USE_MOCK_DATA) return MOCK_REVIEWS;
      const q = query(collection(db, 'reviews'), orderBy('createdAt', 'desc'), limit(1000))
      const snap = await getDocs(q)
      return snap.docs.map((doc) => ({ id: doc.id, ...doc.data() }))
    }
  })

  const { data: rawCustomers } = useQuery({
    queryKey: ['admin-customers'],
    queryFn: async () => {
      if (USE_MOCK_DATA) return MOCK_CUSTOMERS;
      return fetchAdminCustomers()
    }
  })

  const customers = useMemo(() => {
    return normalizeCustomers(rawCustomers)
  }, [rawCustomers])

  const { data: tickets = [] } = useQuery({
    queryKey: ['admin-tickets'],
    queryFn: async () => {
      if (USE_MOCK_DATA) return MOCK_TICKETS;
      const snap = await getDocs(collection(db, 'tickets'))
      return snap.docs.map((doc) => ({ id: doc.id, ...doc.data() }))
    }
  })

  const { data: credits = {}, isLoading: creditsLoading } = useQuery({
    queryKey: ['admin-credits'],
    queryFn: async () => {
      if (USE_MOCK_DATA) {
        return {
          openai: { totalCredits: 50.00, totalUsage: 12.34 },
          twilio: { creditsLeft: 25.50, usedCredits: 4.50, currency: 'USD' }
        }
      }
      try {
        const result = await fetchCredits()
        return result?.credits || {}
      } catch (err) {
        return {}
      }
    }
  })

  const { data: usageInsights = {} } = useQuery({
    queryKey: ['admin-usage-insights'],
    queryFn: async () => {
      return fetchUsageInsights()
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

  // Inline skeletons for loading state
  const skeletonValue = <span className="inline-block animate-pulse rounded bg-slatey-100 h-8 w-32" />
  const skeletonSub = <span className="inline-block animate-pulse rounded bg-slatey-100 h-3 w-40 mt-2" />

  const openAiValueNode = creditsLoading ? skeletonValue : openAiCreditValue
  const openAiSubNode = creditsLoading ? skeletonSub : openAiCreditSubtext
  const twilioValueNode = creditsLoading ? skeletonValue : twilioCreditValue
  const twilioSubNode = creditsLoading ? skeletonSub : twilioSubtext

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

  // New Metrics Calculation
  const activeOutlets = outlets.filter(o => o.isActive).length
  const trialOutlets = customers.filter(c => c.subscriptionStatus === 'trialing').reduce((acc, c) => acc + outlets.filter(o => o.customerId === c.id).length, 0)
  const paidOutlets = customers.filter(c => c.subscriptionStatus !== 'trialing' && c.plan).reduce((acc, c) => acc + outlets.filter(o => o.customerId === c.id).length, 0)
  
  // Churn Risk (unused < 15 days or < 50% usage)
  const churnRiskOutlets = outlets.filter(o => {
    return o.isActive && o.reviewCount === 0; 
  }).length

  const churnOutlets = customers.filter(c => c.accountStatus === 'Inactive').reduce((acc, c) => acc + outlets.filter(o => o.customerId === c.id).length, 0)
  const openTickets = tickets.filter(t => t.status === 'Open').length

  const getMonthlyFee = (planId) => {
    if (planId === 'plan_starter') return 29;
    if (planId === 'plan_growth') return 39;
    if (planId === 'plan_premium') return 49;
    return 0;
  };

  const monthlyRevenue = customers
    .filter(c => c.subscriptionStatus !== 'trialing' && c.accountStatus !== 'Inactive')
    .reduce((acc, c) => acc + getMonthlyFee(c.plan) + (parseFloat(c.monthlyFee) || 0), 0)

  const estimatedBurn = (usageInsights?.global?.aiCostEstimate || 0) + (usageInsights?.global?.whatsappCostEstimate || 0)
  const totalAiResponses = usageInsights?.global?.aiResponsesGenerated || (statusCounts.responded + statusCounts.suggested)

  const actionSummary = [
    `${churnRiskOutlets} outlets have low usage or are churn risk.`,
    `${openTickets} tickets are currently open and require attention.`,
    `${churnOutlets} outlets belong to churned (inactive) customers.`
  ].filter((_, i) => i < 2) // display top 2 actions


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

      <motion.div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4" variants={stagger}>
        <motion.div variants={item}>
          <StatCard title="Total Outlets" value={stats?.totalOutlets || '0'} delta={outletsDeltaStr} icon={<Store className="h-5 w-5" />} />
        </motion.div>
        
        <motion.div variants={item}>
          <StatCard title="Open Tickets" value={openTickets} delta="" icon={<MessageCircle className="h-5 w-5 text-sky-500" />} />
        </motion.div>
        <motion.div variants={item}>
          <StatCard title="Total Reviews" value={stats?.totalReviews?.toLocaleString() || '0'} delta={reviewsDeltaStr} icon={<MessageCircle className="h-5 w-5" />} />
        </motion.div>

        <motion.div variants={item}>
          <StatCard title="Monthly Revenue" value={`$${monthlyRevenue.toFixed(2)}`} delta="" icon={<Wand2 className="h-5 w-5 text-emerald-500" />} />
        </motion.div>
        <motion.div variants={item}>
          <StatCard title="AI responses" value={`${totalAiResponses}`} delta="" icon={<Wand2 className="h-5 w-5" />} />
        </motion.div>
        <motion.div variants={item}>
          <StatCard title="Escalations" value={`${statusCounts.escalated}`} delta="" icon={<TriangleAlert className="h-5 w-5" />} />
        </motion.div>
        <motion.div variants={item}>
          <StatCard title="Credits (OpenAI)" value={openAiValueNode} delta={openAiSubNode} icon={<MessageCircle className="h-5 w-5" />} />
        </motion.div>
        <motion.div variants={item}>
          <StatCard title="Credits (Twilio)" value={twilioValueNode} delta={twilioSubNode} icon={<MessageCircle className="h-5 w-5" />} />
        </motion.div>
      </motion.div>

      <motion.div variants={item} className="rounded-2xl border border-amber-200 bg-amber-50 p-6 shadow-sm dark:border-amber-900/50 dark:bg-amber-950/20">
        <h3 className="font-semibold text-amber-800 dark:text-amber-400 mb-2 flex items-center gap-2">
          <TriangleAlert className="h-5 w-5" />
          Today's Action Summary
        </h3>
        <ul className="list-disc list-inside space-y-1 text-sm text-amber-700 dark:text-amber-300">
          {actionSummary.length > 0 ? (
            actionSummary.map((action, idx) => <li key={idx}>{action}</li>)
          ) : (
            <li>No urgent actions required today.</li>
          )}
        </ul>
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
            <div className="mt-4 flex flex-wrap items-center justify-center gap-3 sm:gap-6 text-xs font-medium text-slatey-500">
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
            <div className="mt-4 flex flex-wrap items-center justify-center gap-3 sm:gap-6 text-xs font-medium text-slatey-500">
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
          {/* <Button variant="ghost" size="sm" className="text-brand-600 dark:text-brand-400">View all</Button> */}
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

      <div className="grid gap-6 lg:grid-cols-2">
        <motion.div
          variants={item}
          className="rounded-2xl border border-slatey-200 bg-white/80 p-6 shadow-glow dark:border-slatey-800 dark:bg-slatey-900/80"
        >
          <div className="flex items-center justify-between mb-6">
            <h3 className="font-semibold text-slatey-800 dark:text-slatey-200">Upsell Opportunity (High AI Usage)</h3>
          </div>
          <div className="space-y-4">
            {customers.filter(c => c.plan === 'Pro').map((c) => (
              <div key={c.id} className="flex items-center justify-between p-4 rounded-xl border border-slatey-100 bg-slatey-50 dark:border-slatey-800 dark:bg-slatey-950/50">
                <div>
                  <p className="text-sm font-semibold text-slatey-800 dark:text-slatey-200">{c.name}</p>
                  <p className="text-xs text-slatey-500">{c.plan} Plan • High Automation</p>
                </div>
                <div className="text-right">
                  <p className="text-sm font-bold text-brand-600 dark:text-brand-400">98% Usage</p>
                  <p className="text-xs text-slatey-400">Recommend Enterprise</p>
                </div>
              </div>
            ))}
          </div>
        </motion.div>

        <motion.div
          variants={item}
          className="rounded-2xl border border-slatey-200 bg-white/80 p-6 shadow-glow dark:border-slatey-800 dark:bg-slatey-900/80"
        >
          <div className="flex items-center justify-between mb-6">
            <h3 className="font-semibold text-slatey-800 dark:text-slatey-200">Trial Customers Performance</h3>
          </div>
          <div className="space-y-4">
            {customers.filter(c => c.plan === 'Trial').map((c) => (
              <div key={c.id} className="flex items-center justify-between p-4 rounded-xl border border-slatey-100 bg-slatey-50 dark:border-slatey-800 dark:bg-slatey-950/50">
                <div>
                  <p className="text-sm font-semibold text-slatey-800 dark:text-slatey-200">{c.name}</p>
                  <p className="text-xs text-slatey-500">14 Days Remaining</p>
                </div>
                <div className="text-right">
                  <p className="text-sm font-bold text-emerald-600 dark:text-emerald-400">High Engagement</p>
                  <p className="text-xs text-slatey-400">Ready to convert</p>
                </div>
              </div>
            ))}
          </div>
        </motion.div>
      </div>
    </motion.div>
  )
}
