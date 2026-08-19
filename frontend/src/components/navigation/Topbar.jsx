import { useEffect, useState } from 'react'
import { Bell, Moon, Search, Sun } from 'lucide-react'
import Input from '../ui/input'
import { DropdownMenuContent, DropdownMenuItem, DropdownMenu, DropdownMenuTrigger } from '../ui/dropdown-menu'
import { AvatarFallback, AvatarImage, AvatarRoot } from '../ui/avatar'
import Button from '../ui/button'
import OutletSelector from './OutletSelector'

export default function Topbar({ title, user, onLogout }) {
  const [isDark, setIsDark] = useState(false)

  useEffect(() => {
    setIsDark(document.documentElement.classList.contains('dark'))
  }, [])

  const toggleTheme = () => {
    document.documentElement.classList.toggle('dark')
    setIsDark(document.documentElement.classList.contains('dark'))
  }
  const initials = user?.name
    ? user.name
      .split(' ')
      .map((part) => part[0])
      .join('')
      .slice(0, 2)
      .toUpperCase()
    : 'AI'

  return (
    <header className="flex flex-wrap items-center justify-between gap-3 border-b border-slatey-200 bg-white/70 px-4 py-3 sm:px-6 sm:py-4 dark:border-slatey-800 dark:bg-slatey-900/70 shrink-0">
      <div className="flex items-center gap-4">
        <div>
          <p className="text-xs uppercase tracking-[0.2em] text-slatey-400">Workspace</p>
          <h1 className="text-xl font-semibold text-slatey-900">{title}</h1>
        </div>
      </div>

      <div className="flex items-center gap-3">
        <OutletSelector />
        <Button variant="ghost" size="sm" className="rounded-full" onClick={toggleTheme}>
          {isDark ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
        </Button>

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button className="flex items-center gap-2 rounded-full border border-slatey-200 bg-white px-2 py-1 dark:border-slatey-700 dark:bg-slatey-900">
              <AvatarRoot>
                <AvatarImage src={user?.photoUrl} alt={user?.name} />
                <AvatarFallback>{initials}</AvatarFallback>
              </AvatarRoot>
              <div className="hidden text-left text-xs md:block">
                <p className="font-semibold text-slatey-800">{user?.name || 'Workspace'}</p>
                <p className="text-slatey-400">{user?.role || 'member'}</p>
              </div>
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent>
            <DropdownMenuItem onClick={onLogout}>Log out</DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </header>
  )
}
