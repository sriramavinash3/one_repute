import { useEffect, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import Button from '../components/ui/button'
import Logo from '../components/common/Logo'
import apiClient from '../services/apiClient'

export default function VerifyEmailPage() {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const email = searchParams.get('email') || ''
  const token = searchParams.get('token') || ''

  const [loading, setLoading] = useState(true)
  const [verified, setVerified] = useState(false)
  const [errorMsg, setErrorMsg] = useState('')

  useEffect(() => {
    async function verify() {
      if (!token || !email) {
        setLoading(false)
        setErrorMsg('Invalid or missing verification link.')
        return
      }

      try {
        await apiClient.get(`/api/auth/verify-email-token?email=${encodeURIComponent(email)}&token=${encodeURIComponent(token)}`)
        setVerified(true)
      } catch (err) {
        setErrorMsg(err?.response?.data?.error || 'Verification link expired or already used.')
      } finally {
        setLoading(false)
      }
    }

    verify()
  }, [email, token])

  return (
    <div className="flex min-h-screen items-center justify-center px-6">
      <div className="glass-panel w-full max-w-md rounded-3xl p-8 text-center">
        <div className="mb-6 flex justify-center">
          <Logo size="lg" to="/" />
        </div>

        {loading ? (
          <div className="py-12 space-y-4">
            <div className="mx-auto h-8 w-8 animate-spin rounded-full border-4 border-brand-600 border-t-transparent"></div>
            <p className="text-sm font-medium text-slatey-600">Verifying your email address...</p>
          </div>
        ) : verified ? (
          <div className="py-6 space-y-6">
            <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-emerald-100 text-2xl text-emerald-600">
              ✓
            </div>
            <h1 className="text-2xl font-semibold text-slatey-900">Email Verified!</h1>
            <p className="text-sm text-slatey-600">
              Your email address <strong>{email}</strong> has been successfully verified.
            </p>
            <Button variant="default" size="lg" className="w-full" onClick={() => navigate('/login')}>
              Continue to Dashboard →
            </Button>
          </div>
        ) : (
          <div className="py-6 space-y-6">
            <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-rose-100 text-2xl text-rose-600">
              ✕
            </div>
            <h1 className="text-2xl font-semibold text-slatey-900">Verification Failed</h1>
            <p className="text-sm text-rose-600">{errorMsg}</p>
            <Button variant="default" size="lg" className="w-full" onClick={() => navigate('/login')}>
              Go to Login Page →
            </Button>
          </div>
        )}
      </div>
    </div>
  )
}
