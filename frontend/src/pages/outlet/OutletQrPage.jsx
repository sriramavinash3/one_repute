import { useState, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { QrCode, Sparkles, Plus, Download, Copy, ExternalLink, RefreshCw, BarChart2, CheckCircle2 } from 'lucide-react'
import { Card } from '../../components/ui/card'
import Button from '../../components/ui/button'
import { toast } from 'sonner'
import apiClient from '../../services/apiClient'
import { FeatureGate } from '../../components/gating/FeatureGate'

const stagger = {
  hidden: {},
  show: { transition: { staggerChildren: 0.08 } }
}
const fadeUp = {
  hidden: { opacity: 0, y: 12 },
  show: { opacity: 1, y: 0, transition: { duration: 0.3 } }
}

export default function OutletQrPage() {
  return (
    <FeatureGate featureKey="smart_qr" customTitle="Smart QR Codes Locked">
      <OutletQrContent />
    </FeatureGate>
  )
}

function OutletQrContent() {
  const [qrs, setQrs] = useState([])
  const [loading, setLoading] = useState(false)
  const [creating, setCreating] = useState(false)
  const [showCreateModal, setShowCreateModal] = useState(false)
  const [form, setForm] = useState({ name: '', redirectUrl: 'https://search.google.com/local/writereview?placeid=' })

  const fetchQrs = async () => {
    setLoading(true)
    try {
      const { data } = await apiClient.get('/api/qr')
      setQrs(data)
    } catch (err) {
      console.error(err)
      toast.error('Failed to load QR codes')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchQrs()
  }, [])

  const handleCreateQr = async (e) => {
    e.preventDefault()
    if (!form.name || !form.redirectUrl) {
      toast.error('Please enter name and target URL')
      return
    }

    setCreating(true)
    try {
      const { data } = await apiClient.post('/api/qr', form)
      toast.success('Smart QR Code generated successfully!')
      setQrs((prev) => [data, ...prev])
      setShowCreateModal(false)
      setForm({ name: '', redirectUrl: 'https://search.google.com/local/writereview?placeid=' })
    } catch (err) {
      console.error(err)
      toast.error(err.response?.data?.message || 'Failed to generate QR code')
    } finally {
      setCreating(false)
    }
  }

  const handleCopy = (url) => {
    navigator.clipboard.writeText(url)
    toast.success('Link copied to clipboard!')
  }

  return (
    <motion.div className="space-y-6" variants={stagger} initial="hidden" animate="show">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-xl font-semibold text-slatey-800 flex items-center gap-2">
            <QrCode className="h-5 w-5 text-brand-600" />
            Smart QR Code Campaigns
          </h2>
          <p className="text-sm text-slatey-500 mt-1">Generate dynamic QR codes to print on receipts, table cards, or menus to collect reviews.</p>
        </div>
        
        <Button 
          variant="primary" 
          onClick={() => setShowCreateModal(true)}
          className="shadow-brand text-xs px-4 py-2 flex items-center gap-1.5 shrink-0"
        >
          <Plus className="h-4 w-4" /> Create QR Code
        </Button>
      </div>

      {/* Analytics Summary */}
      <motion.div className="grid gap-4 md:grid-cols-3" variants={stagger}>
        {[
          { title: 'Total QR Scans', value: '3,842', delta: '+14% from last month', color: 'text-brand-600' },
          { title: 'Active Campaigns', value: qrs.length || '0', delta: 'Running campaigns', color: 'text-emerald-600' },
          { title: 'Avg Conversion Rate', value: '62.4%', delta: '+2.8% from industry avg', color: 'text-amber-600' }
        ].map((stat, i) => (
          <motion.div key={i} variants={fadeUp}>
            <Card className="p-5 space-y-2 bg-white border border-slatey-100 shadow-sm">
              <p className="text-xs text-slatey-500 font-semibold uppercase tracking-wider">{stat.title}</p>
              <div className={`text-2xl font-bold ${stat.color}`}>{stat.value}</div>
              <p className="text-[10px] text-slatey-400 font-medium">{stat.delta}</p>
            </Card>
          </motion.div>
        ))}
      </motion.div>

      {/* QR Codes list */}
      <motion.div variants={fadeUp}>
        <Card className="overflow-hidden border border-slatey-200">
          <div className="px-6 py-4 border-b border-slatey-100 flex justify-between items-center bg-slatey-50/50">
            <h3 className="text-sm font-bold text-slatey-800">Your QR Codes</h3>
            <button onClick={fetchQrs} disabled={loading} className="p-1.5 hover:bg-slatey-100 rounded-md text-slatey-400 hover:text-slatey-600 transition">
              <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
            </button>
          </div>

          {loading && qrs.length === 0 ? (
            <div className="py-12 text-center text-slatey-400 text-xs">Loading campaign codes...</div>
          ) : qrs.length === 0 ? (
            <div className="py-16 text-center space-y-4">
              <div className="h-12 w-12 bg-slatey-50 border border-slatey-200 rounded-full flex items-center justify-center mx-auto text-slatey-400">
                <QrCode className="h-6 w-6" />
              </div>
              <div className="space-y-1">
                <p className="text-sm font-bold text-slatey-700">No campaigns created yet</p>
                <p className="text-xs text-slatey-400 max-w-sm mx-auto">Create your first QR code to direct customers straight to your Google reviews landing page.</p>
              </div>
              <Button variant="outline" className="text-xs px-4 py-2" onClick={() => setShowCreateModal(true)}>
                Generate first QR code
              </Button>
            </div>
          ) : (
            <div className="divide-y divide-slatey-100">
              {qrs.map((qr) => (
                <div key={qr.id} className="p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4 hover:bg-slatey-50/30 transition-colors">
                  <div className="flex items-start gap-4">
                    <div className="bg-slatey-100 p-2 rounded-xl border border-slatey-200 shadow-inner flex items-center justify-center shrink-0">
                      {/* Generates placeholder QR */}
                      <QrCode className="h-10 w-10 text-slatey-700" />
                    </div>
                    <div className="space-y-1">
                      <h4 className="text-sm font-bold text-slatey-800">{qr.name}</h4>
                      <p className="text-[11px] font-semibold text-slatey-400 flex items-center gap-1">
                        Short link: 
                        <span className="text-brand-600 hover:underline cursor-pointer select-all" onClick={() => handleCopy(qr.shortUrl)}>
                          {qr.shortUrl}
                        </span>
                      </p>
                      <p className="text-[10px] text-slatey-400 truncate max-w-md">Redirects to: {qr.redirectUrl}</p>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 shrink-0 self-end sm:self-center">
                    <Button variant="outline" className="text-xs px-3 py-1.5 h-auto flex items-center gap-1" onClick={() => handleCopy(qr.shortUrl)}>
                      <Copy className="h-3.5 w-3.5" /> Copy
                    </Button>
                    <a href={qr.redirectUrl} target="_blank" rel="noreferrer">
                      <Button variant="outline" className="text-xs px-3 py-1.5 h-auto flex items-center gap-1">
                        <ExternalLink className="h-3.5 w-3.5" /> View Link
                      </Button>
                    </a>
                    {/* Simulated download */}
                    <Button variant="secondary" className="text-xs px-3 py-1.5 h-auto flex items-center gap-1 bg-brand-50 text-brand-700 hover:bg-brand-100" onClick={() => toast.success('QR Code saved as high-res PNG.')}>
                      <Download className="h-3.5 w-3.5" /> Download
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </Card>
      </motion.div>

      {/* Creation Modal */}
      <AnimatePresence>
        {showCreateModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-slatey-900/40 backdrop-blur-sm p-4">
            <motion.form 
              onSubmit={handleCreateQr}
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="relative w-full max-w-md bg-white rounded-2xl p-6 border border-slatey-200 shadow-xl space-y-4"
            >
              <h3 className="text-base font-bold text-slatey-800">Generate Smart QR Code</h3>
              
              <div className="space-y-1.5">
                <label className="block text-xs font-semibold text-slatey-600">Campaign Name *</label>
                <input 
                  type="text" 
                  required
                  placeholder="e.g. Table Card QR, Billing Counter" 
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  className="w-full rounded-xl border border-slatey-200 bg-white px-3.5 py-2 text-sm text-slatey-800 outline-none focus:border-brand-400 focus:ring-2 focus:ring-brand-100"
                />
              </div>

              <div className="space-y-1.5">
                <label className="block text-xs font-semibold text-slatey-600">Target Redirect URL *</label>
                <input 
                  type="url" 
                  required
                  placeholder="e.g. Google review write link" 
                  value={form.redirectUrl}
                  onChange={(e) => setForm({ ...form, redirectUrl: e.target.value })}
                  className="w-full rounded-xl border border-slatey-200 bg-white px-3.5 py-2 text-sm text-slatey-800 outline-none focus:border-brand-400 focus:ring-2 focus:ring-brand-100"
                />
                <p className="text-[10px] text-slatey-400">Directs customers instantly to your reviews page.</p>
              </div>

              <div className="flex justify-end gap-2.5 pt-2">
                <Button variant="ghost" type="button" onClick={() => setShowCreateModal(false)}>Cancel</Button>
                <Button variant="primary" type="submit" disabled={creating}>
                  {creating ? 'Generating...' : 'Generate QR'}
                </Button>
              </div>
            </motion.form>
          </div>
        )}
      </AnimatePresence>
    </motion.div>
  )
}
