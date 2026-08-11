import { useEffect, useMemo } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { motion } from 'framer-motion'
import {
  CheckCircle2, Link2, Loader2, Store, RefreshCw,
  MapPin, Clock, ShieldCheck, AlertTriangle, Sparkles, Phone
} from 'lucide-react'
import { Link } from 'react-router-dom'
import { startGoogleOAuth, getGoogleConnectionStatus } from '../../services/googleAuthService'
import Button from '../../components/ui/button'
import { Card } from '../../components/ui/card'
import { useAuth } from '../../contexts/AuthContext'

const GBP_API_PENDING = true // flip once quota is approved

const PIPELINE_STEPS = [
  {
    icon: <Link2 className="h-4 w-4" />,
    label: 'OAuth Connected',
    description: 'Refresh token stored encrypted',
    done: true,
  },
  {
    icon: <MapPin className="h-4 w-4" />,
    label: 'Location Synced',
    description: 'Active location set for review fetch',
    done: false,
    pending: true,
  },
  {
    icon: <Sparkles className="h-4 w-4" />,
    label: 'Review Automation',
    description: 'AI replies & WhatsApp escalations live',
    done: false,
    pending: true,
  },
  {
    icon: <Phone className="h-4 w-4" />,
    label: 'WhatsApp Alerts',
    description: 'Negative reviews sent to manager',
    done: false,
    pending: true,
  },
]

