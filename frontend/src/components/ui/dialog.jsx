import * as Dialog from '@radix-ui/react-dialog'
import { cn } from '../../lib/utils'

export function DialogRoot(props) {
  return <Dialog.Root {...props} />
}

export function DialogTrigger(props) {
  return <Dialog.Trigger {...props} />
}

export function DialogContent({ className, ...props }) {
  return (
    <Dialog.Portal>
      <Dialog.Overlay className="fixed inset-0 bg-slatey-900/40" />
      <Dialog.Content
        className={cn(
          'fixed left-1/2 top-1/2 z-50 max-h-[90vh] overflow-y-auto w-[calc(100vw-2rem)] max-w-lg -translate-x-1/2 -translate-y-1/2 rounded-2xl border border-slatey-200 bg-white p-5 sm:p-6 shadow-xl dark:border-slatey-700 dark:bg-slatey-900',
          className
        )}
        {...props}
      />
    </Dialog.Portal>
  )
}

export function DialogTitle({ className, ...props }) {
  return <Dialog.Title className={cn('text-lg font-semibold text-slatey-900', className)} {...props} />
}

export function DialogDescription({ className, ...props }) {
  return <Dialog.Description className={cn('text-sm text-slatey-500', className)} {...props} />
}
