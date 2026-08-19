import { NavLink } from 'react-router-dom'
import { Lock } from 'lucide-react'
import { cn } from '../../lib/utils'

export default function Sidebar({ items, header, footer, className, onItemClick, onLockedClick }) {
  return (
    <aside
      className={cn(
        'h-screen w-64 shrink-0 flex-col justify-between overflow-y-auto border-r border-slatey-200 bg-white/80 px-5 py-6 lg:flex dark:border-slatey-800 dark:bg-slatey-900/80',
        className
      )}
    >
      <div>
        <div className="mb-6 flex items-center gap-2 text-lg font-semibold text-slatey-900">
          {header}
        </div>
        <nav className="flex flex-col gap-2">
          {items.map((item) =>
            item.locked ? (
              <div key={item.to} className="group relative">
                <button
                  type="button"
                  aria-disabled="true"
                  onClick={() => onLockedClick?.(item)}
                  className={cn(
                    'flex w-full cursor-not-allowed items-center gap-3 rounded-lg px-3 py-2 text-sm transition',
                    'text-slatey-400 hover:bg-slatey-100 dark:text-slatey-500 dark:hover:bg-slatey-800/40'
                  )}
                >
                  {item.icon}
                  <span className="flex-1 text-left">{item.label}</span>
                  <Lock className="h-3.5 w-3.5 shrink-0 text-slatey-400" />
                  <span className="rounded-full border border-amber-200 bg-amber-50 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide text-amber-700">
                    Updated Soon
                  </span>
                </button>
                <div className="pointer-events-none absolute bottom-full left-0 z-50 mb-2 w-56 rounded-lg bg-slatey-900 px-3 py-2 text-[11px] font-medium leading-snug text-white opacity-0 shadow-lg transition-opacity duration-200 group-hover:opacity-100 dark:bg-slatey-800">
                  {item.lockedMessage}
                </div>
              </div>
            ) : (
              <NavLink
                key={item.to}
                to={item.to}
                end={item.end}
                onClick={onItemClick}
                className={({ isActive }) =>
                  cn(
                    'flex items-center gap-3 rounded-lg px-3 py-2 text-sm text-slatey-600 transition hover:bg-slatey-100 dark:text-slatey-400 dark:hover:bg-slatey-800/50',
                    isActive && 'bg-brand-50 text-brand-700 dark:bg-brand-500/10 dark:text-brand-400'
                  )
                }
              >
                {item.icon}
                {item.label}
              </NavLink>
            )
          )}
        </nav>
      </div>
      {footer ? <div className="mt-4 pt-4 border-t border-slatey-100 dark:border-slatey-800">{footer}</div> : null}
    </aside>
  )
}
