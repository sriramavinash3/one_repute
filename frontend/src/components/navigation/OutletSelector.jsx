import { useState, useMemo } from 'react'
import { Store, ChevronDown, PlusCircle, Check } from 'lucide-react'
import { useAuth } from '../../contexts/AuthContext'
import OutletSubscriptionModal from '../pricing/OutletSubscriptionModal'
import NoGmbModal from '../common/NoGmbModal'

export default function OutletSelector() {
  const { outlet, outlets, accessibleGbpLocations, switchOutlet, user, noGmbFound, setNoGmbFound } = useAuth()
  const [isOpen, setIsOpen] = useState(false)
  const [subscriptionModalLocation, setSubscriptionModalLocation] = useState(null)
  const [showSubscriptionModal, setShowSubscriptionModal] = useState(false)

  // Merge registered outlets and accessible GMB locations into unified list
  const combinedOutlets = useMemo(() => {
    const list = []
    const registeredLocIds = new Set()

    // 1. Add all registered outlets
    if (Array.isArray(outlets)) {
      outlets.forEach((o) => {
        const locId = o.googleLocationId || o.placeId || o.id
        if (locId) registeredLocIds.add(String(locId))
        list.push({
          id: o.id,
          googleLocationId: locId,
          name: o.name || 'Unnamed Outlet',
          isRegistered: true,
          status: o.status || 'active',
          statusLabel: o.status === 'active' ? 'Active / Registered' : 'Requires Plan',
          statusColor: o.status === 'active' ? 'text-emerald-500' : 'text-amber-500',
          badgeBg: o.status === 'active' ? 'bg-emerald-50 text-emerald-700 border-emerald-200' : 'bg-amber-50 text-amber-700 border-amber-200',
          outletData: o,
        })
      })
    }

    // 2. Add accessible GBP locations that are NOT yet registered as active outlets
    if (Array.isArray(accessibleGbpLocations)) {
      accessibleGbpLocations.forEach((loc) => {
        const locId = String(loc.id || loc.placeId || '')
        if (locId && !registeredLocIds.has(locId)) {
          list.push({
            id: `new_${locId}`,
            googleLocationId: locId,
            name: loc.name || 'Google Business Location',
            isRegistered: false,
            status: 'unregistered',
            statusLabel: 'New / Requires Plan',
            statusColor: 'text-brand-500',
            badgeBg: 'bg-brand-50 text-brand-700 border-brand-200',
            locationData: loc,
          })
        }
      })
    }

    return list
  }, [outlets, accessibleGbpLocations])

  const handleSelect = (item) => {
    setIsOpen(false)
    console.log('[OutletSelector] Outlet selection initiated:', {
      previousOutletId: outlet?.id,
      selectedOutletId: item.id,
      selectedName: item.name,
      isRegistered: item.isRegistered,
      status: item.status
    })
    if (item.isRegistered && item.status === 'active') {
      switchOutlet(item.id)
    } else {
      // Unregistered or expired outlet -> open subscription flow modal
      const locToUse = item.locationData || {
        id: item.googleLocationId,
        name: item.name,
        address: item.outletData?.address || '',
        category: item.outletData?.businessCategory || 'General Business',
      }
      setSubscriptionModalLocation(locToUse)
      setShowSubscriptionModal(true)
    }
  }

  const handleConnectAnotherGoogle = () => {
    setIsOpen(false)
    if (!user?.uid) return
    const width = 500
    const height = 600
    const left = window.screenX + (window.outerWidth - width) / 2
    const top = window.screenY + (window.outerHeight - height) / 2
    const backendUrl = import.meta.env.VITE_API_BASE_URL || 'http://localhost:3000'
    const url = `${backendUrl}/api/auth/google/onboard?uid=${user.uid}&selectAccount=true`
    window.open(url, 'Connect GMB', `width=${width},height=${height},left=${left},top=${top}`)
  }

  const currentActiveName = outlet?.name || 'Select Outlet'

  return (
    <div className="relative inline-block text-left w-full md:w-auto">
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className="flex w-full md:w-auto items-center justify-between gap-3 rounded-xl border border-slatey-200 bg-white px-3 py-2 text-sm font-semibold text-slatey-800 shadow-sm transition hover:bg-slatey-50 dark:border-slatey-700 dark:bg-slatey-900 dark:text-slatey-100"
      >
        <div className="flex items-center gap-2 truncate">
          <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-brand-50 text-brand-600 dark:bg-brand-950/50">
            <Store className="h-4 w-4" />
          </div>
          <div className="text-left truncate">
            <span className="block text-xs font-bold text-slatey-900 dark:text-white truncate max-w-[160px]">
              {currentActiveName}
            </span>
            <span className="block text-[10px] text-emerald-600 font-medium">
              ● Active / Registered
            </span>
          </div>
        </div>
        <ChevronDown className="h-4 w-4 text-slatey-400 shrink-0" />
      </button>

      {isOpen && (
        <div className="absolute left-0 top-full z-50 mt-2 w-72 rounded-2xl border border-slatey-100 bg-white p-2 shadow-2xl dark:border-slatey-800 dark:bg-slatey-900">
          <div className="px-3 py-2 text-[10px] font-bold uppercase tracking-wider text-slatey-400 border-b border-slatey-100 dark:border-slatey-800 mb-1">
            Google Business Profiles
          </div>

          <div className="max-h-64 overflow-y-auto space-y-1">
            {combinedOutlets.map((item) => {
              const isCurrent = item.isRegistered && item.id === outlet?.id
              return (
                <div
                  key={item.id}
                  onClick={() => handleSelect(item)}
                  className={`flex cursor-pointer items-center justify-between rounded-xl px-3 py-2 text-xs transition ${
                    isCurrent
                      ? 'bg-brand-50/80 text-brand-900 font-bold dark:bg-brand-950/40 dark:text-brand-200'
                      : 'hover:bg-slatey-50 text-slatey-700 dark:hover:bg-slatey-800 dark:text-slatey-300'
                  }`}
                >
                  <div className="flex flex-col truncate pr-2">
                    <span className="font-semibold text-slatey-900 dark:text-white truncate">
                      {item.name}
                    </span>
                    <span className={`text-[10px] font-medium flex items-center gap-1 ${item.statusColor}`}>
                      <span>●</span> {item.statusLabel}
                    </span>
                  </div>
                  {isCurrent && <Check className="h-4 w-4 text-brand-600 shrink-0" />}
                </div>
              )
            })}
          </div>
        </div>
      )}

      {showSubscriptionModal && subscriptionModalLocation && (
        <OutletSubscriptionModal
          isOpen={showSubscriptionModal}
          location={subscriptionModalLocation}
          user={user}
          onClose={() => setShowSubscriptionModal(false)}
          onSuccess={() => {
            setShowSubscriptionModal(false)
          }}
        />
      )}

      <NoGmbModal
        isOpen={noGmbFound}
        onClose={() => setNoGmbFound(false)}
        onTryAnotherAccount={handleConnectGoogleAnother}
      />
    </div>
  )

  function handleConnectGoogleAnother() {
    setNoGmbFound(false)
    handleConnectAnotherGoogle()
  }
}
