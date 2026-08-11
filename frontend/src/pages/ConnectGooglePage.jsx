import { useEffect, useMemo, useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { motion, AnimatePresence } from 'framer-motion'
import {
  CheckCircle2, Link2, Loader2, Store, RefreshCw, MapPin, AlertTriangle,
  Clock, Info, ChevronRight, Sparkles, ShieldCheck
} from 'lucide-react'
import { toast } from 'sonner'
import {
  startGoogleOAuth, getGoogleConnectionStatus,
  setActiveGoogleLocation, syncBusinessData
} from '../services/googleAuthService'
import Button from '../components/ui/button'
import { useAuth } from '../contexts/AuthContext'

const GBP_API_PENDING = true// flip to false once GBP API access is approved

export default function ConnectGooglePage() {
  const { profile } = useAuth()
  const queryClient = useQueryClient()
  const [settingLocationId, setSettingLocationId] = useState('')
  const [isSyncing, setIsSyncing] = useState(false)

  const outletId = profile?.outletId || ''
  const enabled = useMemo(() => Boolean(outletId && outletId.length > 0), [outletId])

  const { data, isLoading, refetch } = useQuery({
    queryKey: ['google-connection', outletId],
    queryFn: () => getGoogleConnectionStatus(outletId),
    enabled,
    staleTime: 5 * 60 * 1000,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false
  })

  useEffect(() => {
    const handleMessage = (event) => {
      if (event.data?.type === 'gmb-connected') {
        toast.success('Google Business Profile connected successfully!')
        queryClient.invalidateQueries({ queryKey: ['google-connection', outletId] })
      } else if (event.data?.type === 'gmb-error') {
        toast.error(`Google Connection failed: ${event.data.error}`)
      }
    }
    window.addEventListener('message', handleMessage)
    return () => window.removeEventListener('message', handleMessage)
  }, [outletId, queryClient])

  const handleSync = async () => {
    if (!outletId) return
    setIsSyncing(true)
    try {
      await syncBusinessData(outletId, true)
      toast.success('Business data synced successfully.')
      queryClient.invalidateQueries({ queryKey: ['google-connection', outletId] })
    } catch (error) {
      const raw = error?.response?.data?.error || error?.message || 'Failed to sync.'
      const isQuota = /quota/i.test(raw)
      if (isQuota) {
        toast.error('Google API quota not yet active. Your access request is pending approval (7–10 days).')
      } else {
        toast.error(raw)
      }
    } finally {
      setIsSyncing(false)
    }
  }

  const handleSetActive = async (location) => {
    if (!outletId) return
    setSettingLocationId(location.id)
    try {
      await setActiveGoogleLocation(outletId, location.id)
      toast.success(`Active location set to "${location.name}"`)
      queryClient.invalidateQueries({ queryKey: ['google-connection', outletId] })
    } catch (error) {
      toast.error(error?.response?.data?.error || 'Failed to update active location.')
    } finally {
      setSettingLocationId('')
    }
  }

  return (
    <div className="mx-auto flex min-h-screen max-w-3xl flex-col gap-6 sm:gap-8 px-3 py-6 sm:px-6 sm:py-12">

      {/* Page header */}
      <motion.div initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4 }}>
        <span className="badge-ring">
          <Link2 className="h-4 w-4" /> Google Business Profile
        </span>
        <h1 className="mt-4 text-2xl sm:text-3xl font-semibold">Connect Google Business</h1>
        <p className="mt-2 text-sm text-slatey-500">
          Securely link your Google Business Profile. OAuth tokens are stored encrypted on the backend — the frontend only initiates the auth flow.
        </p>
      </motion.div>

      {/* GBP API Pending Notice */}
      {GBP_API_PENDING && (
        <motion.div
          initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4, delay: 0.05 }}
          className="flex items-start gap-3 sm:gap-4 rounded-2xl border border-amber-200 bg-amber-50/80 px-4 py-3 sm:px-5 sm:py-4"
        >
          <Clock className="mt-0.5 h-5 w-5 shrink-0 text-amber-500" />
          <div>
            <p className="text-sm font-semibold text-amber-800">GBP API access pending approval</p>
            <p className="mt-1 text-xs leading-relaxed text-amber-700">
              Your Google Business Profile API access request has been submitted. Google typically approves these within <strong>7–10 business days</strong>. Once approved, "Sync Locations" will work and the review automation pipeline will activate.
            </p>
            <div className="mt-3 flex flex-wrap gap-2 sm:gap-3">
              <div className="flex items-center gap-1.5 text-xs text-amber-700">
                <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" /> OAuth connected ✓
              </div>
              <div className="flex items-center gap-1.5 text-xs text-amber-700">
                <Clock className="h-3.5 w-3.5" /> Account Management API — pending quota
              </div>
              <div className="flex items-center gap-1.5 text-xs text-amber-700">
                <Clock className="h-3.5 w-3.5" /> Reviews API — pending quota
              </div>
            </div>
          </div>
        </motion.div>
      )}

      {/* Main connection card */}
      <motion.div
        initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4, delay: 0.1 }}
        className="glass-panel rounded-3xl p-4 sm:p-6"
      >
        <div className="flex items-center justify-between">
          <div>
            <p className="text-xs uppercase tracking-[0.18em] text-slatey-400">Outlet ID</p>
            <p className="mt-1 font-mono text-sm font-semibold text-slatey-700">{outletId || 'Not linked yet'}</p>
          </div>
          {data?.connected && (
            <div className="flex items-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs font-semibold text-emerald-700">
              <ShieldCheck className="h-4 w-4" /> Token stored securely
            </div>
          )}
        </div>

        {/* Action Buttons */}
        <div className="mt-6 flex flex-wrap items-center gap-3">
          <Button onClick={() => startGoogleOAuth(outletId, profile?.id)} disabled={!outletId}>
            <Link2 className="h-4 w-4" />
            {data?.connected ? 'Reconnect Google' : 'Connect Google Business'}
          </Button>
          <Button
            variant="outline"
            disabled={!outletId || isLoading || isSyncing || !data?.connected}
            onClick={handleSync}
            title={GBP_API_PENDING ? 'Sync Locations requires GBP API quota (pending approval)' : ''}
          >
            {isSyncing
              ? <><Loader2 className="h-4 w-4 animate-spin" /> Syncing…</>
              : <><RefreshCw className="h-4 w-4" /> Sync Locations</>
            }
          </Button>
          <Button variant="ghost" disabled={!outletId || isLoading} onClick={() => refetch()}>
            {isLoading ? <><Loader2 className="h-4 w-4 animate-spin" /> Checking…</> : 'Refresh status'}
          </Button>
        </div>

        {GBP_API_PENDING && data?.connected && (
          <p className="mt-2 flex items-center gap-1.5 text-xs text-amber-600">
            <AlertTriangle className="h-3.5 w-3.5" />
            "Sync Locations" will fail until GBP API quota is approved — this is expected.
          </p>
        )}

        {/* Status Panel */}
        <div className="mt-6 rounded-2xl border border-slatey-200 bg-white/70 p-4">
          {isLoading ? (
            <div className="flex items-center gap-3 text-sm text-slatey-500">
              <Loader2 className="h-4 w-4 animate-spin" /> Loading connection status…
            </div>
          ) : data?.connected ? (
            <div className="space-y-4 text-sm">
              <div className="flex items-center gap-2 font-semibold text-emerald-600">
                <CheckCircle2 className="h-4 w-4" /> Connected
              </div>
              <div className="grid gap-2 text-slatey-600">
                <div className="flex items-center gap-2">
                  <span className="w-36 text-xs font-medium text-slatey-400">Account</span>
                  <span className="font-medium">{data.accountEmail}</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="w-36 text-xs font-medium text-slatey-400">Active location</span>
                  <span className={data.activeLocation ? 'font-medium' : 'text-slatey-400 italic'}>
                    {data.activeLocation || 'Not set — sync locations to configure'}
                  </span>
                </div>
              </div>

              {/* Location list */}
              {(data.locations || []).length > 0 ? (
                <div>
                  <p className="text-xs font-medium uppercase tracking-[0.15em] text-slatey-400 mb-2">Available locations</p>
                  <div className="grid gap-2">
                    {data.locations.map((location) => (
                      <div
                        key={location.id}
                        className="flex items-center justify-between rounded-xl border border-slatey-200 bg-slatey-50 px-4 py-3"
                      >
                        <div className="flex items-center gap-2 text-sm text-slatey-700">
                          <MapPin className="h-4 w-4 text-slatey-400" />
                          {location.name}
                          {data.activeLocation === location.name && (
                            <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[11px] font-medium text-emerald-700">Active</span>
                          )}
                        </div>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleSetActive(location)}
                          disabled={settingLocationId === location.id || data.activeLocation === location.name}
                        >
                          {settingLocationId === location.id ? 'Setting…' : 'Set active'}
                        </Button>
                      </div>
                    ))}
                  </div>
                </div>
              ) : (
                <div className="rounded-xl border border-slatey-200 bg-slatey-50 px-4 py-3 text-xs text-slatey-500">
                  No locations loaded yet. Click <strong>Sync Locations</strong> once GBP API quota is approved.
                </div>
              )}
            </div>
          ) : outletId ? (
            <div className="flex items-center gap-2 text-sm text-slatey-500">
              <Store className="h-4 w-4" /> No Google connection detected yet. Click <strong>Connect Google Business</strong> to begin.
            </div>
          ) : (
            <div className="flex items-center gap-2 text-sm text-rose-500">
              <Store className="h-4 w-4" /> No outlet is linked to this account yet.
            </div>
          )}
        </div>
      </motion.div>

      {/* How it works */}
      <motion.div
        initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4, delay: 0.18 }}
        className="rounded-2xl border border-slatey-100 bg-white/60 p-6"
      >
        <p className="flex items-center gap-2 text-sm font-semibold text-slatey-700">
          <Info className="h-4 w-4 text-brand-500" /> How the integration works
        </p>
        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          {[
            { icon: <Link2 className="h-4 w-4" />, title: 'OAuth only on frontend', body: 'The frontend redirects to Google and returns to your callback URL. No tokens are ever exposed in the browser.' },
            { icon: <ShieldCheck className="h-4 w-4" />, title: 'Encrypted token storage', body: 'Refresh tokens are AES-encrypted before being written to Firestore. The frontend never reads tokens.' },
            { icon: <RefreshCw className="h-4 w-4" />, title: 'Location sync (requires GBP API)', body: 'Syncing locations calls the Account Management and Business Information APIs — both require approved quota.' },
            { icon: <Sparkles className="h-4 w-4" />, title: 'Review automation (requires GBP API)', body: 'Reviews are fetched via the Reviews API on a schedule, then AI-replied or escalated via WhatsApp.' },
          ].map((item) => (
            <div key={item.title} className="flex items-start gap-3 rounded-xl border border-slatey-100 bg-slatey-50/60 p-4">
              <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-brand-50 text-brand-600">
                {item.icon}
              </div>
              <div>
                <p className="text-xs font-semibold text-slatey-700">{item.title}</p>
                <p className="mt-1 text-xs leading-relaxed text-slatey-500">{item.body}</p>
              </div>
            </div>
          ))}
        </div>
      </motion.div>

    </div>
  )
}
