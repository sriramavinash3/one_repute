import { Link } from 'react-router-dom'
import logoAsset from '../../assets/logo.png'

export default function Logo({
  className = '',
  size = 'md',
  showText = true,
  subtitle = null,
  to = '/',
  clickable = true
}) {
  const sizeClasses = {
    sm: 'h-7',
    md: 'h-9',
    lg: 'h-12',
    xl: 'h-16',
  }

  const imageSize = sizeClasses[size] || sizeClasses.md

  const content = (
    <div className={`inline-flex items-center gap-3 ${className}`}>
      <img
        src={logoAsset}
        alt="One Repute Logo"
        className={`${imageSize} w-auto object-contain shrink-0`}
      />
      {showText && (
        <div className="flex flex-col">
          <span className="text-xl font-extrabold tracking-tight text-slatey-900 dark:text-white leading-none">
            One Repute
          </span>
          {subtitle && (
            <span className="text-[11px] font-semibold text-brand-600 dark:text-brand-400 leading-tight mt-0.5">
              {subtitle}
            </span>
          )}
        </div>
      )}
    </div>
  )

  if (clickable && to) {
    return (
      <Link to={to} className="focus:outline-none focus:ring-2 focus:ring-brand-500/50 rounded-lg">
        {content}
      </Link>
    )
  }

  return content
}
