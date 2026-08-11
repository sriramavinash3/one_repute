import { useEffect, useMemo, useState } from 'react'
import { motion } from 'framer-motion'
import { Save, Building2, Phone, CheckCircle2, Loader2, CreditCard, Lock, ChevronDown, ChevronUp, AlertCircle, Trash2, ArrowRight, ShieldAlert, Sparkles, Check, Download } from 'lucide-react'
import { Card } from '../../components/ui/card'
import Button from '../../components/ui/button'
import { toast } from 'sonner'
import { useAuth } from '../../contexts/AuthContext'
import { updateOutletSettings } from '../../services/outletService'
import { doc, getDoc } from 'firebase/firestore'
import { db } from '../../firebase/firebase'
import { createSubscription, verifyPayment, loadRazorpayScript } from '../../services/paymentService'
import {
  fetchEscalationSettings,
  saveEscalationSettings,
  deleteEscalationLevel
} from '../../services/escalationService'
import { useSubscription } from '../../contexts/SubscriptionContext'
import { UpgradeModal } from '../../components/gating/FeatureGate'

function SectionHeader({ icon, title, description }) {
  return (
    <div className="flex items-start gap-3 pb-4 border-b border-slatey-100">
      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-brand-50 text-brand-600">
        {icon}
      </div>
      <div>
        <p className="text-sm font-semibold text-slatey-800">{title}</p>
        <p className="text-xs text-slatey-400 mt-0.5">{description}</p>
      </div>
    </div>
  )
}

function FormField({ label, id, type = 'text', value, onChange, placeholder, hint, disabled }) {
  return (
    <div className="space-y-1.5">
      <label htmlFor={id} className="block text-xs font-medium text-slatey-600">{label}</label>
      <input
        id={id}
        type={type}
        value={value}
        onChange={onChange}
        placeholder={placeholder}
        disabled={disabled}
        className="w-full rounded-xl border border-slatey-200 bg-white/80 px-3.5 py-2.5 text-sm text-slatey-800 outline-none transition focus:border-brand-400 focus:ring-2 focus:ring-brand-100 disabled:opacity-50 disabled:bg-slatey-50"
      />
      {hint && <p className="text-[11px] text-slatey-400">{hint}</p>}
    </div>
  )
}

