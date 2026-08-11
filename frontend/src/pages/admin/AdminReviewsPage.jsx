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
import { fetchAdminCustomers, normalizeCustomers } from '../../services/adminService'
import { USE_MOCK_DATA } from '../../config/env'
import { MOCK_CUSTOMERS, MOCK_OUTLETS, MOCK_REVIEWS } from '../../config/mockData'
import { formatTimestamp } from '../../utils/format'
import { Link } from 'react-router-dom'


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
  const [dateFilter, setDateFilter] = useState('all')
  const [industryFilter, setIndustryFilter] = useState('all')
  const [selectedOutlets, setSelectedOutlets] = useState([])
  const [page, setPage] = useState(1)
  const [limit] = useState(10)

  const { data: reviewsPayload, isLoading } = useQuery({
    queryKey: ['admin-reviews'],
    queryFn: async () => {
      if (USE_MOCK_DATA) return { reviews: MOCK_REVIEWS, total: MOCK_REVIEWS.length }
      return fetchReviews({ limit: 100 })
    }
  })

  const reviews = reviewsPayload?.reviews || reviewsPayload?.data || []
  const pagination = reviewsPayload?.pagination || { total: 0, page: 1, limit: 10, totalPages: 1 }

  const { data: outletPayload } = useQuery({
    queryKey: ['admin-outlets'],
    queryFn: async () => {
      if (USE_MOCK_DATA) return { outlets: MOCK_OUTLETS, total: MOCK_OUTLETS.length }
      return fetchAdminOutlets()
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

  const outletMap = useMemo(() => {
    const list = outletPayload?.outlets || []
    return new Map(list.map((outlet) => [outlet.id, outlet]))
  }, [outletPayload])

  const industries = useMemo(() => {
    const set = new Set()
    customers.forEach(c => set.add(c.industry || 'General'))
    return Array.from(set).sort()
  }, [customers])

  const filtered = useMemo(() => {
    return reviews.filter(review => {
      const outlet = outletMap.get(review.outletId) || {}
      const customer = customers.find(c => c.id === outlet.customerId) || {}
      
      const textMatch = review.text?.toLowerCase().includes(query.toLowerCase()) || 
                       customer.name?.toLowerCase().includes(query.toLowerCase()) ||
                       outlet.name?.toLowerCase().includes(query.toLowerCase()) ||
                       review.id.toLowerCase().includes(query.toLowerCase())

      const ratingMatch = ratingFilter === 'all' || review.rating.toString() === ratingFilter

      let dateMatch = true
      if (dateFilter !== 'all') {
        const ts = (review.reviewTimestamp || review.createdAt)?.seconds * 1000 || Date.now()
        const now = Date.now()
        const days = parseInt(dateFilter)
        dateMatch = now - ts <= days * 86400000
      }

      const indMatch = industryFilter === 'all' || (customer.industry || 'General') === industryFilter

      const outMatch = selectedOutlets.length === 0 || selectedOutlets.includes('all') || selectedOutlets.includes(review.outletId)

      return textMatch && ratingMatch && dateMatch && indMatch && outMatch
    })
  }, [reviews, query, ratingFilter, dateFilter, industryFilter, selectedOutlets, outletMap, customers])

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
          <div className="flex flex-1 min-w-[200px] w-full sm:w-auto items-center gap-3 rounded-xl border border-slatey-200 bg-slatey-50/50 px-4 py-2 focus-within:border-brand-400 focus-within:ring-2 focus-within:ring-brand-100 transition-all">
            <Search className="h-4 w-4 text-slatey-400" />
            <input
              className="w-full bg-transparent text-sm text-slatey-700 outline-none"
              placeholder="Search by outlet, customer, or content..."
              value={query}
              onChange={(e) => handleQueryChange(e.target.value)}
            />
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <select 
              className="rounded-xl border border-slatey-200 bg-white px-3 py-2 text-xs font-medium text-slatey-600 outline-none focus:border-brand-400"
              value={dateFilter}
              onChange={(e) => { setDateFilter(e.target.value); setPage(1); }}
            >
              <option value="all">All Dates</option>
              <option value="7">Last 7 Days</option>
              <option value="30">Last 30 Days</option>
              <option value="90">Last 90 Days</option>
            </select>

            <select 
              className="rounded-xl border border-slatey-200 bg-white px-3 py-2 text-xs font-medium text-slatey-600 outline-none focus:border-brand-400"
              value={industryFilter}
              onChange={(e) => { setIndustryFilter(e.target.value); setPage(1); }}
            >
              <option value="all">All Industries</option>
              {industries.map(ind => <option key={ind} value={ind}>{ind}</option>)}
            </select>

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

            <div className="relative group">
              <select 
                multiple
                className="hidden peer"
                value={selectedOutlets}
                onChange={(e) => {
                  const opts = Array.from(e.target.selectedOptions, o => o.value)
                  setSelectedOutlets(opts)
                  setPage(1)
                }}
              >
                <option value="all">All Outlets</option>
                {outletPayload?.outlets?.map(o => <option key={o.id} value={o.id}>{o.name}</option>)}
              </select>
              <div className="rounded-xl border border-slatey-200 bg-white px-3 py-2 text-xs font-medium text-slatey-600 cursor-pointer hover:border-brand-400 min-w-[120px]">
                {selectedOutlets.length === 0 || selectedOutlets.includes('all') 
                  ? 'All Outlets' 
                  : `${selectedOutlets.length} Outlets Selected`}
              </div>
              <div className="absolute right-0 top-full mt-1 hidden group-hover:block z-50 bg-white border border-slatey-200 rounded-xl shadow-lg p-2 max-h-48 overflow-y-auto w-48">
                <label className="flex items-center gap-2 p-1 text-xs text-slatey-700 cursor-pointer">
                  <input 
                    type="checkbox" 
                    checked={selectedOutlets.includes('all') || selectedOutlets.length === 0} 
                    onChange={() => { setSelectedOutlets(['all']); setPage(1); }}
                  /> 
                  All Outlets
                </label>
                {outletPayload?.outlets?.map(o => (
                  <label key={o.id} className="flex items-center gap-2 p-1 text-xs text-slatey-700 cursor-pointer">
                    <input 
                      type="checkbox" 
                      checked={selectedOutlets.includes(o.id)} 
                      onChange={(e) => {
                        let newOpts = selectedOutlets.filter(v => v !== 'all')
                        if (e.target.checked) newOpts.push(o.id)
                        else newOpts = newOpts.filter(v => v !== o.id)
                        setSelectedOutlets(newOpts)
                        setPage(1)
                      }}
                    /> 
                    {o.name}
                  </label>
                ))}
              </div>
            </div>
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
          <div className="rounded-2xl border border-slatey-200 bg-white shadow-sm dark:border-slatey-800 dark:bg-slatey-900/40 overflow-x-auto">
            <table className="w-full border-collapse text-left text-sm whitespace-nowrap">
              <thead className="bg-slatey-50/80 text-xs font-medium uppercase tracking-wider text-slatey-500 dark:bg-slatey-900 dark:text-slatey-400">
                <tr>
                  <th className="px-4 py-3">Customer & Outlet</th>
                  <th className="px-4 py-3">Rating & Content</th>
                  <th className="px-4 py-3">Timestamp & Platform</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3 text-right">Link</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slatey-100 dark:divide-slatey-800/50">
                <AnimatePresence mode="popLayout">
                  {filtered.map((review) => {
                    const outlet = outletMap.get(review.outletId) || {}
                    const customer = customers.find(c => c.id === outlet.customerId) || {}
                    const aiHandled = Boolean(review.aiResponse)
                    const status = review.status === 'reply_pending' ? 'suggested' : review.status
                    return (
                      <motion.tr
                        key={review.id}
                        variants={item}
                        layout
                        className="group transition-colors hover:bg-slatey-50/50 dark:hover:bg-slatey-800/30"
                      >
                        <td className="px-4 py-3">
                          <div className="flex flex-col">
                            <span className="font-semibold text-slatey-900 dark:text-slatey-100">{customer.name || 'Unknown'}</span>
                            <span className="text-xs text-brand-600 dark:text-brand-400 mt-0.5">{outlet.name || 'Unknown'}</span>
                          </div>
                        </td>
                        <td className="px-4 py-3 max-w-[300px]" title={review.text}>
                          <div className="flex items-center gap-1 mb-1">
                            {[1,2,3,4,5].map(n => (
                              <Star key={n} className={`h-3 w-3 ${n <= review.rating ? 'fill-amber-400 text-amber-400' : 'text-slatey-100 dark:text-slatey-800'}`} />
                            ))}
                          </div>
                          <p className="text-xs text-slatey-600 dark:text-slatey-300 truncate mb-1">{review.text}</p>
                          {review.aiResponse && (
                            <p className="text-[11px] text-slatey-500 italic truncate border-l-2 border-brand-200 pl-1.5 mt-1 bg-slatey-50 p-1 rounded-r">Resp: {review.aiResponse}</p>
                          )}
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex flex-col">
                            <span className="text-xs text-slatey-600 dark:text-slatey-400">
                              {formatTimestamp(review.reviewTimestamp || review.createdAt)}
                            </span>
                            <span className="text-[11px] bg-slatey-100 text-slatey-600 px-1.5 py-0.5 rounded mt-1 w-fit">
                              {review.providerType || 'Google'}
                            </span>
                          </div>
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex flex-col gap-1 items-start">
                            <span className="text-[11px] bg-slatey-100 text-slatey-700 px-2 py-0.5 rounded font-medium">
                              {status === 'replied' ? 'Auto replied' : status === 'escalated' ? 'Whatsapp triggered' : status === 'ignored' ? 'Ignored' : status}
                            </span>
                          </div>
                        </td>
                        <td className="px-4 py-3 text-right">
                          {review.reviewUrl ? (
                            <a href={review.reviewUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-xs font-semibold text-brand-600 hover:text-brand-700 transition">
                              <ExternalLink className="h-3 w-3" /> View original
                            </a>
                          ) : (
                            <span className="text-xs text-slatey-400">N/A</span>
                          )}
                        </td>
                      </motion.tr>
                    )
                  })}
                </AnimatePresence>
              </tbody>
            </table>
          </div>
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