export default function OutletGooglePage() {
  const { profile } = useAuth()
  const queryClient = useQueryClient()
  const outletId = profile?.outletId || ''
  const enabled = useMemo(() => Boolean(outletId && outletId.length > 0), [outletId])

  const { data, isLoading } = useQuery({
    queryKey: ['google-connection', outletId],
    queryFn: () => getGoogleConnectionStatus(outletId),
    enabled,
    staleTime: 5 * 60 * 1000,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
  })

  useEffect(() => {
    const handleMessage = (event) => {
      if (event.data?.type === 'gmb-connected') {
        queryClient.invalidateQueries({ queryKey: ['google-connection', outletId] })
      }
    }
    window.addEventListener('message', handleMessage)
    return () => window.removeEventListener('message', handleMessage)
  }, [outletId, queryClient])

  const isConnected = Boolean(data?.connected)

  // Update pipeline steps based on real connection status
  const steps = PIPELINE_STEPS.map((s, i) => ({
    ...s,
    done: i === 0 ? isConnected : s.done,
  }))

  return (
    <motion.div
      className="space-y-6"
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35 }}
    >
      <div>
        <h2 className="text-xl font-semibold">Google Connection</h2>
        <p className="text-sm text-slatey-500">Manage your Google Business Profile OAuth link and location.</p>
      </div>

      {/* GBP API Pending Banner */}
      {GBP_API_PENDING && (
        <div className="flex items-start gap-3 rounded-2xl border border-amber-200 bg-amber-50/80 px-5 py-4">
          <Clock className="mt-0.5 h-5 w-5 shrink-0 text-amber-500" />
          <div>
            <p className="text-sm font-semibold text-amber-800">GBP API quota pending approval</p>
            <p className="mt-1 text-xs leading-relaxed text-amber-700">
              OAuth is connected. Location sync and review automation will activate once Google approves your API access request (7–10 business days).
            </p>
          </div>
        </div>
      )}

      {/* Connection Status Card */}
      <Card className="p-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-xs uppercase tracking-[0.18em] text-slatey-400">OAuth Status</p>
            {isLoading ? (
              <p className="mt-2 flex items-center gap-2 text-sm text-slatey-500">
                <Loader2 className="h-4 w-4 animate-spin" /> Checking connection…
              </p>
            ) : isConnected ? (
              <div className="mt-2 space-y-1">
                <p className="flex items-center gap-2 text-lg font-semibold text-emerald-600">
                  <CheckCircle2 className="h-5 w-5" /> Connected
                </p>
                <p className="text-sm text-slatey-500">{data.accountEmail}</p>
                {data.activeLocation ? (
                  <div className="flex items-center gap-1.5 text-xs text-slatey-500">
                    <MapPin className="h-3.5 w-3.5 text-brand-400" />
                    Active: <span className="font-medium text-slatey-700">{data.activeLocation}</span>
                  </div>
                ) : (
                  <p className="text-xs text-amber-600">⚠ No active location set — sync required</p>
                )}
              </div>
            ) : data?.needsReconnection || data?.error === 'invalid_grant' ? (
              <div className="mt-2 space-y-1">
                <p className="flex items-center gap-2 text-lg font-semibold text-rose-600">
                  <AlertTriangle className="h-5 w-5" /> Reconnection Required
                </p>
                <p className="text-xs text-rose-600 font-medium">
                  Google account authorization was revoked or expired (invalid_grant).
                </p>
                <p className="text-xs text-slatey-500">
                  Please click <strong>Reconnect</strong> below to grant access and resume review syncing.
                </p>
              </div>
            ) : outletId ? (
              <p className="mt-2 flex items-center gap-2 text-sm text-slatey-500">
                <Store className="h-4 w-4" /> Not connected yet
              </p>
            ) : (
              <p className="mt-2 flex items-center gap-2 text-sm text-rose-500">
                <Store className="h-4 w-4" /> No outlet linked to this account
              </p>
            )}
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <Button
              variant="outline"
              onClick={() => startGoogleOAuth(outletId, profile?.id)}
              disabled={!outletId}
            >
              <Link2 className="h-4 w-4" />
              {isConnected ? 'Reconnect' : 'Connect Google Business'}
            </Button>
            <Button asChild variant="ghost">
              <Link to="/connect-google">
                <RefreshCw className="h-4 w-4" />
                Manage connection
              </Link>
            </Button>
          </div>
        </div>

        {isConnected && (
          <div className="mt-4 flex items-center gap-2 rounded-xl border border-emerald-100 bg-emerald-50/70 px-4 py-2.5 text-xs text-emerald-700">
            <ShieldCheck className="h-3.5 w-3.5 shrink-0" />
            Refresh token is AES-encrypted and stored securely on the backend. The frontend never reads token values.
          </div>
        )}
      </Card>

      {/* Integration Pipeline */}
      <Card className="p-6">
        <p className="text-sm font-semibold text-slatey-800">Integration pipeline</p>
        <p className="mt-1 text-xs text-slatey-400">Steps required for full review automation to be active.</p>
        <div className="mt-5 grid gap-3 sm:grid-cols-2">
          {steps.map((step, i) => (
            <div
              key={i}
              className={`flex items-start gap-3 rounded-xl border p-4 ${
                step.done
                  ? 'border-emerald-200 bg-emerald-50/70'
                  : step.pending
                  ? 'border-amber-100 bg-amber-50/50'
                  : 'border-slatey-100 bg-slatey-50/50'
              }`}
            >
              <div className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${
                step.done ? 'bg-emerald-100 text-emerald-600' : 'bg-amber-100 text-amber-500'
              }`}>
                {step.done ? <CheckCircle2 className="h-4 w-4" /> : step.icon}
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <p className="text-sm font-medium text-slatey-800">{step.label}</p>
                  {step.done && (
                    <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-semibold text-emerald-700">Done</span>
                  )}
                  {!step.done && step.pending && (
                    <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-semibold text-amber-600">Pending API</span>
                  )}
                </div>
                <p className="mt-0.5 text-xs text-slatey-400">{step.description}</p>
              </div>
            </div>
          ))}
        </div>
      </Card>

      {/* What each API does */}
      <Card className="p-6">
        <p className="text-sm font-semibold text-slatey-800">APIs used by this integration</p>
        <p className="mt-1 text-xs text-slatey-400">All three require Google Business Profile API access approval.</p>
        <div className="mt-4 divide-y divide-slatey-100">
          {[
            {
              api: 'mybusinessaccountmanagement.googleapis.com',
              use: 'List your GBP accounts and validate ownership',
              trigger: 'Sync Locations',
            },
            {
              api: 'mybusinessbusinessinformation.googleapis.com',
              use: 'Fetch all locations under each account',
              trigger: 'Sync Locations',
            },
            {
              api: 'mybusinessreviews.googleapis.com',
              use: 'Fetch reviews and post AI-generated replies',
              trigger: 'Scheduled cron (every hour)',
            },
          ].map((row) => (
            <div key={row.api} className="flex flex-col gap-0.5 py-3">
              <p className="font-mono text-xs font-medium text-brand-700">{row.api}</p>
              <p className="text-xs text-slatey-500">{row.use}</p>
              <p className="text-[11px] text-slatey-400">Triggered by: <span className="font-medium">{row.trigger}</span></p>
            </div>
          ))}
        </div>
      </Card>
    </motion.div>
  )
}
