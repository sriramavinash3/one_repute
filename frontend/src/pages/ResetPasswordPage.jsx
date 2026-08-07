import { useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { toast } from 'sonner'
import Button from '../components/ui/button'
import Input from '../components/ui/input'
import Logo from '../components/common/Logo'
import apiClient from '../services/apiClient'

export default function ResetPasswordPage() {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const email = searchParams.get('email') || ''
  const token = searchParams.get('token') || ''

  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [completed, setCompleted] = useState(false)

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!token || !email) {
      return toast.error('Invalid or missing password reset link.')
    }
    if (password.length < 6) {
      return toast.error('Password must be at least 6 characters.')
    }
    if (password !== confirmPassword) {
      return toast.error('Passwords do not match.')
    }

    setLoading(true)
    try {
      await apiClient.post('/api/auth/reset-password', {
        email,
        token,
        newPassword: password,
      })
      toast.success('Password updated successfully! A security confirmation was sent via Resend.')
      setCompleted(true)
    } catch (err) {
      toast.error(err?.response?.data?.error || 'Failed to reset password. Link may be expired.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center px-6">
      <div className="glass-panel w-full max-w-md rounded-3xl p-8">
        <div className="mb-6 flex justify-center">
          <Logo size="lg" to="/" />
        </div>
        <h1 className="text-2xl font-semibold text-slatey-900">Set New Password</h1>
        <p className="mt-2 text-sm text-slatey-500">
          Enter your new password below for account <strong>{email}</strong>.
        </p>

        {completed ? (
          <div className="mt-8 text-center space-y-4">
            <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-emerald-100 text-emerald-600">
              ✓
            </div>
            <p className="text-sm font-medium text-slatey-800">
              Your password has been changed securely.
            </p>
            <Button variant="default" size="lg" className="w-full" onClick={() => navigate('/login')}>
              Sign In Now →
            </Button>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="mt-8 space-y-4">
            <Input
              type="password"
              placeholder="New Password (min 6 chars)"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              disabled={loading}
              required
            />
            <Input
              type="password"
              placeholder="Confirm New Password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              disabled={loading}
              required
            />
            <Button variant="default" size="lg" type="submit" className="w-full h-14" disabled={loading}>
              {loading ? 'Updating Password...' : 'Update Password →'}
            </Button>
          </form>
        )}
      </div>
    </div>
  )
}
