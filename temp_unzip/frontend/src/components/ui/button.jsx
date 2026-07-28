import { cva } from 'class-variance-authority'
import { cn } from '../../lib/utils'

const buttonVariants = cva(
  'inline-flex items-center justify-center gap-2 rounded-lg text-sm font-medium transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/50 disabled:pointer-events-none disabled:opacity-60',
  {
    variants: {
      variant: {
        primary: 'bg-brand-600 text-white shadow-sm hover:bg-brand-700',
        outline: 'border border-slatey-200 bg-white text-slatey-800 hover:border-brand-200 hover:text-brand-700',
        ghost: 'text-slatey-600 hover:bg-slatey-100',
        dark: 'bg-slatey-900 text-white hover:bg-slatey-800'
      },
      size: {
        sm: 'h-9 px-3',
        md: 'h-10 px-4',
        lg: 'h-11 px-5'
      }
    },
    defaultVariants: {
      variant: 'primary',
      size: 'md'
    }
  }
)

export default function Button({ className, variant, size, isLoading, children, ...props }) {
  return (
    <button 
      className={cn(buttonVariants({ variant, size }), className)} 
      disabled={isLoading || props.disabled} 
      {...props}
    >
      {isLoading && (
        <svg className="mr-2 h-4 w-4 animate-spin" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
        </svg>
      )}
      {children}
    </button>
  )
}
