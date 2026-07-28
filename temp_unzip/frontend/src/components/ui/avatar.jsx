import * as Avatar from '@radix-ui/react-avatar'
import { cn } from '../../lib/utils'

export function AvatarRoot({ className, ...props }) {
  return <Avatar.Root className={cn('h-9 w-9 rounded-full bg-slatey-100', className)} {...props} />
}

export function AvatarImage(props) {
  return <Avatar.Image className="h-full w-full rounded-full object-cover" {...props} />
}

export function AvatarFallback({ className, ...props }) {
  return (
    <Avatar.Fallback
      className={cn('flex h-full w-full items-center justify-center text-xs font-medium text-slatey-600', className)}
      {...props}
    />
  )
}
