import { useState, useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { motion, AnimatePresence } from 'framer-motion'
import { Search, Filter, MessageSquare, Star, Store, CheckCircle2, Clock, ExternalLink, MoreVertical, Globe } from 'lucide-react'
import { Card } from '../../components/ui/card'
import Button from '../../components/ui/button'
import StatusBadge from '../../components/feedback/StatusBadge'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '../../components/ui/dropdown-menu'
import Skeleton from '../../components/feedback/Skeleton'
import EmptyState from '../../components/feedback/EmptyState'
import { fetchReviews } from '../../services/reviewService'
import { fetchAdminOutlets } from '../../services/outletService'
import { formatTimestamp } from '../../utils/format'

const stagger = {
  hidden: { opacity: 0 },
  show: { opacity: 1, transition: { staggerChildren: 0.05 } }
}

const item = {
  hidden: { opacity: 0, y: 10 },
  show: { opacity: 1, y: 0 }
}

export default function AdminReviewsPage() {
  const [query, setQuery] = useState('')
  const [ratingFilter, setRatingFilter] = useState('all')
  const [page, setPage] = useState(1)
  const [limit] = useState(10)

  const { data: reviewsPayload, isLoading } = useQuery({
    queryKey: ['admin-reviews', page, ratingFilter, query],
    queryFn: () => fetchReviews({ page, limit, rating: ratingFilter, search: query })
  })

  const reviews = reviewsPayload?.data || []
  const pagination = reviewsPayload?.pagination || { total: 0, page: 1, limit: 10, totalPages: 1 }

  const { data: outletPayload } = useQuery({
    queryKey: ['admin-outlets'],
    queryFn: fetchAdminOutlets
  })

  const outletMap = useMemo(() => {
    const list = outletPayload?.outlets || []
    return new Map(list.map((outlet) => [outlet.id, outlet]))
  }, [outletPayload])

  const filtered = reviews

  const handleQueryChange = (val) => {
    setQuery(val)
    setPage(1)
  }

  const handleRatingChange = (val) => {
    setRatingFilter(val)
    setPage(1)
  }

  return (
    <motion.div className="space-y-6" variants={stagger} initial="hidden" animate="show">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold text-slatey-900">System Reviews</h2>
          <p className="text-sm text-slatey-500">Monitoring all review activity across the entire platform.</p>
        </div>
        {/* <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" className="bg-white">
            <Globe className="mr-2 h-4 w-4" />
            All Locations
          </Button>
          <Button size="sm" className="shadow-brand">
            <Clock className="mr-2 h-4 w-4" />
            Last 24 Hours
          </Button>
        </div> */}
      </div>

      <Card className="p-4 border-none shadow-glow">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex flex-1 min-w-[280px] items-center gap-3 rounded-xl border border-slatey-200 bg-slatey-50/50 px-4 py-2 focus-within:border-brand-400 focus-within:ring-2 focus-within:ring-brand-100 transition-all">
            <Search className="h-4 w-4 text-slatey-400" />
            <input
              className="w-full bg-transparent text-sm text-slatey-700 outline-none"
              placeholder="Search by outlet, customer, or content..."
              value={query}
              onChange={(e) => handleQueryChange(e.target.value)}
            />
          </div>
          <div className="flex items-center gap-2">
            <select 
              className="rounded-xl border border-slatey-200 bg-white px-3 py-2 text-xs font-medium text-slatey-600 outline-none focus:border-brand-400"
              value={ratingFilter}
              onChange={(e) => handleRatingChange(e.target.value)}
            >
              <option value="all">All Ratings</option>
              <option value="5">5 Stars</option>
              <option value="4">4 Stars</option>
              <option value="3">3 Stars</option>
              <option value="2">2 Stars</option>
              <option value="1">1 Star</option>
            </select>
            <Button variant="outline" size="sm">
              <Filter className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </Card>

      <div className="space-y-4">
        {isLoading ? (
          <div className="grid gap-4">
            {Array.from({ length: 4 }).map((_, index) => (
              <Skeleton key={index} className="h-28 w-full" />
            ))}
          </div>
        ) : (
          <AnimatePresence mode="popLayout">
            {filtered.map((review) => {
              const outletName = outletMap.get(review.outletId)?.name || 'Unknown Outlet'
              const aiHandled = Boolean(review.aiResponse)
              const status = review.status === 'reply_pending' ? 'suggested' : review.status
              return (
            <motion.div
              key={review.id}
              variants={item}
              layout
              className="group rounded-2xl border border-slatey-100 bg-white p-5 shadow-sm transition-all hover:shadow-md hover:border-brand-100"
            >
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div className="flex items-start gap-4">
                  <div className="mt-1 flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-slatey-50 text-slatey-400 group-hover:bg-brand-50 group-hover:text-brand-600 transition-colors">
                    <MessageSquare className="h-5 w-5" />
                  </div>
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <span className="font-bold text-slatey-900">{review.customerName || 'Customer'}</span>
                      <span className="text-slatey-300">·</span>
                      <div className="flex items-center gap-1 text-xs font-semibold text-brand-600">
                        <Store className="h-3.5 w-3.5" />
                        {outletName}
                      </div>
                    </div>
                    <div className="flex items-center gap-2 text-[11px] text-slatey-400">
                      <div className="flex items-center gap-0.5">
                        {[1,2,3,4,5].map(n => (
                          <Star key={n} className={`h-3 w-3 ${n <= review.rating ? 'fill-amber-400 text-amber-400' : 'text-slatey-100'}`} />
                        ))}
                      </div>
                      <span>·</span>
                      <Clock className="h-3 w-3" />
                      <span>{formatTimestamp(review.reviewTimestamp || review.createdAt)}</span>
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  {aiHandled && (
                    <div className="flex items-center gap-1 rounded-full bg-brand-50 px-2.5 py-0.5 text-[10px] font-bold text-brand-600">
                      <CheckCircle2 className="h-3 w-3" />
                      AI Managed
                    </div>
                  )}
                  <StatusBadge status={status} />
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <button className="rounded-lg p-1.5 text-slatey-400 hover:bg-slatey-50">
                        <MoreVertical className="h-4 w-4" />
                      </button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem className="gap-2">
                        <ExternalLink className="h-4 w-4" /> View on Google
                      </DropdownMenuItem>
                      <DropdownMenuItem className="gap-2">
                        <Store className="h-4 w-4" /> View Outlet
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
              </div>
              <div className="mt-4 pl-14">
                <p className="text-sm text-slatey-600 leading-relaxed">
                  {review.text}
                </p>
              </div>
            </motion.div>
              )
            })}
          </AnimatePresence>
        )}

        {!isLoading && filtered.length === 0 && (
          <EmptyState
            title="No reviews found"
            description="No reviews match your current filters. Try adjusting the search or rating selection."
          />
        )}
      </div>

      {/* Pagination Controls */}
      {!isLoading && filtered.length > 0 && pagination.totalPages > 1 && (
        <div className="mt-6 flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-slatey-100 bg-white px-5 py-4 shadow-sm">
          <p className="text-xs text-slatey-500">
            Showing <span className="font-semibold text-slatey-700">{((page - 1) * limit) + 1}</span> to{' '}
            <span className="font-semibold text-slatey-700">{Math.min(page * limit, pagination.total)}</span> of{' '}
            <span className="font-semibold text-slatey-700">{pagination.total}</span> reviews
          </p>
          <div className="flex items-center gap-1.5">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setPage((p) => Math.max(p - 1, 1))}
              disabled={page === 1}
              className="text-xs font-semibold"
            >
              Previous
            </Button>
            
            {Array.from({ length: pagination.totalPages }).map((_, idx) => {
              const pNum = idx + 1;
              if (
                pagination.totalPages > 6 &&
                pNum !== 1 &&
                pNum !== pagination.totalPages &&
                Math.abs(pNum - page) > 1
              ) {
                if (pNum === 2 && page > 3) {
                  return <span key="dots1" className="px-1 text-slatey-400">...</span>;
                }
                if (pNum === pagination.totalPages - 1 && page < pagination.totalPages - 2) {
                  return <span key="dots2" className="px-1 text-slatey-400">...</span>;
                }
                return null;
              }

              return (
                <button
                  key={pNum}
                  onClick={() => setPage(pNum)}
                  className={`flex h-8 w-8 items-center justify-center rounded-lg text-xs font-bold transition-all ${
                    page === pNum
                      ? 'bg-brand-600 text-white shadow-sm shadow-brand/20'
                      : 'text-slatey-500 hover:bg-slatey-50 hover:text-slatey-800'
                  }`}
                >
                  {pNum}
                </button>
              );
            })}

            <Button
              variant="outline"
              size="sm"
              onClick={() => setPage((p) => Math.min(p + 1, pagination.totalPages))}
              disabled={page === pagination.totalPages}
              className="text-xs font-semibold"
            >
              Next
            </Button>
          </div>
        </div>
      )}
    </motion.div>
  )
}
