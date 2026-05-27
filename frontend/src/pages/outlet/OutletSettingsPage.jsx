import { useEffect, useMemo, useState } from 'react'
import { motion } from 'framer-motion'
import { Save, Building2, Phone, CheckCircle2, Loader2 } from 'lucide-react'
import { Card } from '../../components/ui/card'
import Button from '../../components/ui/button'
import { toast } from 'sonner'
import { useAuth } from '../../contexts/AuthContext'
import { updateOutletSettings } from '../../services/outletService'

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

function FormField({ label, id, type = 'text', value, onChange, placeholder, hint }) {
  return (
    <div className="space-y-1.5">
      <label htmlFor={id} className="block text-xs font-medium text-slatey-600">{label}</label>
      <input
        id={id}
        type={type}
        value={value}
        onChange={onChange}
        placeholder={placeholder}
        className="w-full rounded-xl border border-slatey-200 bg-white/80 px-3.5 py-2.5 text-sm text-slatey-800 outline-none transition focus:border-brand-400 focus:ring-2 focus:ring-brand-100"
      />
      {hint && <p className="text-[11px] text-slatey-400">{hint}</p>}
    </div>
  )
}

export default function OutletSettingsPage() {
  const { outlet } = useAuth()
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
  }, [outlet])

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

  const stagger = { hidden: {}, show: { transition: { staggerChildren: 0.08 } } }
  const fadeUp = { hidden: { opacity: 0, y: 10 }, show: { opacity: 1, y: 0, transition: { duration: 0.3 } } }

  return (
    <motion.div className="space-y-6 max-w-3xl" variants={stagger} initial="hidden" animate="show">
      <div>
        <h2 className="text-xl font-semibold">Settings</h2>
        <p className="text-sm text-slatey-500">Manage business information.</p>
      </div>

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

      {/* WhatsApp */}
      <motion.div variants={fadeUp}>
        <Card className="p-6 space-y-5">
          <SectionHeader icon={<Phone className="h-4 w-4" />} title="WhatsApp Escalation" description="Configure the number that receives escalation alerts." />
          <div className="grid gap-4 md:grid-cols-2">
            <FormField
              label="WhatsApp number" id="wa-number" type="tel"
              value={whatsapp.number} onChange={(e) => setWhatsapp({ ...whatsapp, number: e.target.value })}
              placeholder="+91 98765 43210"
              hint="Must be registered on WhatsApp Business API"
            />
            <div className="space-y-1.5">
              <label htmlFor="escalation-threshold" className="block text-xs font-medium text-slatey-600">
                Escalation threshold (rating ≤)
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
              <p className="text-[11px] text-slatey-400">Reviews at or below this rating will trigger a WhatsApp alert</p>
            </div>
          </div>
        </Card>
      </motion.div>

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
  )
}
