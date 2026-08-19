import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { signInWithPopup } from 'firebase/auth'
import { toast } from 'sonner'
import { auth, googleProvider } from '../firebase/firebase'
import Button from '../components/ui/button'
import { useAuth } from '../contexts/AuthContext'
import Logo from '../components/common/Logo'
import Seo from '../components/seo/Seo'

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
      toast.error(error.message || 'Google sign in failed')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center px-3 sm:px-6 py-6 bg-slatey-50 dark:bg-slatey-950">
      <Seo
        title="Sign In | One Repute"
        description="Single Google Login entry point for One Repute reputation management dashboard."
        path="/login"
        noindex
      />
      <div className="glass-panel w-full max-w-md rounded-3xl p-6 sm:p-10 shadow-2xl bg-white dark:bg-slatey-900 border border-slatey-100 dark:border-slatey-800 text-center">
        <div className="mb-6 flex justify-center">
          <Logo size="lg" to="/" />
        </div>
        <h1 className="text-2xl font-bold text-slatey-900 dark:text-white">
          Welcome to One Repute
        </h1>
        <p className="mt-2 text-sm text-slatey-500 dark:text-slatey-400">
          Sign in with your Google account to access your Google Business Profiles and reputation dashboard.
        </p>

        <div className="mt-8 space-y-4">
          <Button
            variant="default"
            size="lg"
            className="w-full h-14 text-base font-semibold shadow-brand bg-brand-600 hover:bg-brand-700 text-white flex items-center justify-center gap-3 transition-transform active:scale-[0.99]"
            onClick={handleGoogleLogin}
            disabled={loading}
          >
            <svg className="w-5 h-5" viewBox="0 0 24 24">
              <path fill="#ffffff" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
              <path fill="#ffffff" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
              <path fill="#ffffff" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" />
              <path fill="#ffffff" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
            </svg>
            {loading ? 'Connecting with Google...' : 'Continue with Google'}
          </Button>

          <p className="text-xs text-slatey-400 mt-4 leading-relaxed">
            By continuing, you authorize One Repute to discover your Google Business Profile locations and manage automated review replies.
          </p>
        </div>
      </div>
    </div>
  )
}
