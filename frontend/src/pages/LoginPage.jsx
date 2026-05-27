import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { signInWithPopup } from 'firebase/auth'
import { toast } from 'sonner'
import { auth, googleProvider } from '../firebase/firebase'
import Button from '../components/ui/button'
import { useAuth } from '../contexts/AuthContext'


export default function LoginPage() {
  const navigate = useNavigate()
  const { profile, authError } = useAuth()
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (profile) {
      if (profile.role === 'admin') {
        navigate('/admin-dashboard')
      } else if (!profile.isSetupComplete) {
        navigate('/onboarding')
      } else {
        navigate('/outlet-dashboard')
      }
    }
  }, [profile, navigate])

  useEffect(() => {
    if (authError) {
      toast.error(authError)
    }
  }, [authError])

  const handleGoogleLogin = async () => {
    setLoading(true)
    try {
      await signInWithPopup(auth, googleProvider)
    } catch (error) {
      toast.error(error.message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center px-6">
      <div className="glass-panel w-full max-w-md rounded-3xl p-8">
        <h1 className="text-2xl font-semibold text-slatey-900">Partner Access</h1>
        <p className="mt-2 text-sm text-slatey-500">Sign in with your authorized business Google account.</p>
        
        <div className="mt-8 space-y-4">
          <Button 
            variant="default" 
            size="lg" 
            className="w-full h-14 text-lg shadow-brand" 
            onClick={handleGoogleLogin} 
            disabled={loading}
          >
            {loading ? 'Verifying...' : 'Continue with Google'}
          </Button>
          
          <p className="text-center text-xs text-slatey-400 mt-6 leading-relaxed">
            Only pre-registered business accounts can access the dashboard. 
            Contact your administrator if you need access.
          </p>
        </div>
      </div>
    </div>
  )
}
