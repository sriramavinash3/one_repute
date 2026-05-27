import { cn } from '../../lib/utils'

export function Card({ className, ...props }) {
  return (
    <div
      className={cn(
        'rounded-2xl border border-slatey-200 bg-white/80 shadow-sm dark:border-slatey-700 dark:bg-slatey-800/70',
        className
      )}
      {...props}
    />
  )
}

export function CardHeader({ className, ...props }) {
  return <div className={cn('flex items-center justify-between p-5', className)} {...props} />
}

export function CardTitle({ className, ...props }) {
  return <h3 className={cn('text-lg font-semibold text-slatey-900', className)} {...props} />
}

export function CardContent({ className, ...props }) {
  return <div className={cn('px-5 pb-5', className)} {...props} />
}
