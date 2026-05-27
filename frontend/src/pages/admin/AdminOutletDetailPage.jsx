import { useMemo } from 'react'
import { useParams, Link } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { Activity, Link2, MessageCircle, Phone, ArrowLeft, MoreHorizontal, MapPin, Mail, Calendar, ShieldCheck, Zap, AlertCircle } from 'lucide-react'
import { motion } from 'framer-motion'
import StatCard from '../../components/analytics/StatCard'
import ReviewCard from '../../components/reviews/ReviewCard'
import Button from '../../components/ui/button'
import StatusBadge from '../../components/feedback/StatusBadge'
import { Card } from '../../components/ui/card'
import Badge from '../../components/ui/badge'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '../../components/ui/dropdown-menu'
import EmptyState from '../../components/feedback/EmptyState'
import Skeleton from '../../components/feedback/Skeleton'
import { fetchOutletById } from '../../services/outletService'
import { fetchSystemLogs } from '../../services/adminService'
import { db } from '../../firebase/firebase'
import { collection, getDocs, limit, orderBy, query, where } from 'firebase/firestore'
import { formatTimestamp } from '../../utils/format'
import { computeRatingStats, computeStatusCounts } from '../../utils/analytics'

const stagger = {
  hidden: { opacity: 0 },
  show: { opacity: 1, transition: { staggerChildren: 0.1 } }
}

const item = {
  hidden: { opacity: 0, y: 10 },
  show: { opacity: 1, y: 0 }
}

