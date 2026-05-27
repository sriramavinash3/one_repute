import { Link } from 'react-router-dom'
import Button from '../components/ui/button'

export default function NotFoundPage() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-4 px-6 text-center">
      <h1 className="text-3xl font-semibold">Page not found</h1>
      <p className="text-sm text-slatey-500">The route you requested does not exist.</p>
      <Link to="/">
        <Button variant="outline">Back to home</Button>
      </Link>
    </div>
  )
}
