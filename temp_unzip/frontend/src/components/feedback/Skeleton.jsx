import { cn } from '../../lib/utils'

export default function Skeleton({ className }) {
  return <div className={cn('animate-pulse rounded-lg bg-slatey-100', className)} />
}
