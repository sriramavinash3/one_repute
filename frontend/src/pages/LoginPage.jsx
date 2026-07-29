import { useState, useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { 
  signInWithPopup, 
  signInWithEmailAndPassword, 
  createUserWithEmailAndPassword,
  sendSignInLinkToEmail,
  isSignInWithEmailLink,
  signInWithEmailLink
} from 'firebase/auth'
import { toast } from 'sonner'
import { auth, googleProvider } from '../firebase/firebase'
import Button from '../components/ui/button'
import Input from '../components/ui/input'
import { useAuth } from '../contexts/AuthContext'

export default function LoginPage() {
  const navigate = useNavigate()
  const { profile, authError } = useAuth()
  const [loading, setLoading] = useState(false)
  const [isSignUp, setIsSignUp] = useState(false)
  const [isMagicLink, setIsMagicLink] = useState(false)
  const [showPassword, setShowPassword] = useState(false)

  const [formData, setFormData] = useState({
    email: '',
    password: ''
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

  const isVerifying = useRef(false)

  useEffect(() => {
    const handleEmailLinkSignIn = async () => {
      if (isSignInWithEmailLink(auth, window.location.href)) {
        let email = window.localStorage.getItem('emailForSignIn');
        if (!email) {
          email = window.prompt('Please provide your email for confirmation');
        }
        if (email && !isVerifying.current) {
          isVerifying.current = true;
          setLoading(true);
          try {
            await signInWithEmailLink(auth, email, window.location.href);
            window.localStorage.removeItem('emailForSignIn');
            // AuthContext will handle routing when `profile` loads
          } catch (error) {
            // Ignore invalid action code if we're already authenticated (React 18 Strict Mode double-firing)
            if (error.code === 'auth/invalid-action-code' && auth.currentUser) {
              return;
            }
            toast.error(error.message);
          } finally {
            setLoading(false);
          }
        }
      }
    };
    handleEmailLinkSignIn();
  }, []);

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
    if (!isMagicLink && !formData.password) {
      return toast.error('Please enter your password')
    }

    setLoading(true)
    try {
      if (isMagicLink) {
        const actionCodeSettings = {
          url: window.location.href,
          handleCodeInApp: true,
        };
        await sendSignInLinkToEmail(auth, formData.email, actionCodeSettings);
        window.localStorage.setItem('emailForSignIn', formData.email);
        toast.success('Magic link sent! Check your email.');
      } else if (isSignUp) {
        await createUserWithEmailAndPassword(auth, formData.email, formData.password)
      } else {
        await signInWithEmailAndPassword(auth, formData.email, formData.password)
      }
    } catch (error) {
      let errorMessage = error.message
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
    <div className="flex min-h-screen items-center justify-center px-6">
      <div className="glass-panel w-full max-w-md rounded-3xl p-8">
        <h1 className="text-2xl font-semibold text-slatey-900">
          {isMagicLink ? 'Sign in with Magic Link' : (isSignUp ? 'Create an Account' : 'Partner Access')}
        </h1>
        <p className="mt-2 text-sm text-slatey-500">
          {isMagicLink ? 'We will send a secure sign-in link to your email.' : (isSignUp ? 'Sign up to start your 14-day free trial.' : 'Sign in to access your dashboard.')}
        </p>

        <form onSubmit={handleEmailAuth} className="mt-8 space-y-4">
          <Input
            name="email"
            type="email"
            placeholder="Email Address"
            value={formData.email}
            onChange={handleInputChange}
            disabled={loading}
            required
          />
          {!isMagicLink && (
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
            ) : (isMagicLink ? 'Send Magic Link' : (isSignUp ? 'Sign Up' : 'Sign In'))}
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
            {isMagicLink ? (
              <p className="text-center text-sm text-slatey-500">
                Prefer using a password?{' '}
                <button
                  onClick={() => setIsMagicLink(false)}
                  className="text-brand-600 font-semibold hover:text-brand-700 transition-colors focus:outline-none"
                  disabled={loading}
                >
                  Go back
                </button>
              </p>
            ) : (
              <>
                <button
                  onClick={() => setIsMagicLink(true)}
                  className="text-brand-600 text-sm font-semibold hover:text-brand-700 transition-colors focus:outline-none w-full flex items-center justify-center gap-2"
                  disabled={loading}
                >
                  <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21.2 8.4c.5.38.8.97.8 1.6v10a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V10a2 2 0 0 1 .8-1.6l8-6a2 2 0 0 1 2.4 0l8 6Z"/><path d="m22 10-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 10"/></svg>
                  Sign in with Magic Link
                </button>
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
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
