import { cva } from 'class-variance-authority'
import { cn } from '../../lib/utils'

const badgeVariants = cva('inline-flex items-center rounded-full px-3 py-1 text-xs font-medium', {
  variants: {
    variant: {
      success: 'bg-emerald-50 text-emerald-700',
      warning: 'bg-amber-50 text-amber-700',
      danger: 'bg-rose-50 text-rose-700',
      neutral: 'bg-slatey-100 text-slatey-700',
      brand: 'bg-brand-50 text-brand-700'
    }
  },
  defaultVariants: {
    variant: 'neutral'
  }
})

export default function Badge({ className, variant, ...props }) {
  return <span className={cn(badgeVariants({ variant }), className)} {...props} />
}
