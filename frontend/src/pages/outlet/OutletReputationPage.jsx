import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useState, useMemo } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { 
  AlertCircle, TrendingUp, TrendingDown, ShieldAlert, Star,
  Search, Filter, Activity, Users, Settings2, Shield, MoreVertical, BrainCircuit, Sparkles, MessageSquareWarning, Thermometer
} from 'lucide-react'
import { USE_MOCK_DATA } from '../../config/env'
import { MOCK_REVIEWS, MOCK_REPUTATION_INSIGHTS } from '../../config/mockData'
import { fetchOutletReputationInsights, submitCategoryRule } from '../../services/outletService'
import { fetchReviews } from '../../services/reviewService'
import { useAuth } from '../../contexts/AuthContext'
import Button from '../../components/ui/button'
import StatusBadge from '../../components/feedback/StatusBadge'
import { 
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '../../components/ui/dropdown-menu'
import { DialogContent, DialogDescription, DialogRoot, DialogTitle } from '../../components/ui/dialog'
import Input from '../../components/ui/input'
import { toast } from 'sonner'
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell, LineChart, Line, AreaChart, Area } from 'recharts'

const stagger = {
  hidden: { opacity: 0 },
  show: { opacity: 1, transition: { staggerChildren: 0.1 } }
}

const item = {
  hidden: { opacity: 0, y: 15 },
  show: { opacity: 1, y: 0 }
}