export default function OutletSettingsPage() {
  const { outlet, profile, user } = useAuth()
  const [activeTab, setActiveTab] = useState('general')
  const [customer, setCustomer] = useState(null)
  
  // General Tab Business Info State
  const [business, setBusiness] = useState({
    name: '',
    type: '',
    address: '',
    phone: '',
    email: ''
  })

  const [whatsapp, setWhatsapp] = useState({
    number: '',
    escalationThreshold: '3'
  })

  const [baseline, setBaseline] = useState({
    business: {
      name: '',
      type: '',
      address: '',
      phone: '',
      email: ''
    },
    whatsapp: {
      number: '',
      escalationThreshold: '3'
    }
  })

  const [saved, setSaved] = useState(false)
  const [saving, setSaving] = useState(false)

  // Escalation Tab State
  const [escalationMasterEnabled, setEscalationMasterEnabled] = useState(false)
  const [creditsExhausted, setCreditsExhausted] = useState(false)
  const [userPlan, setUserPlan] = useState('plan_starter')
  const [maxAllowedLevel, setMaxAllowedLevel] = useState(0)
  const [loadingEscalation, setLoadingEscalation] = useState(false)
  const [expandedLevels, setExpandedLevels] = useState({ 1: true, 2: false, 3: false })
  const [levelForms, setLevelForms] = useState({
    1: { name: '', designation: '', countryCode: '+91', whatsappNumber: '', email: '', escalationMinutes: 15, enabled: true },
    2: { name: '', designation: '', countryCode: '+91', whatsappNumber: '', email: '', escalationMinutes: 60, enabled: true },
    3: { name: '', designation: '', countryCode: '+91', whatsappNumber: '', email: '', escalationMinutes: 180, enabled: true }
  })

  useEffect(() => {
    if (!outlet) return

    setBusiness({
      name: outlet.name || '',
      type: outlet.businessType || outlet.planType || '',
      address: outlet.address || '',
      phone: outlet.whatsappNumber || '',
      email: outlet.email || ''
    })

    const loadedWhatsapp = {
      number: outlet.whatsappNumber || '',
      escalationThreshold: String(outlet.escalationThreshold || 3)
    }

    setWhatsapp(loadedWhatsapp)
    setBaseline({
      business: {
        name: outlet.name || '',
        type: outlet.businessType || outlet.planType || '',
        address: outlet.address || '',
        phone: outlet.whatsappNumber || '',
        email: outlet.email || ''
      },
      whatsapp: loadedWhatsapp
    })

    if (profile?.customerId) {
      getDoc(doc(db, 'customers', profile.customerId)).then(snap => {
        if (snap.exists()) setCustomer(snap.data())
      })
      loadEscalationSettings()
    }
  }, [outlet, profile])

  const loadEscalationSettings = async () => {
    try {
      setLoadingEscalation(true)
      const data = await fetchEscalationSettings()
      setEscalationMasterEnabled(data.masterEnabled)
      setCreditsExhausted(data.creditsExhausted)
      setUserPlan(data.plan)
      setMaxAllowedLevel(data.maxAllowedLevel)

      const forms = {
        1: { name: '', designation: '', countryCode: '+91', whatsappNumber: '', email: '', escalationMinutes: 15, enabled: true },
        2: { name: '', designation: '', countryCode: '+91', whatsappNumber: '', email: '', escalationMinutes: 60, enabled: true },
        3: { name: '', designation: '', countryCode: '+91', whatsappNumber: '', email: '', escalationMinutes: 180, enabled: true }
      }

      data.levels.forEach((lvl) => {
        if (lvl.level >= 1 && lvl.level <= 3) {
          forms[lvl.level] = {
            name: lvl.name || '',
            designation: lvl.designation || '',
            countryCode: lvl.countryCode || '+91',
            whatsappNumber: lvl.whatsappNumber || '',
            email: lvl.email || '',
            escalationMinutes: lvl.escalationMinutes || (lvl.level === 1 ? 15 : lvl.level === 2 ? 60 : 180),
            enabled: lvl.enabled !== false
          }
        }
      })

      setLevelForms(forms)
    } catch (err) {
      toast.error('Failed to load escalation settings.')
    } finally {
      setLoadingEscalation(false)
    }
  }

  const hasChanges = useMemo(() => {
    return (
      business.name !== baseline.business.name ||
      business.type !== baseline.business.type ||
      business.address !== baseline.business.address ||
      business.phone !== baseline.business.phone ||
      business.email !== baseline.business.email ||
      whatsapp.number !== baseline.whatsapp.number ||
      whatsapp.escalationThreshold !== baseline.whatsapp.escalationThreshold
    )
  }, [business, whatsapp, baseline])

  const handleSave = async () => {
    if (!outlet?.id) return

    try {
      setSaving(true)
      await updateOutletSettings(outlet.id, {
        name: business.name,
        businessType: business.type,
        address: business.address,
        whatsappNumber: whatsapp.number,
        escalationThreshold: Number(whatsapp.escalationThreshold)
      })
      setBaseline({
        business: { ...business },
        whatsapp: { ...whatsapp }
      })
      setSaved(true)
      toast.success('Settings saved successfully.')
      setTimeout(() => setSaved(false), 2500)
    } catch (error) {
      toast.error('Failed to save settings. Please try again.')
    } finally {
      setSaving(false)
    }
  }

  const handleUpgrade = async () => {
    setSaving(true)
    try {
      const isLoaded = await loadRazorpayScript()
      if (!isLoaded) throw new Error('Razorpay failed to load')
      const subscription = await createSubscription(profile.customerId, 'plan_pro')
      const options = {
        key: import.meta.env.VITE_RAZORPAY_KEY_ID || 'rzp_test_dummy',
        subscription_id: subscription.id,
        name: 'One Repute',
        description: 'Upgrade Subscription',
        handler: async function (response) {
          try {
            await verifyPayment(response.razorpay_payment_id, response.razorpay_signature, response.razorpay_subscription_id, profile.customerId)
            toast.success('Subscription activated successfully!')
            getDoc(doc(db, 'customers', profile.customerId)).then(snap => {
              if (snap.exists()) setCustomer(snap.data())
            })
          } catch (err) {
            toast.error('Payment verification failed.')
          }
        },
        prefill: {
          name: business.name,
          email: user?.email || '',
        },
        theme: {
          color: '#4f46e5'
        }
      }
      const rzp = new window.Razorpay(options)
      rzp.on('payment.failed', function (response) {
        toast.error(response.error.description)
        setSaving(false)
      })
      rzp.open()
    } catch (error) {
      toast.error(error.message || 'Failed to initiate payment')
    } finally {
      setSaving(false)
    }
  }

  // Escalation Handlers
  const handleToggleMaster = async (newVal) => {
    if (newVal && creditsExhausted) {
      toast.error('Cannot enable escalation: AI Review Credits are exhausted.')
      return
    }
    try {
      setSaving(true)
      await saveEscalationSettings({ masterEnabled: newVal })
      setEscalationMasterEnabled(newVal)
      toast.success(`WhatsApp escalation master toggle ${newVal ? 'enabled' : 'disabled'}.`)
    } catch (err) {
      toast.error('Failed to update master toggle.')
    } finally {
      setSaving(false)
    }
  }

  const handleSaveLevel = async (lvl) => {
    const form = levelForms[lvl]
    
    if (!form.name || form.name.trim().length === 0) {
      toast.error(`Name is required for Level ${lvl}.`)
      return
    }
    if (!form.whatsappNumber || !form.countryCode) {
      toast.error(`WhatsApp number is required for Level ${lvl}.`)
      return
    }
    
    const formattedPhone = `${form.countryCode.startsWith('+') ? '' : '+'}${form.countryCode}${form.whatsappNumber}`.replace(/\s+/g, '')
    if (!/^\+[1-9]\d{1,14}$/.test(formattedPhone)) {
      toast.error(`Invalid WhatsApp number for Level ${lvl}. Must follow E.164 format (e.g. +919876543210).`)
      return
    }
    
    if (form.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email)) {
      toast.error(`Invalid email format for Level ${lvl}.`)
      return
    }

    const minutes = Number(form.escalationMinutes)
    if (Number.isNaN(minutes) || minutes < 1 || minutes > 10080) {
      toast.error(`Escalation time must be between 1 and 10,080 minutes for Level ${lvl}.`)
      return
    }

    // Order sequences checks
    if (lvl === 1) {
      const lvl2Min = levelForms[2].name ? levelForms[2].escalationMinutes : Infinity
      const lvl3Min = levelForms[3].name ? levelForms[3].escalationMinutes : Infinity
      if (minutes >= lvl2Min || minutes >= lvl3Min) {
        toast.error('Level 1 escalation time must be less than Level 2 and Level 3 times.')
        return
      }
    } else if (lvl === 2) {
      const lvl1Min = levelForms[1].name ? levelForms[1].escalationMinutes : 0
      const lvl3Min = levelForms[3].name ? levelForms[3].escalationMinutes : Infinity
      if (minutes <= lvl1Min || minutes >= lvl3Min) {
        toast.error('Level 2 escalation time must be greater than Level 1 and less than Level 3 times.')
        return
      }
    } else if (lvl === 3) {
      const lvl1Min = levelForms[1].name ? levelForms[1].escalationMinutes : 0
      const lvl2Min = levelForms[2].name ? levelForms[2].escalationMinutes : 0
      if (minutes <= lvl1Min || minutes <= lvl2Min) {
        toast.error('Level 3 escalation time must be greater than Level 1 and Level 2 times.')
        return
      }
    }

    // Phone uniqueness check across levels
    for (let o = 1; o <= 3; o++) {
      if (o !== lvl && levelForms[o].name) {
        const otherPhone = `${levelForms[o].countryCode}${levelForms[o].whatsappNumber}`.replace(/\s+/g, '')
        const targetPhone = `${form.countryCode}${form.whatsappNumber}`.replace(/\s+/g, '')
        if (otherPhone === targetPhone) {
          toast.error(`WhatsApp number for Level ${lvl} is already used in Level ${o}.`)
          return
        }
      }
    }

    try {
      setSaving(true)
      await saveEscalationSettings({
        level: lvl,
        name: form.name,
        designation: form.designation,
        countryCode: form.countryCode,
        whatsappNumber: form.whatsappNumber,
        email: form.email || null,
        escalationMinutes: minutes,
        enabled: form.enabled
      })
      toast.success(`Level ${lvl} configuration saved successfully!`)
      loadEscalationSettings()
    } catch (err) {
      toast.error(err.response?.data?.error || `Failed to save Level ${lvl} settings.`)
    } finally {
      setSaving(false)
    }
  }

  const handleDeleteLevel = async (lvl) => {
    if (!window.confirm(`Are you sure you want to clear Level ${lvl} configuration?`)) return
    try {
      setSaving(true)
      await deleteEscalationLevel(lvl)
      toast.success(`Level ${lvl} configuration cleared.`)
      loadEscalationSettings()
    } catch (err) {
      toast.error(`Failed to delete Level ${lvl} settings.`)
    } finally {
      setSaving(false)
    }
  }

  const toggleExpandLevel = (lvl) => {
    setExpandedLevels(prev => ({ ...prev, [lvl]: !prev[lvl] }))
  }

  const stagger = { hidden: {}, show: { transition: { staggerChildren: 0.08 } } }
  const fadeUp = { hidden: { opacity: 0, y: 10 }, show: { opacity: 1, y: 0, transition: { duration: 0.3 } } }

  return (
    <div className="space-y-6 max-w-4xl">
      {/* Page Header */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h2 className="text-xl font-semibold text-slatey-800">Settings</h2>
          <p className="text-sm text-slatey-500">Manage business information and escalations.</p>
        </div>
        
        {/* Navigation Tabs */}
        <div className="flex max-w-full overflow-x-auto whitespace-nowrap items-center gap-1.5 p-1 bg-slatey-100 rounded-xl border border-slatey-200">
          <button
            onClick={() => setActiveTab('general')}
            className={`px-4 py-2 text-xs font-semibold rounded-lg transition-all ${activeTab === 'general' ? 'bg-white text-brand-600 shadow-sm' : 'text-slatey-500 hover:text-slatey-800'}`}
          >
            General Settings
          </button>
          <button
            onClick={() => setActiveTab('escalation')}
            className={`px-4 py-2 text-xs font-semibold rounded-lg transition-all ${activeTab === 'escalation' ? 'bg-white text-brand-600 shadow-sm' : 'text-slatey-500 hover:text-slatey-800'}`}
          >
            Escalation Management
          </button>
          <button
            onClick={() => setActiveTab('billing')}
            className={`px-4 py-2 text-xs font-semibold rounded-lg transition-all ${activeTab === 'billing' ? 'bg-white text-brand-600 shadow-sm' : 'text-slatey-500 hover:text-slatey-800'}`}
          >
            Billing & Usage
          </button>
        </div>
      </div>

      {activeTab === 'general' && (
        <motion.div className="space-y-6 max-w-3xl" variants={stagger} initial="hidden" animate="show">
          {/* Business Info */}
          <motion.div variants={fadeUp}>
            <Card className="p-6 space-y-5">
              <SectionHeader icon={<Building2 className="h-4 w-4" />} title="Business Information" description="Basic details about your outlet." />
              <div className="grid gap-4 md:grid-cols-2">
                <FormField
                  label="Business name" id="biz-name"
                  value={business.name} onChange={(e) => setBusiness({ ...business, name: e.target.value })}
                  placeholder="Urban Bite"
                />
                <FormField
                  label="Business type" id="biz-type"
                  value={business.type} onChange={(e) => setBusiness({ ...business, type: e.target.value })}
                  placeholder="Restaurant"
                />
                <div className="md:col-span-2">
                  <FormField
                    label="Address" id="biz-address"
                    value={business.address} onChange={(e) => setBusiness({ ...business, address: e.target.value })}
                    placeholder="Street, City, State"
                  />
                </div>
                <FormField
                  label="Contact email" id="biz-email" type="email"
                  value={business.email} onChange={(e) => setBusiness({ ...business, email: e.target.value })}
                  placeholder="manager@yourbiz.com"
                />
              </div>
            </Card>
          </motion.div>

          {/* Legacy WhatsApp Threshold */}
          <motion.div variants={fadeUp}>
            <Card className="p-6 space-y-5">
              <SectionHeader icon={<Phone className="h-4 w-4" />} title="WhatsApp Notification Threshold" description="Trigger standard real-time alert notifications." />
              <div className="grid gap-4 md:grid-cols-2">
                <FormField
                  label="WhatsApp number" id="wa-number" type="tel"
                  value={whatsapp.number} onChange={(e) => setWhatsapp({ ...whatsapp, number: e.target.value })}
                  placeholder="+91 98765 43210"
                  hint="Must be registered on WhatsApp Business API"
                />
                <div className="space-y-1.5">
                  <label htmlFor="escalation-threshold" className="block text-xs font-medium text-slatey-600">
                    Threshold (rating ≤)
                  </label>
                  <select
                    id="escalation-threshold"
                    value={whatsapp.escalationThreshold}
                    onChange={(e) => setWhatsapp({ ...whatsapp, escalationThreshold: e.target.value })}
                    className="w-full rounded-xl border border-slatey-200 bg-white/80 px-3.5 py-2.5 text-sm text-slatey-800 outline-none focus:border-brand-400 focus:ring-2 focus:ring-brand-100"
                  >
                    <option value="1">1 star only (critical)</option>
                    <option value="2">2 stars and below</option>
                    <option value="3">3 stars and below</option>
                  </select>
                  <p className="text-[11px] text-slatey-400">Reviews at or below this rating will trigger a quick WhatsApp alert</p>
                </div>
              </div>
            </Card>
          </motion.div>

          {/* Billing */}
          {customer && (
            <motion.div variants={fadeUp}>
              <Card className="p-6 space-y-5 border-brand-200">
                <SectionHeader icon={<CreditCard className="h-4 w-4" />} title="Billing & Subscription" description="Manage your current plan and payment methods." />
                <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 p-4 bg-slatey-50 rounded-xl border border-slatey-100">
                  <div>
                    <p className="text-sm font-semibold text-slatey-900">Current Plan: <span className="uppercase text-brand-600">{customer.plan?.replace('plan_', '') || 'Unknown'}</span></p>
                    <p className="text-xs text-slatey-500 mt-1">
                      Status: <span className="font-medium capitalize">{customer.subscriptionStatus || 'Active'}</span>
                      {customer.subscriptionStatus === 'trialing' && customer.trialEndsAt && ` • Trial ends ${customer.trialEndsAt.toDate().toLocaleDateString()}`}
                    </p>
                  </div>
                  <Button onClick={handleUpgrade} disabled={saving} variant={customer.subscriptionStatus === 'trialing' ? 'primary' : 'outline'}>
                    {customer.subscriptionStatus === 'trialing' ? 'Upgrade Now' : 'Manage Subscription'}
                  </Button>
                </div>
              </Card>
            </motion.div>
          )}

          {/* Save Button */}
          <motion.div variants={fadeUp} className="flex items-center gap-3 pb-4">
            <Button
              onClick={handleSave}
              disabled={!hasChanges || saving}
              className={`flex items-center gap-2 ${!hasChanges ? 'border border-slatey-200 bg-slatey-200 text-slatey-500 shadow-none hover:bg-slatey-200' : ''}`}
            >
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : saved ? <CheckCircle2 className="h-4 w-4" /> : <Save className="h-4 w-4" />}
              {saving ? 'Saving...' : saved ? 'Saved' : 'Save changes'}
            </Button>
            <p className="text-xs text-slatey-400">Changes apply to the next cron run</p>
          </motion.div>
        </motion.div>
      )}

      {activeTab === 'escalation' && (
        <motion.div className="space-y-6" variants={stagger} initial="hidden" animate="show">
          {/* Credit Exhaustion Banner */}
          {creditsExhausted && (
            <motion.div variants={fadeUp} className="p-4 bg-red-50 border border-red-200 rounded-2xl flex items-start gap-3 text-red-800">
              <AlertCircle className="h-5 w-5 text-red-600 mt-0.5 shrink-0" />
              <div>
                <p className="text-sm font-semibold">WhatsApp Escalation Disabled</p>
                <p className="text-xs mt-0.5">AI Review Credits are exhausted. Upgrade your subscription plan or add credits to continue automated escalation workflows.</p>
              </div>
            </motion.div>
          )}

          {/* Master Control Card */}
          <motion.div variants={fadeUp}>
            <Card className="p-6 flex flex-col md:flex-row justify-between items-start md:items-center gap-4 bg-white shadow-sm">
              <div className="space-y-1">
                <h3 className="text-sm font-semibold text-slatey-800 flex items-center gap-2">
                  Multi-Level Escalation System
                  <span className={`text-[10px] px-2 py-0.5 rounded-full font-bold uppercase ${escalationMasterEnabled ? 'bg-green-50 text-green-700 border border-green-200' : 'bg-slatey-100 text-slatey-600'}`}>
                    {escalationMasterEnabled ? 'Active' : 'Inactive'}
                  </span>
                </h3>
                <p className="text-xs text-slatey-400">Enable or disable all background escalation timers and alert channels globally.</p>
              </div>
              <div className="flex items-center gap-2">
                {loadingEscalation ? (
                  <Loader2 className="h-5 w-5 animate-spin text-slatey-400" />
                ) : (
                  <label className="relative inline-flex items-center cursor-pointer">
                    <input
                      type="checkbox"
                      className="sr-only peer"
                      checked={escalationMasterEnabled}
                      disabled={creditsExhausted || saving}
                      onChange={(e) => handleToggleMaster(e.target.checked)}
                    />
                    <div className="w-11 h-6 bg-slatey-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slatey-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-brand-600"></div>
                  </label>
                )}
              </div>
            </Card>
          </motion.div>

          {/* Visual Timeline Flowchart */}
          <motion.div variants={fadeUp}>
            <Card className="p-5 space-y-4">
              <h4 className="text-xs font-semibold text-slatey-500 uppercase tracking-wider">Escalation Flowchart</h4>
              <div className="flex flex-col md:flex-row items-center justify-between gap-4 p-4 bg-slatey-50 rounded-2xl border border-slatey-100">
                
                {/* Stage 1 */}
                <div className="flex flex-col items-center text-center">
                  <div className="h-9 w-9 rounded-full bg-brand-100 text-brand-600 flex items-center justify-center font-bold text-xs border border-brand-200">
                    ★
                  </div>
                  <p className="text-xs font-bold text-slatey-800 mt-2">Unresolved Negative</p>
                  <p className="text-[10px] text-slatey-400 mt-0.5">Review ingested</p>
                </div>
                
                <ArrowRight className="h-4 w-4 text-slatey-300 hidden md:block" />

                {/* Stage L1 */}
                <div className="flex flex-col items-center text-center opacity-90">
                  <div className={`h-9 w-9 rounded-full flex items-center justify-center font-bold text-xs border ${maxAllowedLevel >= 1 ? 'bg-orange-100 text-orange-600 border-orange-200' : 'bg-slatey-100 text-slatey-400 border-slatey-200'}`}>
                    L1
                  </div>
                  <p className="text-xs font-bold text-slatey-800 mt-2">Level 1</p>
                  <p className="text-[10px] text-slatey-400 mt-0.5">
                    {maxAllowedLevel >= 1 && levelForms[1].name ? `${levelForms[1].escalationMinutes}m timer` : 'Not Configured'}
                  </p>
                </div>

                <ArrowRight className="h-4 w-4 text-slatey-300 hidden md:block" />

                {/* Stage L2 */}
                <div className="flex flex-col items-center text-center">
                  <div className={`h-9 w-9 rounded-full flex items-center justify-center font-bold text-xs border ${maxAllowedLevel >= 2 ? 'bg-orange-100 text-orange-600 border-orange-200' : 'bg-slatey-100 text-slatey-400 border-slatey-200'}`}>
                    {maxAllowedLevel < 2 ? <Lock className="h-3 w-3" /> : 'L2'}
                  </div>
                  <p className="text-xs font-bold text-slatey-800 mt-2">Level 2</p>
                  <p className="text-[10px] text-slatey-400 mt-0.5">
                    {maxAllowedLevel >= 2 && levelForms[2].name ? `${levelForms[2].escalationMinutes}m timer` : 'Locked / Inactive'}
                  </p>
                </div>

                <ArrowRight className="h-4 w-4 text-slatey-300 hidden md:block" />

                {/* Stage L3 */}
                <div className="flex flex-col items-center text-center">
                  <div className={`h-9 w-9 rounded-full flex items-center justify-center font-bold text-xs border ${maxAllowedLevel >= 3 ? 'bg-red-100 text-red-600 border-red-200' : 'bg-slatey-100 text-slatey-400 border-slatey-200'}`}>
                    {maxAllowedLevel < 3 ? <Lock className="h-3 w-3" /> : 'L3'}
                  </div>
                  <p className="text-xs font-bold text-slatey-800 mt-2">Level 3</p>
                  <p className="text-[10px] text-slatey-400 mt-0.5">
                    {maxAllowedLevel >= 3 && levelForms[3].name ? `${levelForms[3].escalationMinutes}m timer` : 'Locked / Inactive'}
                  </p>
                </div>
              </div>
            </Card>
          </motion.div>

          {/* Level Cards Panels */}
          <div className="space-y-4">
            {[1, 2, 3].map((lvl) => {
              const isLocked = lvl > maxAllowedLevel
              const form = levelForms[lvl]
              const isExpanded = expandedLevels[lvl]

              return (
                <motion.div key={lvl} variants={fadeUp}>
                  <Card className={`overflow-hidden border transition-all ${isLocked ? 'border-slatey-200 bg-slatey-50/50' : 'border-slatey-150 hover:border-slatey-300'}`}>
                    {/* Collapsible Header */}
                    <div
                      onClick={() => !isLocked && toggleExpandLevel(lvl)}
                      className={`p-4 flex items-center justify-between select-none ${isLocked ? 'cursor-not-allowed' : 'cursor-pointer'}`}
                    >
                      <div className="flex items-center gap-3">
                        <div className={`h-7 w-7 rounded-lg flex items-center justify-center text-xs font-bold ${isLocked ? 'bg-slatey-200 text-slatey-400' : 'bg-brand-50 text-brand-600'}`}>
                          {lvl}
                        </div>
                        <div>
                          <h4 className="text-sm font-semibold text-slatey-800 flex items-center gap-2">
                            Level {lvl} Escalation Target
                            {isLocked && (
                              <span className="text-[10px] px-2 py-0.5 rounded-full font-bold uppercase bg-slatey-200 text-slatey-500 flex items-center gap-1">
                                <Lock className="h-2.5 w-2.5" /> Locked
                              </span>
                            )}
                          </h4>
                          <p className="text-xs text-slatey-400 mt-0.5">
                            {isLocked
                              ? `Requires ${lvl === 2 ? 'Growth' : 'Premium'} subscription plan`
                              : form.name
                                ? `${form.name} (${form.designation || 'No title'}) • Trigger at ${form.escalationMinutes} mins`
                                : 'Not configured (click to configure)'}
                          </p>
                        </div>
                      </div>

                      {!isLocked && (
                        <button className="text-slatey-400 hover:text-slatey-600">
                          {isExpanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                        </button>
                      )}
                    </div>

                    {/* Collapsible Form Body */}
                    {isExpanded && !isLocked && (
                      <div className="p-5 border-t border-slatey-100 bg-white space-y-4">
                        <div className="flex items-center justify-between pb-2 border-b border-slatey-50">
                          <span className="text-xs font-bold text-slatey-500 uppercase tracking-wider">Level Settings</span>
                          <div className="flex items-center gap-1.5">
                            <label className="text-xs font-medium text-slatey-500 mr-1.5">Enable Level {lvl}</label>
                            <label className="relative inline-flex items-center cursor-pointer scale-90">
                              <input
                                type="checkbox"
                                className="sr-only peer"
                                checked={form.enabled}
                                onChange={(e) => setLevelForms(prev => ({
                                  ...prev,
                                  [lvl]: { ...prev[lvl], enabled: e.target.checked }
                                }))}
                              />
                              <div className="w-9 h-5 bg-slatey-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slatey-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-brand-600"></div>
                            </label>
                          </div>
                        </div>

                        <div className="grid gap-4 md:grid-cols-2">
                          <FormField
                            label="Recipient Name *" id={`name-${lvl}`}
                            value={form.name} onChange={(e) => setLevelForms(prev => ({
                              ...prev,
                              [lvl]: { ...prev[lvl], name: e.target.value }
                            }))}
                            placeholder="John Smith"
                            disabled={!form.enabled || saving}
                          />
                          <FormField
                            label="Designation / Title" id={`designation-${lvl}`}
                            value={form.designation} onChange={(e) => setLevelForms(prev => ({
                              ...prev,
                              [lvl]: { ...prev[lvl], designation: e.target.value }
                            }))}
                            placeholder="Branch Manager"
                            disabled={!form.enabled || saving}
                          />

                          <div className="grid grid-cols-3 gap-2">
                            <div className="col-span-1 space-y-1.5">
                              <label className="block text-xs font-medium text-slatey-600">Code *</label>
                              <select
                                value={form.countryCode}
                                disabled={!form.enabled || saving}
                                onChange={(e) => setLevelForms(prev => ({
                                  ...prev,
                                  [lvl]: { ...prev[lvl], countryCode: e.target.value }
                                }))}
                                className="w-full rounded-xl border border-slatey-200 bg-white px-3.5 py-2.5 text-sm text-slatey-800 outline-none transition focus:border-brand-400 disabled:opacity-50"
                              >
                                <option value="+91">+91 (IN)</option>
                                <option value="+1">+1 (US/CA)</option>
                                <option value="+44">+44 (UK)</option>
                                <option value="+61">+61 (AU)</option>
                                <option value="+971">+971 (UAE)</option>
                              </select>
                            </div>
                            <div className="col-span-2">
                              <FormField
                                label="WhatsApp Number *" id={`wa-${lvl}`} type="tel"
                                value={form.whatsappNumber} onChange={(e) => setLevelForms(prev => ({
                                  ...prev,
                                  [lvl]: { ...prev[lvl], whatsappNumber: e.target.value }
                                }))}
                                placeholder="9876543210"
                                disabled={!form.enabled || saving}
                              />
                            </div>
                          </div>

                          <FormField
                            label="Email Address (Optional)" id={`email-${lvl}`} type="email"
                            value={form.email} onChange={(e) => setLevelForms(prev => ({
                              ...prev,
                              [lvl]: { ...prev[lvl], email: e.target.value }
                            }))}
                            placeholder="escalation@business.com"
                            disabled={!form.enabled || saving}
                          />

                          <div className="md:col-span-2">
                            <FormField
                              label="Escalation Time (Minutes) *" id={`time-${lvl}`} type="number"
                              value={form.escalationMinutes} onChange={(e) => setLevelForms(prev => ({
                                  ...prev,
                                  [lvl]: { ...prev[lvl], escalationMinutes: Number(e.target.value) }
                              }))}
                              placeholder="15"
                              disabled={!form.enabled || saving}
                              hint="Minutes to wait before raising alert after review is ingested"
                            />
                          </div>
                        </div>

                        {/* Save / Delete Actions per Level */}
                        <div className="flex items-center gap-2 pt-2">
                          <Button
                            onClick={() => handleSaveLevel(lvl)}
                            disabled={saving}
                            className="flex items-center gap-1.5 text-xs px-4 py-2"
                          >
                            {saving ? <Loader2 className="h-3 w.3 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
                            Save Level {lvl}
                          </Button>
                          {form.name && (
                            <Button
                              onClick={() => handleDeleteLevel(lvl)}
                              disabled={saving}
                              variant="outline"
                              className="flex items-center gap-1.5 text-xs px-4 py-2 border-red-100 hover:bg-red-50 text-red-600 hover:text-red-700"
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                              Delete Configuration
                            </Button>
                          )}
                        </div>
                      </div>
                    )}
                  </Card>
                </motion.div>
              )
            })}
          </div>
        </motion.div>
      )}

      {activeTab === 'billing' && (
        <BillingTabContent />
      )}
    </div>
  )
}

function BillingTabContent() {
  const { billingInfo, loading, error, refetch, cancelSubscription, resumeSubscription } = useSubscription()
  const [showUpgrade, setShowUpgrade] = useState(false)

  if (loading && !billingInfo) {
    return <div className="py-12 text-center text-slatey-400">Loading billing info...</div>
  }

  if (error) {
    return <div className="py-12 text-center text-rose-500">{error}</div>
  }

  const sub = billingInfo?.subscription || { plan: 'plan_starter', billingCycle: 'monthly', status: 'inactive' }
  const usage = billingInfo?.usage || { repliesUsed: 0, qrsUsed: 0, competitorsUsed: 0, usersUsed: 0 }
  const invoices = billingInfo?.invoices || []

  // Resolve plan names and limits
  const isPremium = sub.plan === 'plan_premium'
  const isGrowth = sub.plan === 'plan_growth'
  const isStarter = sub.plan === 'plan_starter'

  const limitReplies = isPremium ? 500 : isGrowth ? 250 : 100
  const limitCompetitors = isPremium ? 5 : isGrowth ? 2 : 0
  const limitUsers = isPremium ? 5 : isGrowth ? 3 : 2
  const limitQrs = isStarter ? 0 : Infinity

  // Usage percentages
  const pctReplies = Math.min(100, (usage.repliesUsed / limitReplies) * 100)
  const pctCompetitors = limitCompetitors > 0 ? Math.min(100, (usage.competitorsUsed / limitCompetitors) * 100) : 0
  const pctUsers = Math.min(100, (usage.usersUsed / limitUsers) * 100)
  const pctQrs = limitQrs === Infinity ? 0 : 0 // Unlimited or enabled/disabled

  const getProgressColor = (pct) => {
    if (pct >= 100) return 'bg-rose-500'
    if (pct >= 80) return 'bg-amber-500'
    return 'bg-brand-600'
  }

  return (
    <motion.div className="space-y-6" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3 }}>
      {/* Plan Card */}
      <Card className="p-6 border-brand-200 bg-gradient-to-br from-white to-brand-50/10 shadow-glow">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
          <div className="space-y-2">
            <span className="inline-flex px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider bg-brand-100 text-brand-700">
              Active Subscription
            </span>
            <h3 className="text-xl font-bold text-slatey-900 flex items-center gap-2">
              OneRepute <span className="capitalize text-brand-600">{sub.plan?.replace('plan_', '') || 'Starter'} Plan</span>
            </h3>
            <p className="text-xs text-slatey-500 leading-normal">
              Your subscription is <span className="font-semibold text-emerald-600 capitalize">{sub.status || 'Active'}</span>. 
              {sub.renewalDate && ` Next renewal resets on ${new Date(sub.renewalDate).toLocaleDateString()}.`}
              {` Billing Region: ${sub.billingCountry || 'IN'} (${sub.currency || 'INR'})`}
            </p>
            {sub.status === 'trialing' && (
              <div className="flex flex-col gap-2 p-4 rounded-2xl bg-brand-50 border border-brand-200 text-brand-800 text-xs font-medium mt-2 max-w-xl shadow-sm">
                <div className="flex items-center gap-2">
                  <Sparkles className="h-4 w-4 text-brand-600 shrink-0" />
                  <span className="font-bold text-sm">7-Day Free Trial Active</span>
                </div>
                <div className="grid grid-cols-2 gap-x-6 gap-y-1.5 mt-1 text-slatey-600 font-normal">
                  <div>Trial Ends On: <span className="font-semibold text-slatey-950">{sub.trialEndDate ? new Date(sub.trialEndDate).toLocaleDateString() : 'N/A'}</span></div>
                  <div>Next Billing Date: <span className="font-semibold text-slatey-950">{sub.renewalDate ? new Date(sub.renewalDate).toLocaleDateString() : 'N/A'}</span></div>
                  <div>Auto-Renew Enabled: <span className="font-semibold text-emerald-600">Yes</span></div>
                  <div>Payment Authorized: <span className="font-semibold text-emerald-600">Yes (Secured via Razorpay)</span></div>
                </div>
                <p className="text-[10px] text-slatey-400 mt-1 italic">
                  Note: No money has been charged yet. Your payment method has been securely authorized, and billing will begin automatically when the trial expires.
                </p>
              </div>
            )}
            {sub.cancelAtPeriodEnd && (
              <div className="flex items-center gap-1.5 p-2 rounded-lg bg-amber-50 border border-amber-200 text-amber-800 text-[11px] font-medium max-w-md mt-2">
                <AlertCircle className="h-4 w-4 text-amber-600 shrink-0" />
                <span>Subscription is scheduled to cancel at the end of the billing period.</span>
              </div>
            )}
          </div>

          <div className="flex flex-wrap gap-2.5 shrink-0">
            {sub.cancelAtPeriodEnd ? (
              <Button variant="outline" className="text-xs border-amber-200 hover:bg-amber-50 text-amber-700" onClick={resumeSubscription}>
                Resume Subscription
              </Button>
            ) : (
              !isStarter && (
                <Button variant="outline" className="text-xs border-rose-100 hover:bg-rose-50 text-rose-600" onClick={cancelSubscription}>
                  Cancel Subscription
                </Button>
              )
            )}
            <Button variant="primary" className="shadow-brand text-xs flex items-center gap-1.5" onClick={() => setShowUpgrade(true)}>
              <Sparkles className="h-3.5 w-3.5" /> Compare & Change Plan
            </Button>
          </div>
        </div>
      </Card>

      {/* Usage Counters */}
      <div className="grid gap-6 md:grid-cols-2">
        <Card className="p-6 space-y-6">
          <SectionHeader icon={<CreditCard className="h-4 w-4" />} title="Usage & Quotas" description="Active utilization counters for the current period." />
          
          <div className="space-y-4">
            {/* Replies progress */}
            <div className="space-y-1.5">
              <div className="flex justify-between text-xs font-semibold text-slatey-700">
                <span>Monthly AI Review Replies</span>
                <span>{usage.repliesUsed} / {limitReplies}</span>
              </div>
              <div className="w-full h-2 bg-slatey-100 rounded-full overflow-hidden">
                <div className={`h-full transition-all duration-500 ${getProgressColor(pctReplies)}`} style={{ width: `${pctReplies}%` }} />
              </div>
              <p className="text-[10px] text-slatey-400">Resets monthly on billing renewal date.</p>
            </div>

            {/* Team members progress */}
            <div className="space-y-1.5">
              <div className="flex justify-between text-xs font-semibold text-slatey-700">
                <span>Team Members Limit</span>
                <span>{usage.usersUsed} / {limitUsers}</span>
              </div>
              <div className="w-full h-2 bg-slatey-100 rounded-full overflow-hidden">
                <div className={`h-full transition-all duration-500 ${getProgressColor(pctUsers)}`} style={{ width: `${pctUsers}%` }} />
              </div>
              <p className="text-[10px] text-slatey-400">Total active users allowed in workspace.</p>
            </div>

            {/* Competitors progress */}
            <div className="space-y-1.5">
              <div className="flex justify-between text-xs font-semibold text-slatey-700">
                <span>Competitors Tracked</span>
                <span>{usage.competitorsUsed} / {limitCompetitors}</span>
              </div>
              <div className="w-full h-2 bg-slatey-100 rounded-full overflow-hidden">
                <div className={`h-full transition-all duration-500 ${getProgressColor(pctCompetitors)}`} style={{ width: `${pctCompetitors}%` }} />
              </div>
              <p className="text-[10px] text-slatey-400">Competitor tracking limits.</p>
            </div>
          </div>
        </Card>

        {/* Feature Check Grid */}
        <Card className="p-6 space-y-6">
          <SectionHeader icon={<Sparkles className="h-4 w-4" />} title="Feature Gating Checks" description="Active components unlocked on your subscription." />
          
          <div className="grid gap-3 grid-cols-2 text-xs font-medium text-slatey-700">
            <div className="flex items-center gap-2 p-2 bg-slatey-50 rounded-lg">
              <Check className="h-4 w-4 text-emerald-500" />
              <span>Auto Replies</span>
            </div>
            <div className="flex items-center gap-2 p-2 bg-slatey-50 rounded-lg">
              <Check className="h-4 w-4 text-emerald-500" />
              <span>Low Rating AI Reply</span>
            </div>
            <div className="flex items-center gap-2 p-2 bg-slatey-50 rounded-lg">
              <span className={limitQrs > 0 ? 'text-emerald-500' : 'text-slatey-400'}><Check className="h-4 w-4" /></span>
              <span className={limitQrs > 0 ? '' : 'line-through opacity-50'}>Smart QR codes</span>
            </div>
            <div className="flex items-center gap-2 p-2 bg-slatey-50 rounded-lg">
              <span className={isPremium ? 'text-emerald-500' : 'text-slatey-400'}><Check className="h-4 w-4" /></span>
              <span className={isPremium ? '' : 'line-through opacity-50'}>Approval workflows</span>
            </div>
            <div className="flex items-center gap-2 p-2 bg-slatey-50 rounded-lg">
              <span className={!isStarter ? 'text-emerald-500' : 'text-slatey-400'}><Check className="h-4 w-4" /></span>
              <span className={!isStarter ? '' : 'line-through opacity-50'}>Keyword Tracking</span>
            </div>
            <div className="flex items-center gap-2 p-2 bg-slatey-50 rounded-lg">
              <span className={isPremium ? 'text-emerald-500' : 'text-slatey-400'}><Check className="h-4 w-4" /></span>
              <span className={isPremium ? '' : 'line-through opacity-50'}>Strategy Calls</span>
            </div>
          </div>
        </Card>
      </div>

      {/* Invoice History Logs */}
      <Card className="p-6 overflow-hidden">
        <h3 className="text-sm font-bold text-slatey-800 mb-4">Payment & Invoice History</h3>
        
        {invoices.length === 0 ? (
          <p className="text-xs text-slatey-400 text-center py-6">No previous invoices found.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse">
              <thead className="bg-slatey-50 text-[10px] font-bold uppercase tracking-wider text-slatey-500">
                <tr>
                  <th className="px-4 py-3">Date</th>
                  <th className="px-4 py-3">Invoice ID</th>
                  <th className="px-4 py-3">Amount</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3 text-right">Receipt</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slatey-100">
                {invoices.map((inv) => (
                  <tr key={inv.id} className="hover:bg-slatey-50/50">
                    <td className="px-4 py-3.5 text-slatey-600">
                      {inv.issuedAt ? new Date(inv.issuedAt.toDate ? inv.issuedAt.toDate() : inv.issuedAt).toLocaleDateString() : '—'}
                    </td>
                    <td className="px-4 py-3.5 font-medium text-slatey-800">{inv.invoiceId || '—'}</td>
                    <td className="px-4 py-3.5 text-slatey-800 font-semibold">
                      {inv.currency === 'INR' ? '₹' : '$'}{inv.amount} {inv.currency}
                    </td>
                    <td className="px-4 py-3.5">
                      <span className="inline-flex px-2 py-0.5 rounded-full text-[9px] font-bold bg-green-50 text-green-700 uppercase">
                        {inv.status}
                      </span>
                    </td>
                    <td className="px-4 py-3.5 text-right">
                      <button className="p-1 rounded-md hover:bg-slatey-100 text-slatey-400 hover:text-brand-600 transition">
                        <Download className="h-3.5 w-3.5" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {showUpgrade && (
        <UpgradeModal onClose={() => setShowUpgrade(false)} />
      )}
    </motion.div>
  )
}
