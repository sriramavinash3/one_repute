import { AlertCircle } from 'lucide-react'
import Button from '../ui/button'

export default function NoGmbModal({ isOpen, onClose, onTryAnotherAccount }) {
  if (!isOpen) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slatey-900/60 p-4 backdrop-blur-sm">
      <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl dark:bg-slatey-900 border border-slatey-100 dark:border-slatey-800">
        <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-amber-50 text-amber-600 dark:bg-amber-950/40 dark:text-amber-400 mb-4">
          <AlertCircle className="h-8 w-8" />
        </div>

        <h3 className="text-center text-lg font-bold text-slatey-900 dark:text-white mb-3">
          Google My Business Not Found
        </h3>

        <div className="rounded-xl bg-amber-50/80 p-4 border border-amber-200/60 dark:bg-amber-950/30 dark:border-amber-900/50 mb-6">
          <p className="text-center text-sm font-medium leading-relaxed text-amber-900 dark:text-amber-200">
            No, a Google My Business profile was not found with this Gmail account. Please use your Google My Business-linked Gmail account.
          </p>
        </div>

        <div className="flex flex-col gap-3">
          <Button
            size="lg"
            className="w-full h-12 shadow-brand bg-brand-600 text-white hover:bg-brand-700 font-semibold"
            onClick={onTryAnotherAccount}
          >
            Try Another Google Account
          </Button>

          <Button
            variant="ghost"
            size="sm"
            className="w-full text-slatey-500 hover:text-slatey-700 dark:text-slatey-400"
            onClick={onClose}
          >
            Cancel
          </Button>
        </div>
      </div>
    </div>
  )
}
