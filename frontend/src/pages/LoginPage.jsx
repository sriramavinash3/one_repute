import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { 
  signInWithPopup, 
  signInWithEmailAndPassword, 
  signInWithCustomToken
} from 'firebase/auth'
import { toast } from 'sonner'
import { auth, googleProvider } from '../firebase/firebase'
import Button from '../components/ui/button'
import Input from '../components/ui/input'
import { useAuth } from '../contexts/AuthContext'
import apiClient from '../services/apiClient'
import Logo from '../components/common/Logo'
import Seo from '../components/seo/Seo'

export default function LoginPage() {
  const navigate = useNavigate()
  const { profile, authError } = useAuth()
  const [loading, setLoading] = useState(false)
  const [isSignUp, setIsSignUp] = useState(false)
  const [isForgotPassword, setIsForgotPassword] = useState(false)
  const [showPassword, setShowPassword] = useState(false)

  const [formData, setFormData] = useState({
    email: '',
    password: '',
    name: ''
  })

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

  const handleInputChange = (e) => {
    setFormData(prev => ({
      ...prev,
      [e.target.name]: e.target.value
    }))
  }

  const handleEmailAuth = async (e) => {
    e.preventDefault()
    if (!formData.email) {
      return toast.error('Please enter your email')
    }
    if (!isForgotPassword && !formData.password) {
      return toast.error('Please enter your password')
    }

    setLoading(true)
    try {
      if (isForgotPassword) {
        // Backend handles SHA-256 token generation and dispatches Resend email from notifications@onerepute.com
        await apiClient.post('/api/auth/forgot-password', { email: formData.email });
        toast.success('Check your inbox! Password reset instructions sent from notifications@onerepute.com.');
        setIsForgotPassword(false);
      } else if (isSignUp) {
        // Backend creates user, queues Welcome & Verification emails via Resend (BullMQ), and returns customToken
        const { data } = await apiClient.post('/api/auth/signup', {
          email: formData.email,
          password: formData.password,
          name: formData.name || formData.email.split('@')[0],
        });

        if (data.customToken) {
          await signInWithCustomToken(auth, data.customToken);
          toast.success('Account created! Welcome and verification emails sent to your inbox.');
        }
      } else {
        await signInWithEmailAndPassword(auth, formData.email, formData.password)
      }
    } catch (error) {
      let errorMessage = error?.response?.data?.error || error.message
      if (error.code === 'auth/email-already-in-use') errorMessage = 'This email is already registered.'
      if (error.code === 'auth/invalid-credential') errorMessage = 'Invalid email or password.'
      if (error.code === 'auth/weak-password') errorMessage = 'Password should be at least 6 characters.'
      toast.error(errorMessage)
    } finally {
      setLoading(false)
    }
  }

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
    <div className="flex min-h-screen items-center justify-center px-3 sm:px-6 py-6">
      <Seo
        title="Login | One Repute"
        description="Sign in to your One Repute dashboard to manage Google review automation, AI replies, and WhatsApp escalation alerts."
        path="/login"
        noindex
      />
      <div className="glass-panel w-full max-w-md rounded-3xl p-5 sm:p-8">
        <div className="mb-6 flex justify-center">
          <Logo size="lg" to="/" />
        </div>
        <h1 className="text-2xl font-semibold text-slatey-900">
          {isForgotPassword ? 'Reset Password' : (isSignUp ? 'Create an Account' : 'Partner Access')}
        </h1>
        <p className="mt-2 text-sm text-slatey-500">
          {isForgotPassword 
            ? 'We will send secure password reset instructions to your email via Resend.' 
            : (isSignUp ? 'Sign up to start your 14-day free trial.' : 'Sign in to access your dashboard.')}
        </p>

        <form onSubmit={handleEmailAuth} className="mt-8 space-y-4">
          {isSignUp && (
            <Input
              name="name"
              type="text"
              placeholder="Your Name / Business Name"
              value={formData.name}
              onChange={handleInputChange}
              disabled={loading}
              required
            />
          )}

          <Input
            name="email"
            type="email"
            placeholder="Email Address"
            value={formData.email}
            onChange={handleInputChange}
            disabled={loading}
            required
          />

          {!isForgotPassword && (
            <div className="relative">
              <Input
                name="password"
                type={showPassword ? 'text' : 'password'}
                placeholder="Password"
                value={formData.password}
                onChange={handleInputChange}
                disabled={loading}
                required
                className="pr-10"
              />
              <button
                type="button"
                className="absolute inset-y-0 right-0 flex items-center pr-3 text-slatey-400 hover:text-slatey-600 focus:outline-none"
                onClick={() => setShowPassword(!showPassword)}
              >
                {showPassword ? (
                  <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M9.88 9.88a3 3 0 1 0 4.24 4.24" /><path d="M10.73 5.08A10.43 10.43 0 0 1 12 5c7 0 10 7 10 7a13.16 13.16 0 0 1-1.67 2.68" /><path d="M6.61 6.61A13.526 13.526 0 0 0 2 12s3 7 10 7a9.74 9.74 0 0 0 5.39-1.61" /><line x1="2" x2="22" y1="2" y2="22" /></svg>
                ) : (
                  <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7Z" /><circle cx="12" cy="12" r="3" /></svg>
                )}
              </button>
            </div>
          )}

          {!isSignUp && !isForgotPassword && (
            <div className="text-right">
              <button
                type="button"
                onClick={() => setIsForgotPassword(true)}
                className="text-xs text-brand-600 hover:text-brand-700 font-medium focus:outline-none"
              >
                Forgot password?
              </button>
            </div>
          )}

          <Button
            variant="default"
            size="lg"
            type="submit"
            className="w-full h-14 text-lg font-medium shadow-brand hover:shadow-lg transition-shadow duration-200"
            disabled={loading}
          >
            {loading ? (
              <span className="flex items-center">
                <svg className="animate-spin -ml-1 mr-3 h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                </svg>
                Processing...
              </span>
            ) : (isForgotPassword ? 'Send Reset Link' : (isSignUp ? 'Sign Up' : 'Sign In'))}
          </Button>
        </form>

        <div className="mt-8 flex items-center justify-center gap-4">
          <div className="h-px bg-slatey-200 flex-1"></div>
          <span className="text-xs text-slatey-400 uppercase tracking-widest font-semibold">Or continue with</span>
          <div className="h-px bg-slatey-200 flex-1"></div>
        </div>

        <div className="mt-8 space-y-5">
          <Button
            variant="outline"
            size="lg"
            className="w-full h-14 text-base font-medium hover:bg-slatey-50 transition-colors"
            onClick={handleGoogleLogin}
            disabled={loading}
          >
            <svg className="w-5 h-5 mr-3" viewBox="0 0 24 24">
              <path fill="currentColor" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
              <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
              <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" />
              <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
            </svg>
            Google
          </Button>

          <div className="pt-4 border-t border-slatey-100 flex flex-col space-y-4">
            {isForgotPassword ? (
              <p className="text-center text-sm text-slatey-500">
                Remember your password?{' '}
                <button
                  onClick={() => setIsForgotPassword(false)}
                  className="text-brand-600 font-semibold hover:text-brand-700 transition-colors focus:outline-none"
                  disabled={loading}
                >
                  Back to Sign in
                </button>
              </p>
            ) : (
              <p className="text-center text-sm text-slatey-500">
                {isSignUp ? "Already have an account? " : "Don't have an account? "}
                <button
                  onClick={() => setIsSignUp(!isSignUp)}
                  className="text-brand-600 font-semibold hover:text-brand-700 transition-colors focus:outline-none"
                  disabled={loading}
                >
                  {isSignUp ? 'Sign in' : 'Sign up'}
                </button>
              </p>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}



