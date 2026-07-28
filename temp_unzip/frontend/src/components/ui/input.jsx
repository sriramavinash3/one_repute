import { cn } from '../../lib/utils'

export default function Input({ className, ...props }) {
  return (
    <input
      className={cn(
        'w-full rounded-lg border border-slatey-200 bg-white px-3 py-2 text-sm text-slatey-900 placeholder:text-slatey-400 focus:border-brand-400 focus:outline-none focus:ring-2 focus:ring-brand-200 dark:border-slatey-700 dark:bg-slatey-900 dark:text-slatey-100 dark:placeholder:text-slatey-500',
        className
      )}
      {...props}
    />
  )
}
