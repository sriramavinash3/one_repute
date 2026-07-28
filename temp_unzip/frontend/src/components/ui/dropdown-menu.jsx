import * as RadixDropdownMenu from '@radix-ui/react-dropdown-menu'
import { cn } from '../../lib/utils'

export function DropdownMenu(props) {
  return <RadixDropdownMenu.Root {...props} />
}

export function DropdownMenuTrigger(props) {
  return <RadixDropdownMenu.Trigger {...props} />
}

export function DropdownMenuContent({ className, ...props }) {
  return (
    <RadixDropdownMenu.Portal>
      <RadixDropdownMenu.Content
        className={cn(
          'z-50 min-w-[180px] rounded-xl border border-slatey-200 bg-white p-2 shadow-lg dark:border-slatey-700 dark:bg-slatey-900',
          className
        )}
        align="end"
        sideOffset={8}
        {...props}
      />
    </RadixDropdownMenu.Portal>
  )
}

export function DropdownMenuItem({ className, ...props }) {
  return (
    <RadixDropdownMenu.Item
      className={cn(
        'flex cursor-pointer items-center gap-2 rounded-lg px-3 py-2 text-sm text-slatey-700 outline-none transition hover:bg-slatey-100 focus:bg-slatey-100 dark:text-slatey-200 dark:hover:bg-slatey-800 dark:focus:bg-slatey-800',
        className
      )}
      {...props}
    />
  )
}