export default function OutletReputationPage() {
  const [filters, setFilters] = useState({
    customer: 'all',
    outlet: 'all',
    industry: 'all',
    dateRange: '30d',
    category: 'all',
    emotion: 'all',
    rating: 'all'
  })

  const [actionDialogOpen, setActionDialogOpen] = useState(false)
  const [actionType, setActionType] = useState('')
  const [selectedCat, setSelectedCat] = useState(null)
  const [inputValue, setInputValue] = useState('')

  const queryClient = useQueryClient()

  const { outlet, profile } = useAuth()
  const outletId = outlet?.id || profile?.outletId

  // Queries
  const { data: insights } = useQuery({
    queryKey: ['admin-reputation-insights', filters, outletId],
    queryFn: async () => {
      if (USE_MOCK_DATA) return MOCK_REPUTATION_INSIGHTS
      if (!outletId) return null
      return await fetchOutletReputationInsights({ ...filters, outletId })
    },
    enabled: !!outletId
  })

  const ruleMutation = useMutation({
    mutationFn: async ({ categoryName, actionType, inputValue }) => {
      return submitCategoryRule(outletId, { categoryName, actionType, inputValue })
    },
    onSuccess: () => {
      queryClient.invalidateQueries(['admin-reputation-insights'])
      toast.success(`${actionType} successfully applied.`)
      setActionDialogOpen(false)
    },
    onError: () => {
      toast.error(`Failed to apply action.`)
      setActionDialogOpen(false)
    }
  })

  const { data: reviews } = useQuery({
    queryKey: ['admin-reputation-reviews'],
    queryFn: async () => {
      if (USE_MOCK_DATA) return MOCK_REVIEWS
      const res = await fetchReviews({ limit: 100 })
      return res.data || []
    }
  })

  // Aggregations from reviews
  const topComplaints = useMemo(() => {
    if (!reviews) return []
    const counts = {}
    reviews.filter(r => r.rating <= 3).forEach(r => {
      const cat = r.issueCategory || 'General'
      counts[cat] = (counts[cat] || 0) + 1
    })
    return Object.entries(counts).map(([name, value]) => ({ name, value })).sort((a,b) => b.value - a.value).slice(0,5)
  }, [reviews])

  const topPraised = useMemo(() => {
    if (!reviews) return []
    const counts = {}
    reviews.filter(r => r.rating >= 4).forEach(r => {
      const cat = r.issueCategory || 'General'
      counts[cat] = (counts[cat] || 0) + 1
    })
    return Object.entries(counts).map(([name, value]) => ({ name, value })).sort((a,b) => b.value - a.value).slice(0,5)
  }, [reviews])

  const emotionTrends = useMemo(() => {
    if (!reviews || reviews.length === 0) {
      return [
        { name: 'Week 1', Joy: 0, Anger: 0, Disappointment: 0, Neutral: 0 },
        { name: 'Week 2', Joy: 0, Anger: 0, Disappointment: 0, Neutral: 0 },
        { name: 'Week 3', Joy: 0, Anger: 0, Disappointment: 0, Neutral: 0 },
        { name: 'Week 4', Joy: 0, Anger: 0, Disappointment: 0, Neutral: 0 }
      ]
    }

    const now = Date.now();
    const weekInMillis = 7 * 24 * 3600 * 1000;
    
    const weeks = [
      { name: 'Week 4', Joy: 0, Anger: 0, Disappointment: 0, Neutral: 0 }, // Oldest (4 weeks ago)
      { name: 'Week 3', Joy: 0, Anger: 0, Disappointment: 0, Neutral: 0 },
      { name: 'Week 2', Joy: 0, Anger: 0, Disappointment: 0, Neutral: 0 },
      { name: 'Week 1', Joy: 0, Anger: 0, Disappointment: 0, Neutral: 0 }  // Newest (Current week)
    ];

    reviews.forEach(r => {
      let createdAtStr = r.createdAt;
      let reviewTime = now;
      if (r.createdAt && typeof r.createdAt === 'object') {
        if (r.createdAt.seconds !== undefined) {
          reviewTime = r.createdAt.seconds * 1000;
        } else if (r.createdAt._seconds !== undefined) {
          reviewTime = r.createdAt._seconds * 1000;
        } else if (r.createdAt.toMillis) {
          reviewTime = r.createdAt.toMillis();
        } else if (r.createdAt.toDate) {
          reviewTime = r.createdAt.toDate().getTime();
        }
      } else if (r.createdAt) {
        reviewTime = new Date(r.createdAt).getTime();
      }

      const diffInMillis = now - reviewTime;
      const weekIndex = Math.floor(diffInMillis / weekInMillis);
      
      // weekIndex 0 is current week (Week 1), weekIndex 3 is 4 weeks ago (Week 4)
      if (weekIndex >= 0 && weekIndex <= 3) {
        const targetWeek = 3 - weekIndex; // map weekIndex 0 -> index 3 (Week 1), index 3 -> index 0 (Week 4)
        const emotion = r.emotion || (r.rating >= 4 ? 'Joy' : (r.rating <= 2 ? 'Anger' : 'Neutral'));
        if (weeks[targetWeek][emotion] !== undefined) {
          weeks[targetWeek][emotion] += 1;
        } else {
          weeks[targetWeek][emotion] = 1;
        }
      }
    });

    return weeks;
  }, [reviews])

  const handleOpenAction = (type, cat) => {
    setActionType(type)
    setSelectedCat(cat)
    setInputValue(type === 'Rename category' ? cat.name : '')
    setActionDialogOpen(true)
  }

  const submitAction = () => {
    ruleMutation.mutate({
      categoryName: selectedCat?.originalName || selectedCat?.name,
      actionType,
      inputValue
    })
  }

  if (!insights) return <div className="p-8 text-center text-slatey-500">Loading Intelligence...</div>

  return (
    <motion.div className="space-y-6 pb-12" variants={stagger} initial="hidden" animate="show">
      {/* Header & Filter Bar */}
      <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <h2 className="text-2xl font-bold text-slatey-900 flex items-center gap-2">
            <BrainCircuit className="h-6 w-6 text-brand-600" />
            Reputation Intelligence
          </h2>
          <p className="text-sm text-slatey-500 mt-1">AI-driven pattern recognition across all customers and outlets.</p>
        </div>
        
        <div className="flex flex-wrap items-center gap-2">
          <select value={filters.category} onChange={e => setFilters({...filters, category: e.target.value})} className="text-xs font-medium bg-white border border-slatey-200 rounded-lg px-3 py-2 text-slatey-600 outline-none hover:border-brand-300 transition-colors shadow-sm cursor-pointer">
            <option value="all">All Categories</option>
            {insights.adminCategories.map(c => <option key={c.id} value={c.name}>{c.name}</option>)}
          </select>
          <select value={filters.emotion} onChange={e => setFilters({...filters, emotion: e.target.value})} className="text-xs font-medium bg-white border border-slatey-200 rounded-lg px-3 py-2 text-slatey-600 outline-none hover:border-brand-300 transition-colors shadow-sm cursor-pointer">
            <option value="all">All Emotions</option>
            <option value="Joy">Joy</option>
            <option value="Anger">Anger</option>
            <option value="Neutral">Neutral</option>
            <option value="Disappointment">Disappointment</option>
          </select>
          <select value={filters.dateRange} onChange={e => setFilters({...filters, dateRange: e.target.value})} className="text-xs font-medium bg-white border border-slatey-200 rounded-lg px-3 py-2 text-slatey-600 outline-none hover:border-brand-300 transition-colors shadow-sm cursor-pointer">
            <option value="7d">Last 7 Days</option>
            <option value="30d">Last 30 Days</option>
            <option value="90d">Last 90 Days</option>
            <option value="all">All Time</option>
          </select>
          <Button variant="primary" className="ml-2 shadow-brand text-xs px-3 py-1.5 h-auto">
            <Filter className="h-3.5 w-3.5" /> Apply
          </Button>
        </div>
      </div>

      {/* Actionable Alerts (Spikes & Patterns) */}
      <motion.div variants={item} className="grid gap-4 md:grid-cols-2">
        {insights.alerts.map(alert => (
          <div key={alert.id} className={`p-4 rounded-xl border flex gap-4 items-start shadow-sm ${
            alert.severity === 'high' ? 'bg-rose-50/50 border-rose-200' : 'bg-amber-50/50 border-amber-200'
          }`}>
            <div className={`mt-0.5 shrink-0 rounded-full p-1.5 ${
              alert.severity === 'high' ? 'bg-rose-100 text-rose-600' : 'bg-amber-100 text-amber-600'
            }`}>
              {alert.severity === 'high' ? <ShieldAlert className="h-5 w-5" /> : <MessageSquareWarning className="h-5 w-5" />}
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className={`font-bold text-sm ${alert.severity === 'high' ? 'text-rose-900' : 'text-amber-900'}`}>
                  {alert.title}
                </h3>
                <span className={`text-[10px] px-2 py-0.5 rounded-full font-bold uppercase tracking-wider ${
                  alert.severity === 'high' ? 'bg-rose-200 text-rose-700' : 'bg-amber-200 text-amber-700'
                }`}>
                  {alert.type}
                </span>
              </div>
              <p className={`text-xs mt-1 leading-relaxed ${alert.severity === 'high' ? 'text-rose-700' : 'text-amber-700'}`}>
                {alert.description}
              </p>
            </div>
          </div>
        ))}
      </motion.div>

      {/* Middle Section: Top Metrics */}
      <div className="grid gap-6 lg:grid-cols-3">
        {/* Top Praised vs Complaints */}
        <motion.div variants={item} className="lg:col-span-2 grid sm:grid-cols-2 gap-6 bg-white p-5 rounded-2xl border border-slatey-200 shadow-glow">
          <div>
            <h3 className="text-sm font-semibold text-slatey-800 flex items-center gap-2 mb-4">
              <Sparkles className="h-4 w-4 text-emerald-500" /> Top Praised Categories
            </h3>
            <div className="h-48">
              {topPraised && topPraised.length > 0 ? (
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={topPraised} layout="vertical" margin={{ left: 0, right: 10 }}>
                    <XAxis type="number" hide />
                    <YAxis dataKey="name" type="category" width={90} axisLine={false} tickLine={false} tick={{ fontSize: 11, fill: '#475569' }} />
                    <Tooltip cursor={{fill: '#f1f5f9'}} contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }}/>
                    <Bar dataKey="value" fill="#10b981" radius={[0, 4, 4, 0]} maxBarSize={20} />
                  </BarChart>
                </ResponsiveContainer>
              ) : (
                <div className="h-full flex items-center justify-center text-xs text-slatey-400">No data available</div>
              )}
            </div>
          </div>
          <div>
            <h3 className="text-sm font-semibold text-slatey-800 flex items-center gap-2 mb-4">
              <TrendingDown className="h-4 w-4 text-rose-500" /> Top Repeated Complaints
            </h3>
            <div className="h-48">
              {topComplaints && topComplaints.length > 0 ? (
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={topComplaints} layout="vertical" margin={{ left: 0, right: 10 }}>
                    <XAxis type="number" hide />
                    <YAxis dataKey="name" type="category" width={90} axisLine={false} tickLine={false} tick={{ fontSize: 11, fill: '#475569' }} />
                    <Tooltip cursor={{fill: '#f1f5f9'}} contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }}/>
                    <Bar dataKey="value" fill="#ef4444" radius={[0, 4, 4, 0]} maxBarSize={20} />
                  </BarChart>
                </ResponsiveContainer>
              ) : (
                <div className="h-full flex items-center justify-center text-xs text-slatey-400">No data available</div>
              )}
            </div>
          </div>
        </motion.div>

        {/* Emotion Trends */}
        <motion.div variants={item} className="bg-white p-5 rounded-2xl border border-slatey-200 shadow-glow">
          <h3 className="text-sm font-semibold text-slatey-800 flex items-center gap-2 mb-4">
            <Activity className="h-4 w-4 text-brand-500" /> Customer Emotion Trends
          </h3>
          <div className="h-48 mt-2">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={emotionTrends} margin={{ top: 5, right: 0, left: -20, bottom: 0 }}>
                <defs>
                  <linearGradient id="colorJoy" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#10b981" stopOpacity={0.3}/>
                    <stop offset="95%" stopColor="#10b981" stopOpacity={0}/>
                  </linearGradient>
                  <linearGradient id="colorAnger" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#ef4444" stopOpacity={0.3}/>
                    <stop offset="95%" stopColor="#ef4444" stopOpacity={0}/>
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fontSize: 10, fill: '#94a3b8' }} />
                <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 10, fill: '#94a3b8' }} />
                <Tooltip contentStyle={{ borderRadius: '8px', border: 'none', fontSize: '12px' }}/>
                <Area type="monotone" dataKey="Joy" stroke="#10b981" fillOpacity={1} fill="url(#colorJoy)" strokeWidth={2} />
                <Area type="monotone" dataKey="Anger" stroke="#ef4444" fillOpacity={1} fill="url(#colorAnger)" strokeWidth={2} />
              </AreaChart>
            </ResponsiveContainer>
          </div>
          <div className="flex justify-center gap-3 mt-3 text-[10px] font-bold text-slatey-500 uppercase tracking-wider">
            <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-emerald-500"></span> Joy</span>
            <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-rose-500"></span> Anger</span>
          </div>
        </motion.div>
      </div>

      {/* Rankings Section */}
      <motion.div variants={stagger} className="grid gap-6 md:grid-cols-2">
        {/* Most Improved Areas */}
        <motion.div variants={item} className="bg-white p-5 rounded-2xl border border-slatey-200 shadow-glow">
          <h3 className="text-sm font-semibold text-emerald-700 bg-emerald-50 w-fit px-2 py-1 rounded-md mb-4">Most Improved Areas</h3>
          <div className="space-y-4">
            {insights.improvedOutlets && insights.improvedOutlets.length > 0 ? (
              insights.improvedOutlets.map((o, i) => (
                <div key={i} className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-slatey-800">{o.name || 'Category'}</p>
                    <p className="text-[10px] text-slatey-400 mt-0.5">Over last {o.period}</p>
                  </div>
                  <span className="text-xs font-bold text-emerald-600 bg-emerald-50 px-2 py-1 rounded-full">{o.improvement}</span>
                </div>
              ))
            ) : (
              <p className="text-xs text-slatey-400 text-center py-4">No recent improvements tracked.</p>
            )}
          </div>
        </motion.div>

        {/* Most Declining Areas */}
        <motion.div variants={item} className="bg-white p-5 rounded-2xl border border-slatey-200 shadow-glow">
          <h3 className="text-sm font-semibold text-rose-700 bg-rose-50 w-fit px-2 py-1 rounded-md mb-4">Areas Needing Attention</h3>
          <div className="space-y-4">
            {insights.decliningOutlets && insights.decliningOutlets.length > 0 ? (
              insights.decliningOutlets.map((o, i) => (
                <div key={i} className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-slatey-800">{o.name || 'Category'}</p>
                    <p className="text-[10px] text-slatey-400 mt-0.5">Over last {o.period}</p>
                  </div>
                  <span className="text-xs font-bold text-rose-600 bg-rose-50 px-2 py-1 rounded-full">{o.improvement}</span>
                </div>
              ))
            ) : (
              <p className="text-xs text-slatey-400 text-center py-4">No declining areas tracked.</p>
            )}
          </div>
        </motion.div>
      </motion.div>

      {/* Risk Rankings Section */}
      <motion.div variants={stagger} className="grid gap-6 md:grid-cols-2">
        <motion.div variants={item} className="bg-white p-5 rounded-2xl border border-slatey-200 shadow-glow">
          <h3 className="text-sm font-semibold text-rose-700 bg-rose-50 w-fit px-2 py-1 rounded-md mb-4 flex items-center gap-2">
            <AlertCircle className="h-4 w-4" /> Outlet Risk Ranking
          </h3>
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-slatey-800">Overall Outlet Risk Score</p>
                <p className="text-[10px] text-slatey-400 mt-0.5">Based on low rating frequency</p>
              </div>
              <span className={`text-xs font-bold px-2 py-1 rounded-full ${insights.outletRiskScore > 10 ? 'bg-rose-100 text-rose-700' : 'bg-amber-100 text-amber-700'}`}>
                {insights.outletRiskScore} Risk Pts
              </span>
            </div>
          </div>
        </motion.div>

        <motion.div variants={item} className="bg-white p-5 rounded-2xl border border-slatey-200 shadow-glow">
          <h3 className="text-sm font-semibold text-rose-700 bg-rose-50 w-fit px-2 py-1 rounded-md mb-4 flex items-center gap-2">
            <Users className="h-4 w-4" /> Customer Risk Ranking
          </h3>
          <div className="space-y-4">
            {insights.customerRiskRanking && insights.customerRiskRanking.length > 0 ? (
              insights.customerRiskRanking.map((c, i) => (
                <div key={i} className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-slatey-800">{c.name}</p>
                    <p className="text-[10px] text-slatey-400 mt-0.5">Repeat low-rating offender</p>
                  </div>
                  <span className="text-xs font-bold text-rose-600 bg-rose-50 px-2 py-1 rounded-full">{c.score} Risk Pts</span>
                </div>
              ))
            ) : (
              <p className="text-xs text-slatey-400 text-center py-4">No high-risk customers identified.</p>
            )}
          </div>
        </motion.div>
      </motion.div>

      {/* Admin Update Options Table */}
      <motion.div variants={item} className="bg-white rounded-2xl border border-slatey-200 shadow-glow overflow-hidden">
        <div className="px-6 py-5 border-b border-slatey-100 flex items-center justify-between">
          <div>
            <h3 className="text-base font-bold text-slatey-900">Issue Category Management</h3>
            <p className="text-xs text-slatey-500 mt-1">Manage intelligence categories, merge duplicates, and correct AI misclassifications.</p>
          </div>
          <Button variant="outline" className="text-xs">
            <Settings2 className="h-4 w-4" /> Category Settings
          </Button>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm border-collapse">
            <thead className="bg-slatey-50/80 text-xs font-medium uppercase tracking-wider text-slatey-500">
              <tr>
                <th className="px-6 py-4">Category Name</th>
                <th className="px-6 py-4">Mentions ({filters.dateRange === 'all' ? 'All Time' : filters.dateRange})</th>
                <th className="px-6 py-4">Trend</th>
                <th className="px-6 py-4">System Tag</th>
                <th className="px-6 py-4 text-right">Admin Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slatey-100">
              {insights.adminCategories.map((cat) => (
                <tr key={cat.id} className="group hover:bg-slatey-50/50 transition-colors">
                  <td className="px-6 py-4 font-semibold text-slatey-800">{cat.name}</td>
                  <td className="px-6 py-4 text-slatey-600">{cat.mentions} mentions</td>
                  <td className="px-6 py-4">
                    <span className={`text-xs font-bold ${cat.trend.startsWith('+') ? 'text-rose-500' : 'text-emerald-500'}`}>
                      {cat.trend}
                    </span>
                  </td>
                  <td className="px-6 py-4">
                    <span className={`inline-flex px-2 py-1 rounded-md text-[10px] font-bold uppercase tracking-wider ${
                      cat.status === 'Operational Risk' ? 'bg-rose-100 text-rose-700' :
                      cat.status === 'Important' ? 'bg-amber-100 text-amber-700' :
                      'bg-slatey-100 text-slatey-600'
                    }`}>
                      {cat.status}
                    </span>
                    {cat.customNote && (
                      <p className="text-[10px] text-slatey-500 mt-1 italic">{cat.customNote}</p>
                    )}
                  </td>
                  <td className="px-6 py-4 text-right">
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <button className="p-1.5 rounded-md hover:bg-slatey-100 text-slatey-400 hover:text-slatey-700 transition">
                          <MoreVertical className="h-4 w-4" />
                        </button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end" className="w-56">
                        <DropdownMenuItem className="text-xs cursor-pointer" onClick={() => handleOpenAction('Merge into similar category', cat)}>Merge into similar category...</DropdownMenuItem>
                        <DropdownMenuItem className="text-xs cursor-pointer" onClick={() => handleOpenAction('Rename category', cat)}>Rename category</DropdownMenuItem>
                        <DropdownMenuItem className="text-xs cursor-pointer" onClick={() => handleOpenAction('Correct AI misclassification', cat)}>Correct AI misclassification</DropdownMenuItem>
                        <DropdownMenuItem className="text-xs font-medium text-amber-600 cursor-pointer" onClick={() => handleOpenAction('Mark as Important', cat)}>Mark as Important</DropdownMenuItem>
                        <DropdownMenuItem className="text-xs font-medium text-rose-600 cursor-pointer" onClick={() => handleOpenAction('Tag as Operational Risk', cat)}>Tag as Operational Risk</DropdownMenuItem>
                        <DropdownMenuItem className="text-xs cursor-pointer" onClick={() => handleOpenAction('Add custom insight note', cat)}>Add custom insight note</DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </motion.div>

      <DialogRoot open={actionDialogOpen} onOpenChange={setActionDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogTitle>{actionType}</DialogTitle>
          <DialogDescription>
            Applying changes to category: <strong className="text-slatey-800">{selectedCat?.name}</strong>
          </DialogDescription>
          
          <div className="mt-4 space-y-4">
            {(actionType === 'Rename category' || actionType === 'Merge into similar category' || actionType === 'Add custom insight note') && (
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-slatey-500">
                  {actionType === 'Rename category' ? 'New Name' : actionType === 'Merge into similar category' ? 'Target Category Name' : 'Note Details'}
                </label>
                {actionType === 'Add custom insight note' ? (
                  <textarea 
                    className="w-full rounded-xl border border-slatey-200 p-2 text-sm text-slatey-700 outline-none focus:border-brand-400" 
                    rows={3}
                    value={inputValue} 
                    onChange={e => setInputValue(e.target.value)} 
                    placeholder="Enter notes here..."
                  />
                ) : (
                  <Input value={inputValue} onChange={e => setInputValue(e.target.value)} />
                )}
              </div>
            )}
            
            {(actionType === 'Mark as Important' || actionType === 'Tag as Operational Risk' || actionType === 'Correct AI misclassification') && (
              <p className="text-sm text-slatey-600">
                Are you sure you want to proceed with this action? This will update how the AI processes future reviews in this category.
              </p>
            )}
          </div>
          
          <div className="mt-6 flex justify-end gap-3">
            <Button variant="ghost" onClick={() => setActionDialogOpen(false)}>Cancel</Button>
            <Button onClick={submitAction}>Confirm Action</Button>
          </div>
        </DialogContent>
      </DialogRoot>

    </motion.div>
  )
}
