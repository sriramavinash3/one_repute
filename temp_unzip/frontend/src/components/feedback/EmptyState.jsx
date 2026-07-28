import { Inbox } from 'lucide-react'
import Button from '../ui/button'

export default function EmptyState({ title, description, actionLabel, onAction }) {
  return (
    <div className="flex flex-col items-center gap-3 rounded-2xl border border-dashed border-slatey-200 bg-white/70 px-6 py-10 text-center">
      <div className="flex h-12 w-12 items-center justify-center rounded-full bg-slatey-100">
        <Inbox className="h-5 w-5 text-slatey-500" />
      </div>
      <div className="text-base font-semibold text-slatey-900">{title}</div>
      <p className="text-sm text-slatey-500">{description}</p>
      {actionLabel ? (
        <Button variant="outline" onClick={onAction}>
          {actionLabel}
        </Button>
      ) : null}
    </div>
  )
}
