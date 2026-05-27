import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { addDoc, collection, doc, serverTimestamp, updateDoc } from 'firebase/firestore'
import { toast } from 'sonner'
import { db } from '../firebase/firebase'
import Button from '../components/ui/button'
import Input from '../components/ui/input'
import { useAuth } from '../contexts/AuthContext'

export default function OnboardingPage() {
  const navigate = useNavigate()
  const { user, profile } = useAuth()
  const [loading, setLoading] = useState(false)
  const [form, setForm] = useState({
    businessName: '',
    businessType: '',
    managerPhone: ''
  })

  useEffect(() => {
    // If user is already set up, skip onboarding
    if (profile?.outletId) {
      navigate('/outlet-dashboard')
    }
  }, [profile, navigate])

  const handleSetup = async (event) => {
    event.preventDefault()
    if (!user || !profile) return

    setLoading(true)
    try {
      // 1. Create the Outlet document
      const outletRef = await addDoc(collection(db, 'outlets'), {
        name: form.businessName,
        businessType: form.businessType,
        managerPhone: form.managerPhone,
        ownerId: user.uid,
        email: user.email,
        isActive: true,
        createdAt: serverTimestamp()
      })

      // 2. Update the User profile
      await updateDoc(doc(db, 'users', user.uid), {
        businessName: form.businessName,
        outletId: outletRef.id,
        isSetupComplete: true,
        updatedAt: serverTimestamp()
      })

      toast.success('Business profile created! Now connect your Google Business account.')
      navigate('/connect-google')
    } catch (error) {
      toast.error(error.message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center px-6">
      <div className="glass-panel w-full max-w-lg rounded-3xl p-8">
        <h1 className="text-2xl font-semibold text-slatey-900">Finalize your setup</h1>
        <p className="mt-2 text-sm text-slatey-500">Provide your business details to complete authorized onboarding.</p>
        <form onSubmit={handleSetup} className="mt-6 grid gap-4">
          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-slatey-500 ml-1">Business Name</label>
            <Input
              placeholder="e.g. The Grand Bistro"
              value={form.businessName}
              onChange={(event) => setForm({ ...form, businessName: event.target.value })}
              required
            />
          </div>
          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-slatey-500 ml-1">Business Type</label>
            <Input
              placeholder="e.g. Fine Dining"
              value={form.businessType}
              onChange={(event) => setForm({ ...form, businessType: event.target.value })}
              required
            />
          </div>
          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-slatey-500 ml-1">Manager WhatsApp Number</label>
            <Input
              placeholder="e.g. +1234567890"
              value={form.managerPhone}
              onChange={(event) => setForm({ ...form, managerPhone: event.target.value })}
              required
            />
          </div>
          <Button type="submit" size="lg" className="mt-4" disabled={loading}>
            {loading ? 'Saving details...' : 'Complete Onboarding'}
          </Button>
        </form>
      </div>
    </div>
  )
}
