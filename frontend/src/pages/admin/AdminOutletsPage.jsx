import { useEffect, useMemo, useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { Plus, Search, MoreVertical, ExternalLink, ShieldAlert, CheckCircle2, XCircle, X, Trash2 } from 'lucide-react'
import { motion, AnimatePresence } from 'framer-motion'
import { toast } from 'sonner'
import Button from '../../components/ui/button'
import Input from '../../components/ui/input'
import { fetchAdminOutlets, toggleAdminOutletStatus, createAdminOutlet, fetchPlaceDetails, fetchPlaceSuggestions, deleteAdminOutlet } from '../../services/outletService'
import { fetchAdminCustomers, normalizeCustomers } from '../../services/adminService'
import { USE_MOCK_DATA } from '../../config/env'
import { MOCK_CUSTOMERS, MOCK_OUTLETS } from '../../config/mockData'
import { DialogContent, DialogDescription, DialogRoot, DialogTitle } from '../../components/ui/dialog'
import Skeleton from '../../components/feedback/Skeleton'
import { Card } from '../../components/ui/card'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '../../components/ui/dropdown-menu'

const stagger = {
  hidden: { opacity: 0 },
  show: {
    opacity: 1,
    transition: { staggerChildren: 0.05 }
  }
}

const rowVariants = {
  hidden: { opacity: 0, x: -10 },
  show: { opacity: 1, x: 0 }
}

export default function AdminOutletsPage() {
  const [query, setQuery] = useState('')
  const [dialogOpen, setDialogOpen] = useState(false)
  const [selectedOutlet, setSelectedOutlet] = useState(null)
  const [statusFilter, setStatusFilter] = useState('all')
  const [ratingFilter, setRatingFilter] = useState('all')
  const [addDialogOpen, setAddDialogOpen] = useState(false)
  const [newOutlet, setNewOutlet] = useState({
    email: '',
    placeSearch: '',
    placeId: '',
    name: '',
    address: '',
    phone: '',
    website: '',
  })
  const [placeSuggestions, setPlaceSuggestions] = useState([])
  const [suggestionsLoading, setSuggestionsLoading] = useState(false)
  const [autocompleteError, setAutocompleteError] = useState('')
  const [sessionToken, setSessionToken] = useState('')
  const [placeDetailsLoading, setPlaceDetailsLoading] = useState(false)
  const [isCreating, setIsCreating] = useState(false)

  const queryClient = useQueryClient()

  const { data: outletData, isLoading: outletsLoading, error: outletsError, refetch: refetchOutlets } = useQuery({
    queryKey: ['admin-outlets'],
    queryFn: async () => {
      if (USE_MOCK_DATA) return { outlets: MOCK_OUTLETS, total: MOCK_OUTLETS.length }
      return fetchAdminOutlets()
    },
    staleTime: 60 * 1000
  })

  const { data: rawCustomers, isLoading: customersLoading } = useQuery({
    queryKey: ['admin-customers'],
    queryFn: async () => {
      if (USE_MOCK_DATA) return MOCK_CUSTOMERS;
      return fetchAdminCustomers()
    }
  })

  const isLoading = outletsLoading || customersLoading;

  const customers = useMemo(() => {
    return normalizeCustomers(rawCustomers)
  }, [rawCustomers]);

  const toggleStatusMutation = useMutation({
    mutationFn: ({ id, isActive }) => toggleAdminOutletStatus(id, isActive),
    onSuccess: () => {
      queryClient.invalidateQueries(['admin-outlets'])
      setDialogOpen(false)
    }
  })

  const [removeDialogOpen, setRemoveDialogOpen] = useState(false)
  const [outletToRemove, setOutletToRemove] = useState(null)

  const removeOutletMutation = useMutation({
    mutationFn: (id) => deleteAdminOutlet(id),
    onSuccess: () => {
      toast.success(`Outlet "${outletToRemove?.name || outletToRemove?.googleLocationName || 'Outlet'}" removed successfully`)
      queryClient.invalidateQueries(['admin-outlets'])
      setRemoveDialogOpen(false)
      setOutletToRemove(null)
    },
    onError: (err) => {
      const message = err?.response?.data?.error || err?.message || 'Failed to remove outlet'
      toast.error(message)
    }
  })

  const handleRemoveOutlet = () => {
    if (!outletToRemove || removeOutletMutation.isPending) return
    removeOutletMutation.mutate(outletToRemove.id)
  }

  const handleToggleStatus = () => {
    if (!selectedOutlet) return
    toggleStatusMutation.mutate({ 
      id: selectedOutlet.id, 
      isActive: !selectedOutlet.isActive 
    })
  }

  useEffect(() => {
    if (!addDialogOpen) {
      return
    }

    const query = newOutlet.placeSearch.trim()
    if (query.length < 3) {
      return
    }

    const timer = window.setTimeout(async () => {
      setSuggestionsLoading(true)
      setAutocompleteError('')
      try {
        const suggestions = await fetchPlaceSuggestions(query, sessionToken)
        setPlaceSuggestions(suggestions)
      } catch (error) {
        const message = error?.response?.data?.error || error?.message || 'Unable to fetch place suggestions.'
        console.error('[AdminOutletsPage] place autocomplete failed', message)
        setPlaceSuggestions([])
        setAutocompleteError(message)
      } finally {
        setSuggestionsLoading(false)
      }
    }, 350)

    return () => window.clearTimeout(timer)
  }, [addDialogOpen, newOutlet.placeSearch, sessionToken])

  const handleSelectPlace = async (suggestion) => {
    setNewOutlet((prev) => ({
      ...prev,
      placeSearch: suggestion.description,
      placeId: suggestion.placeId,
    }))
    setPlaceSuggestions([])
    setPlaceDetailsLoading(true)

    try {
      const details = await fetchPlaceDetails(suggestion.placeId, sessionToken)
      setNewOutlet((prev) => ({
        ...prev,
        name: details.name || prev.name,
        address: details.formatted_address || prev.address,
        phone: details.phone || prev.phone,
        website: details.website || prev.website,
      }))
    } catch (error) {
      toast.error('Failed to load business details. Please try again.')
      console.error('[AdminOutletsPage] load place details failed', error)
    } finally {
      setPlaceDetailsLoading(false)
    }
  }

  const handleOpenAddDialog = () => {
    setAddDialogOpen(true)
    setNewOutlet({
      email: '',
      placeSearch: '',
      placeId: '',
      name: '',
      address: '',
      phone: '',
      website: '',
    })
    setPlaceSuggestions([])
    setSessionToken(window.crypto?.randomUUID ? window.crypto.randomUUID() : `${Date.now()}-${Math.random()}`)
  }

  const handlePlaceSearchChange = (value) => {
    setNewOutlet((prev) => ({
      ...prev,
      placeSearch: value,
      placeId: '',
      name: '',
      address: '',
      phone: '',
      website: '',
    }))
  }

  const handleCreateOutlet = async () => {
    if (!newOutlet.email.trim() || !newOutlet.placeId || !newOutlet.name.trim()) {
      toast.error('Please provide a valid business email and select a business from the suggestions.')
      return
    }

    setIsCreating(true)
    try {
      await createAdminOutlet({
        email: newOutlet.email.trim(),
        name: newOutlet.name.trim(),
        placeId: newOutlet.placeId,
        address: newOutlet.address.trim(),
        phone: newOutlet.phone.trim(),
        website: newOutlet.website.trim(),
      })

      toast.success('Outlet created successfully. The business email can now sign in with Google.')
      setAddDialogOpen(false)
      queryClient.invalidateQueries(['admin-outlets'])
    } catch (error) {
      toast.error(error?.response?.data?.error || error.message || 'Failed to create outlet.')
    } finally {
      setIsCreating(false)
    }
  }

  const rows = useMemo(() => {
    if (Array.isArray(outletData?.outlets)) return outletData.outlets
    if (Array.isArray(outletData)) return outletData
    if (Array.isArray(outletData?.data)) return outletData.data
    return []
  }, [outletData])

  const filtered = useMemo(() => {
    return rows.filter((row) => {
      const outletName = (row.name || row.googleLocationName || row.businessName || '').toLowerCase()
      const outletId = (row.id || '').toLowerCase()
      const outletEmail = (row.email || row.googleAccountEmail || '').toLowerCase()
      const addressMatch = (row.address || '').toLowerCase().includes(query.toLowerCase())
      
      const matchesSearch =
        outletName.includes(query.toLowerCase()) ||
        outletId.includes(query.toLowerCase()) ||
        outletEmail.includes(query.toLowerCase()) ||
        addressMatch

      const status = row.isActive ? 'active' : 'inactive'
      const matchesStatus = statusFilter === 'all' || status === statusFilter

      let matchesRating = true
      if (ratingFilter !== 'all') {
        const r = Number(row.avgRating || 0)
        if (ratingFilter === 'high') matchesRating = r >= 4.0
        else if (ratingFilter === 'medium') matchesRating = r >= 3.0 && r < 4.0
        else if (ratingFilter === 'low') matchesRating = r < 3.0
      }

      return matchesSearch && matchesStatus && matchesRating
    })
  }, [rows, query, statusFilter, ratingFilter])

  return (
    <motion.div className="space-y-6" initial="hidden" animate="show" variants={stagger}>
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold text-slatey-900">Outlet Management</h2>
          <p className="text-sm text-slatey-500">Monitor and manage all connected business profiles.</p>
        </div>
        <div className="flex items-center gap-3">
          {/* <Button variant="outline" className="hidden sm:flex">
            <ExternalLink className="h-4 w-4" />
            Export CSV
          </Button> */}
          <Button className="shadow-brand" onClick={handleOpenAddDialog}>
            <Plus className="h-4 w-4" />
            Add New Outlet
          </Button>
        </div>
      </div>

      <Card className="p-4 border-none shadow-glow">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex flex-1 min-w-[280px] items-center gap-3 rounded-xl border border-slatey-200 bg-slatey-50/50 px-4 py-2 transition-all focus-within:border-brand-400 focus-within:ring-2 focus-within:ring-brand-100 dark:border-slatey-800 dark:bg-slatey-900/50">
            <Search className="h-4 w-4 text-slatey-400" />
            <input
              className="w-full bg-transparent text-sm text-slatey-700 outline-none placeholder:text-slatey-400 dark:text-slatey-300"
              placeholder="Search by outlet name, ID or email..."
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
          </div>
          <div className="flex items-center gap-2">
            <select
              value={ratingFilter}
              onChange={(e) => setRatingFilter(e.target.value)}
              className="rounded-xl border border-slatey-200 bg-white px-3 py-2 text-sm text-slatey-700 outline-none focus:border-brand-400 dark:border-slatey-800 dark:bg-slatey-900/50 dark:text-slatey-300"
            >
              <option value="all">All Ratings</option>
              <option value="high">High (4.0+)</option>
              <option value="medium">Medium (3.0-3.9)</option>
              <option value="low">Low (&lt;3.0)</option>
            </select>
            <div className="flex gap-1 rounded-lg border border-slatey-100 bg-slatey-50 p-1 dark:border-slatey-800 dark:bg-slatey-950">
              {['all', 'active', 'inactive'].map((s) => (
                <button
                  key={s}
                  onClick={() => setStatusFilter(s)}
                  className={`rounded-md px-3 py-1.5 text-xs font-medium transition-all ${
                    statusFilter === s 
                      ? 'bg-white text-brand-600 shadow-sm dark:bg-slatey-800 dark:text-brand-400' 
                      : 'text-slatey-500 hover:text-slatey-700 dark:text-slatey-400 dark:hover:text-slatey-200'
                  }`}
                >
                  {s.charAt(0).toUpperCase() + s.slice(1)}
                </button>
              ))}
            </div>
          </div>
        </div>
      </Card>

      <div className="overflow-hidden rounded-2xl border border-slatey-200 bg-white shadow-sm dark:border-slatey-800 dark:bg-slatey-900/40">
        <table className="w-full border-collapse text-left text-sm">
          <thead className="bg-slatey-50/80 text-xs font-medium uppercase tracking-wider text-slatey-500 dark:bg-slatey-900 dark:text-slatey-400">
            <tr>
              <th className="px-6 py-4">Outlet Name</th>
              <th className="px-6 py-4">Address</th>
              <th className="px-6 py-4">Total Reviews</th>
              <th className="px-6 py-4">Rating</th>
              <th className="px-6 py-4">Connected Account</th>
              <th className="px-6 py-4 text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slatey-100">
            <AnimatePresence mode="popLayout">
              {isLoading ? (
                Array(5).fill(0).map((_, i) => (
                  <tr key={i}>
                    <td className="px-6 py-4" colSpan={8}><Skeleton className="h-10 w-full" /></td>
                  </tr>
                ))
              ) : filtered.length > 0 ? (
                filtered.map((row) => {
                  const displayName = row.name || row.googleLocationName || row.businessName || 'Unnamed Outlet'
                  const customer = customers.find(c => c.id === row.customerId || (c.email && c.email.toLowerCase() === (row.email || row.googleAccountEmail || '').toLowerCase())) || {}
                  const accountTitle = customer.name || row.customerName || row.googleAccountEmail || row.email || 'Google Business Profile'
                  const accountSub = customer.email || row.googleAccountEmail || row.email || row.id

                  return (
                  <motion.tr
                    key={row.id}
                    variants={rowVariants}
                    layout
                    className="group transition-colors hover:bg-slatey-50/50 dark:hover:bg-slatey-800/30"
                  >
                    <td className="px-6 py-4">
                      <div className="flex flex-col">
                        <span className="font-semibold text-slatey-800 group-hover:text-brand-600 transition-colors dark:text-slatey-200 dark:group-hover:text-brand-400">
                          {displayName}
                        </span>
                        <span className="text-[11px] text-slatey-400">{row.id}</span>
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <span className="text-sm text-slatey-600 dark:text-slatey-400">{row.address || 'N/A'}</span>
                    </td>
                    <td className="px-6 py-4">
                      <span className="font-medium text-slatey-800 dark:text-slatey-200">{row.reviewCount || 0}</span>
                    </td>
                    <td className="px-6 py-4">
                      <div className={`inline-flex w-fit items-center gap-1 rounded-md px-1.5 py-0.5 text-xs font-bold ${
                        row.avgRating >= 4.5 ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-400' : 
                        row.avgRating >= 4.0 ? 'bg-brand-50 text-brand-700 dark:bg-brand-500/10 dark:text-brand-400' : 
                        'bg-amber-50 text-amber-700 dark:bg-amber-500/10 dark:text-amber-400'
                      }`}>
                        {row.avgRating ? `${row.avgRating} ★` : '—'}
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex flex-col">
                        <span className="font-medium text-slatey-800 dark:text-slatey-200">
                          {accountTitle}
                        </span>
                        <span className="text-[11px] text-slatey-400">{accountSub}</span>
                      </div>
                    </td>
                    <td className="px-6 py-4 text-right">
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <button className="rounded-lg p-1.5 text-slatey-400 transition hover:bg-slatey-100 hover:text-slatey-700">
                            <MoreVertical className="h-4 w-4" />
                          </button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end" className="w-48">
                          <DropdownMenuItem asChild>
                            <Link to={`/admin-dashboard/outlets/${row.id}`} className="flex items-center gap-2">
                              <ExternalLink className="h-4 w-4" /> View Details
                            </Link>
                          </DropdownMenuItem>
                          <DropdownMenuItem 
                            className={`flex items-center gap-2 ${row.isActive ? 'text-rose-500' : 'text-emerald-600'}`}
                            onClick={() => {
                              setSelectedOutlet(row)
                              setDialogOpen(true)
                            }}
                          >
                            <ShieldAlert className="h-4 w-4" /> {row.isActive ? 'Suspend' : 'Reactivate'}
                          </DropdownMenuItem>
                          <DropdownMenuItem 
                            className="flex items-center gap-2 text-rose-600 focus:bg-rose-50 focus:text-rose-700 dark:focus:bg-rose-950/50"
                            onClick={() => {
                              setOutletToRemove(row)
                              setRemoveDialogOpen(true)
                            }}
                          >
                            <Trash2 className="h-4 w-4" /> Remove
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>  
                    </td>
                  </motion.tr>
                  )
                })
              ) : (
                <tr>
                  <td colSpan={8} className="py-20 text-center">
                    <div className="flex flex-col items-center">
                      <div className="rounded-full bg-slatey-50 p-4">
                        <Search className="h-8 w-8 text-slatey-300" />
                      </div>
                      <p className="mt-4 font-medium text-slatey-500">No outlets found matching "{query}"</p>
                      <Button variant="ghost" size="sm" className="mt-2 text-brand-600" onClick={() => setQuery('')}>
                        Clear search
                      </Button>
                    </div>
                  </td>
                </tr>
              )}
            </AnimatePresence>
          </tbody>
        </table>
      </div>

      <DialogRoot open={addDialogOpen} onOpenChange={setAddDialogOpen}>
        <DialogContent
          className="max-w-xl"
          onInteractOutside={(event) => event.preventDefault()}
          onEscapeKeyDown={(event) => event.preventDefault()}
        >
          <div className="absolute right-4 top-4">
            <button
              type="button"
              onClick={() => setAddDialogOpen(false)}
              className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-slatey-200 bg-white text-slatey-600 shadow-sm transition hover:bg-slatey-100 dark:border-slatey-700 dark:bg-slatey-950 dark:text-slatey-300"
              aria-label="Close dialog"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
          <div className="flex h-12 w-12 items-center justify-center rounded-full bg-brand-50 text-brand-600 mb-4">
            <Plus className="h-6 w-6" />
          </div>
          <DialogTitle>Add New Outlet</DialogTitle>
          <DialogDescription>
            Create a new business profile and whitelist the outlet email for Google login. Select the registered business listing so we can pre-fill the details.
          </DialogDescription>

          <div className="mt-6 grid gap-4">
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-slatey-500 ml-1">Business email</label>
              <Input
                type="email"
                placeholder="owner@business.com"
                value={newOutlet.email}
                onChange={(e) => setNewOutlet((prev) => ({ ...prev, email: e.target.value }))}
                required
              />
            </div>

            <div className="space-y-1.5 relative">
              <label className="text-xs font-semibold text-slatey-500 ml-1">Business listing</label>
              <Input
                placeholder="Search business name or address"
                value={newOutlet.placeSearch}
                onChange={(e) => handlePlaceSearchChange(e.target.value)}
              />
              {suggestionsLoading && (
                <div className="mt-2 text-xs text-slatey-500">Searching for matching businesses...</div>
              )}
              {autocompleteError && !suggestionsLoading && (
                <div className="mt-2 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-700">
                  {autocompleteError}
                </div>
              )}
              {!suggestionsLoading && !autocompleteError && newOutlet.placeSearch.trim().length >= 3 && placeSuggestions.length === 0 && (
                <div className="mt-2 text-xs text-slatey-500">No matching businesses were found. Try a different name or address.</div>
              )}
              {placeSuggestions.length > 0 && (
                <div className="absolute left-0 right-0 z-20 mt-2 max-h-64 overflow-auto rounded-2xl border border-slatey-200 bg-white p-2 shadow-lg dark:border-slatey-700 dark:bg-slatey-900">
                  {placeSuggestions.map((suggestion) => (
                    <button
                      key={suggestion.placeId}
                      type="button"
                      onClick={() => handleSelectPlace(suggestion)}
                      className="w-full rounded-xl px-3 py-2 text-left text-sm text-slatey-700 transition hover:bg-slatey-50 dark:text-slatey-200 dark:hover:bg-slatey-800"
                    >
                      <div className="font-medium">{suggestion.mainText || suggestion.description}</div>
                      <div className="text-[11px] text-slatey-400">{suggestion.secondaryText || suggestion.description}</div>
                    </button>
                  ))}
                </div>
              )}
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-slatey-500 ml-1">Business name</label>
                <Input
                  placeholder="Business name"
                  value={newOutlet.name}
                  onChange={(e) => setNewOutlet((prev) => ({ ...prev, name: e.target.value }))}
                />
              </div>
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-slatey-500 ml-1">Phone</label>
                <Input
                  placeholder="+1 234 567 890"
                  value={newOutlet.phone}
                  onChange={(e) => setNewOutlet((prev) => ({ ...prev, phone: e.target.value }))}
                />
              </div>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-slatey-500 ml-1">Website</label>
                <Input
                  placeholder="https://example.com"
                  value={newOutlet.website}
                  onChange={(e) => setNewOutlet((prev) => ({ ...prev, website: e.target.value }))}
                />
              </div>
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-slatey-500 ml-1">Address</label>
                <Input
                  placeholder="Business address"
                  value={newOutlet.address}
                  onChange={(e) => setNewOutlet((prev) => ({ ...prev, address: e.target.value }))}
                />
              </div>
            </div>

            {placeDetailsLoading && (
              <p className="text-xs text-slatey-500">Loading business details…</p>
            )}
          </div>

          <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:justify-end">
            <Button variant="ghost" onClick={() => setAddDialogOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={handleCreateOutlet}
              disabled={!newOutlet.email.trim() || !newOutlet.placeId || isCreating}
            >
              {isCreating ? 'Creating outlet...' : 'Create Outlet'}
            </Button>
          </div>
        </DialogContent>
      </DialogRoot>

      <DialogRoot open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent
          className="max-w-md"
          onInteractOutside={(event) => event.preventDefault()}
          onEscapeKeyDown={(event) => event.preventDefault()}
        >
          <div className="flex h-12 w-12 items-center justify-center rounded-full bg-rose-50 text-rose-500 mb-4">
            <ShieldAlert className="h-6 w-6" />
          </div>
          <DialogTitle>{selectedOutlet?.isActive ? 'Confirm Deactivation' : 'Confirm Activation'}</DialogTitle>
          <DialogDescription>
            You are about to {selectedOutlet?.isActive ? 'suspend' : 'activate'} <strong>{selectedOutlet?.name}</strong>. This will:
          </DialogDescription>
          <ul className="mt-4 space-y-2 text-sm text-slatey-500">
            <li className="flex items-center gap-2">
              {selectedOutlet?.isActive ? <XCircle className="h-4 w-4 text-rose-400" /> : <CheckCircle2 className="h-4 w-4 text-emerald-400" />} 
              {selectedOutlet?.isActive ? 'Stop all automated review responses' : 'Resume automated review responses'}
            </li>
            <li className="flex items-center gap-2">
              {selectedOutlet?.isActive ? <XCircle className="h-4 w-4 text-rose-400" /> : <CheckCircle2 className="h-4 w-4 text-emerald-400" />}
              {selectedOutlet?.isActive ? 'Disable WhatsApp escalation alerts' : 'Enable WhatsApp escalation alerts'}
            </li>
            <li className="flex items-center gap-2"><CheckCircle2 className="h-4 w-4 text-emerald-400" /> Retain all historical review data</li>
          </ul>
          <div className="mt-8 flex justify-end gap-3">
            <Button variant="ghost" onClick={() => setDialogOpen(false)}>
              Cancel
            </Button>
            <Button 
              className={selectedOutlet?.isActive ? 'bg-rose-600 hover:bg-rose-700 shadow-rose' : 'bg-emerald-600 hover:bg-emerald-700 shadow-emerald'} 
              onClick={handleToggleStatus}
              isLoading={toggleStatusMutation.isPending}
            >
              {selectedOutlet?.isActive ? 'Suspend Outlet' : 'Activate Outlet'}
            </Button>
          </div>
        </DialogContent>
      </DialogRoot>

      <DialogRoot open={removeDialogOpen} onOpenChange={(open) => {
        if (!removeOutletMutation.isPending) {
          setRemoveDialogOpen(open)
          if (!open) setOutletToRemove(null)
        }
      }}>
        <DialogContent
          className="max-w-md"
          onInteractOutside={(event) => {
            if (removeOutletMutation.isPending) event.preventDefault()
          }}
          onEscapeKeyDown={(event) => {
            if (removeOutletMutation.isPending) event.preventDefault()
          }}
        >
          <div className="flex h-12 w-12 items-center justify-center rounded-full bg-rose-100 text-rose-600 mb-4 dark:bg-rose-950 dark:text-rose-400">
            <Trash2 className="h-6 w-6" />
          </div>
          <DialogTitle>Remove Outlet?</DialogTitle>
          <DialogDescription>
            Are you sure you want to remove <strong>{outletToRemove?.name || outletToRemove?.googleLocationName || 'this outlet'}</strong>? This action cannot be undone.
          </DialogDescription>
          <div className="mt-8 flex justify-end gap-3">
            <Button 
              variant="ghost" 
              onClick={() => {
                setRemoveDialogOpen(false)
                setOutletToRemove(null)
              }}
              disabled={removeOutletMutation.isPending}
            >
              Cancel
            </Button>
            <Button 
              className="bg-rose-600 hover:bg-rose-700 shadow-rose text-white" 
              onClick={handleRemoveOutlet}
              isLoading={removeOutletMutation.isPending}
              disabled={removeOutletMutation.isPending}
            >
              {removeOutletMutation.isPending ? 'Removing...' : 'Remove Outlet'}
            </Button>
          </div>
        </DialogContent>
      </DialogRoot>
    </motion.div>
  )
}