export default function AdminOutletDetailPage() {
  const { id } = useParams()

  const { data: outlet } = useQuery({
    queryKey: ['admin-outlet', id],
    queryFn: () => fetchOutletById(id),
    enabled: Boolean(id)
  })

  const { data: recentReviews = [], isLoading: reviewsLoading } = useQuery({
    queryKey: ['admin-outlet-reviews', id],
    queryFn: async () => {
      const q = query(
        collection(db, 'reviews'),
        where('outletId', '==', id),
        orderBy('createdAt', 'desc'),
        limit(5)
      )
      const snap = await getDocs(q)
      return snap.docs.map((doc) => ({ id: doc.id, ...doc.data() }))
    },
    enabled: Boolean(id)
  })

  const { data: logsData } = useQuery({
    queryKey: ['admin-logs'],
    queryFn: () => fetchSystemLogs(1, 50)
  })

  const outletLogs = useMemo(() => {
    return (logsData?.logs || []).filter((log) => log?.payload?.outletId === id).slice(0, 3)
  }, [logsData, id])

  const ratingStats = computeRatingStats(recentReviews)
  const statusCounts = computeStatusCounts(recentReviews)

  return (
    <motion.div className="space-y-6" variants={stagger} initial="hidden" animate="show">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          <Link to="/admin-dashboard/outlets" className="rounded-full bg-white p-2 text-slatey-400 hover:text-slatey-900 shadow-sm border border-slatey-100 transition-colors">
            <ArrowLeft className="h-5 w-5" />
          </Link>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-2xl font-bold text-slatey-900">{outlet?.name || 'Outlet'}</h2>
              <StatusBadge status={outlet?.isActive ? 'active' : 'inactive'} />
            </div>
            <p className="text-sm text-slatey-500 font-mono">ID: {id}</p>
          </div>
        </div>
        {/* <div className="flex gap-2">
          <Button variant="outline" className="bg-white">
            <MoreHorizontal className="h-4 w-4" />
          </Button>
          <Button className="shadow-brand">
            <Zap className="h-4 w-4" />
            Trigger Manual Sync
          </Button>
        </div> */}
      </div>

      <motion.div className="grid gap-4 md:grid-cols-3" variants={stagger}>
        <motion.div variants={item}>
          <StatCard
            title="Avg rating"
            value={`${ratingStats.averageRating.toFixed(1)} ★`}
            delta=""
            icon={<Activity className="h-5 w-5" />}
          />
        </motion.div>
        <motion.div variants={item}>
          <StatCard
            title="Total Reviews"
            value={`${recentReviews.length}`}
            delta=""
            icon={<MessageCircle className="h-5 w-5" />}
          />
        </motion.div>
        <motion.div variants={item}>
          <StatCard
            title="Escalations"
            value={`${statusCounts.escalated}`}
            delta=""
            icon={<AlertCircle className="h-5 w-5" />}
          />
        </motion.div>
      </motion.div>

      <div className="grid gap-6 lg:grid-cols-[1.2fr_0.8fr]">
        <motion.div className="space-y-4" variants={item}>
          <div className="flex items-center justify-between">
            <h3 className="text-lg font-semibold text-slatey-800">Recent Review Activity</h3>
            <Button variant="ghost" size="sm" className="text-brand-600">View all reviews</Button>
          </div>
          {reviewsLoading ? (
            <div className="grid gap-4">
              {Array.from({ length: 2 }).map((_, index) => (
                <Skeleton key={index} className="h-24 w-full" />
              ))}
            </div>
          ) : recentReviews.length > 0 ? (
            <div className="grid gap-4">
              {recentReviews.map((review) => (
                <ReviewCard key={review.id} review={review} />
              ))}
            </div>
          ) : (
            <EmptyState
              title="No recent reviews"
              description="This outlet has no reviews yet."
            />
          )}
        </motion.div>

        <motion.div className="space-y-6" variants={item}>
          {/* Business Meta */}
          <Card className="p-6 space-y-4 border-none shadow-glow">
            <h3 className="font-semibold text-slatey-800 flex items-center gap-2 dark:text-slatey-200">
              <ShieldCheck className="h-4 w-4 text-brand-500" />
              Outlet Profile
            </h3>
            <div className="space-y-3">
              <div className="flex items-center gap-3 text-sm text-slatey-600 dark:text-slatey-400">
                <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-slatey-100 text-slatey-500 dark:bg-slatey-800 dark:text-slatey-400">
                  <MapPin className="h-4 w-4" />
                </div>
                {outlet?.address || '—'}
              </div>
              <div className="flex items-center gap-3 text-sm text-slatey-600 dark:text-slatey-400">
                <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-slatey-100 text-slatey-500 dark:bg-slatey-800 dark:text-slatey-400">
                  <Mail className="h-4 w-4" />
                </div>
                {outlet?.email || '—'}
              </div>
              <div className="flex items-center gap-3 text-sm text-slatey-600 dark:text-slatey-400">
                <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-slatey-100 text-slatey-500 dark:bg-slatey-800 dark:text-slatey-400">
                  <Phone className="h-4 w-4" />
                </div>
                {outlet?.whatsappNumber || '—'}
              </div>
              <div className="flex items-center gap-3 text-sm text-slatey-600 dark:text-slatey-400">
                <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-slatey-100 text-slatey-500 dark:bg-slatey-800 dark:text-slatey-400">
                  <Calendar className="h-4 w-4" />
                </div>
                Joined {formatTimestamp(outlet?.createdAt)}
              </div>
            </div>
          </Card>

          {/* Integration Status */}
          <Card className="p-6 space-y-4 border-none shadow-glow bg-emerald-50/30">
            <div className="flex items-center justify-between">
              <h3 className="font-semibold text-slatey-800 flex items-center gap-2">
                <Link2 className="h-4 w-4 text-emerald-500" />
                Google Integration
              </h3>
              <Badge variant="success">Healthy</Badge>
            </div>
            <div className="space-y-1">
              <p className="text-xs font-medium text-slatey-500 uppercase tracking-wider dark:text-slatey-400">Provider</p>
              <p className="text-sm font-semibold text-slatey-800 dark:text-slatey-200">{outlet?.providerType || 'SCRAPER'}</p>
            </div>
            <div className="space-y-1">
              <p className="text-xs font-medium text-slatey-500 uppercase tracking-wider dark:text-slatey-400">Active Location ID</p>
              <p className="text-sm font-semibold text-slatey-800 font-mono dark:text-slatey-200">{outlet?.googleLocationId || outlet?.placeId || '—'}</p>
            </div>
            <div className="pt-2">
              <Button variant="outline" className="w-full bg-white text-xs h-9">
                Verify Connection
              </Button>
            </div>
          </Card>

          {/* Automation Log */}
          <Card className="p-6 border-none shadow-glow">
            <h3 className="font-semibold text-slatey-800 mb-4 flex items-center gap-2 dark:text-slatey-200">
              <Activity className="h-4 w-4 text-brand-500" />
              Automation Logs
            </h3>
            {outletLogs.length > 0 ? (
              <div className="space-y-4">
                {outletLogs.map((log) => (
                  <div key={log.id} className="flex items-center justify-between text-xs">
                    <div className="flex items-center gap-2">
                      <div className="flex h-6 w-6 items-center justify-center rounded-md bg-slatey-100 text-slatey-500">
                        <Zap className="h-3 w-3" />
                      </div>
                      <span className="font-medium text-slatey-700 dark:text-slatey-300">{log.eventType || 'Activity'}</span>
                    </div>
                    <span className="text-slatey-400">{formatTimestamp(log.timestamp)}</span>
                  </div>
                ))}
              </div>
            ) : (
              <EmptyState
                title="No activity yet"
                description="Automation logs will appear here once processing begins."
              />
            )}
            <Link to="/admin-dashboard/ai-logs" className="mt-6 block text-center text-xs font-semibold text-brand-600 hover:underline">
              View full activity log
            </Link>
          </Card>
        </motion.div>
      </div>
    </motion.div>
  )
}
