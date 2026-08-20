import { createContext, useContext, useEffect, useMemo, useState } from 'react'
import { onAuthStateChanged, signInWithEmailAndPassword, signOut } from 'firebase/auth'
import { doc, getDoc, setDoc } from 'firebase/firestore'
import { auth, db } from '../firebase/firebase'
import useAppStore from '../store/appStore'

const AuthContext = createContext(null)

const ADMIN_EMAIL = 'admin@onerepute.com'

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null)
  const [profile, setProfile] = useState(null)
  const [outlet, setOutlet] = useState(null)
  const [outlets, setOutlets] = useState([])
  const [loading, setLoading] = useState(true)
  const [outletLoading, setOutletLoading] = useState(true)
  const [authError, setAuthError] = useState(null)
  const setUserState = useAppStore((state) => state.setUser)
  const setProfileState = useAppStore((state) => state.setProfile)
  const setOutletState = useAppStore((state) => state.setOutlet)

  const [accessibleGbpLocations, setAccessibleGbpLocations] = useState([])
  const [noGmbFound, setNoGmbFound] = useState(false)

  // Helper to fetch all active or valid outlets belonging to current user
  const fetchUserOutlets = async (userObj = user, profileObj = profile) => {
    const targetUid = userObj?.uid || user?.uid
    const targetCustId = profileObj?.customerId || profile?.customerId
    if (!targetUid && !targetCustId) return []
    const { collection, query, where, getDocs } = await import('firebase/firestore')
    const outletsMap = new Map()

    try {
      // 1. Fetch by customerId if available (fetching all non-deleted outlets)
      if (targetCustId) {
        const qCust = query(
          collection(db, 'outlets'),
          where('customerId', '==', targetCustId)
        )
        const snapCust = await getDocs(qCust)
        snapCust.docs.forEach(d => outletsMap.set(d.id, { id: d.id, ...d.data() }))
      }

      // 2. Fetch by ownerId if user UID is available
      if (targetUid) {
        const qOwner = query(
          collection(db, 'outlets'),
          where('ownerId', '==', targetUid)
        )
        const snapOwner = await getDocs(qOwner)
        snapOwner.docs.forEach(d => outletsMap.set(d.id, { id: d.id, ...d.data() }))
      }
    } catch (err) {
      console.warn('[AuthContext] Error querying outlets collection:', err)
    }

    return Array.from(outletsMap.values()).filter(
      o => o.isDeleted !== true && o.status !== 'removed' && o.status !== 'deleted'
    )
  }

  const resolveActiveOutlet = async (fetchedOutlets, targetOutletId = null, profileObj = profile, userObj = user) => {
    const uid = userObj?.uid || user?.uid
    const userScopedSavedId = uid && typeof window !== 'undefined' ? localStorage.getItem(`activeOutletId_${uid}`) : null
    const globalSavedId = typeof window !== 'undefined' ? localStorage.getItem('selectedOutletId') : null

    const preferredId = targetOutletId || userScopedSavedId || globalSavedId || profileObj?.activeOutletId || profileObj?.outletId

    let selected = null
    if (preferredId) {
      selected = fetchedOutlets.find(o => o.id === preferredId) || null

      // If preferred outlet was not in bulk query results, attempt direct validation fetch from Firestore
      if (!selected) {
        try {
          const { doc, getDoc } = await import('firebase/firestore')
          const snap = await getDoc(doc(db, 'outlets', preferredId))
          if (snap.exists()) {
            const data = snap.data()
            const isOwner = uid && (data.ownerId === uid || data.userId === uid || data.createdBy === uid)
            const isCust = profileObj?.customerId && data.customerId === profileObj.customerId
            const isUserOutlet = profileObj?.outletId === preferredId || profileObj?.activeOutletId === preferredId
            const isValid = data.isDeleted !== true && data.status !== 'removed' && data.status !== 'deleted'

            if ((isOwner || isCust || isUserOutlet) && isValid) {
              selected = { id: snap.id, ...data }
              fetchedOutlets.push(selected)
            }
          }
        } catch (e) {
          console.warn('[AuthContext] Direct outlet lookup/validation failed for:', preferredId, e)
        }
      }
    }

    // Safely clear invalid saved selection if preferredId was deleted or access was revoked
    if (!selected) {
      if (preferredId && typeof window !== 'undefined') {
        localStorage.removeItem('selectedOutletId')
        if (uid) localStorage.removeItem(`activeOutletId_${uid}`)
      }
      // Require user to choose or default to first valid available outlet
      if (fetchedOutlets.length > 0) {
        selected = fetchedOutlets[0]
      }
    }

    // Authoritative fresh update: fetch latest backend document for selected outlet to prevent stale cached data
    if (selected) {
      try {
        const { doc, getDoc } = await import('firebase/firestore')
        const freshSnap = await getDoc(doc(db, 'outlets', selected.id))
        if (freshSnap.exists() && freshSnap.data()?.isDeleted !== true && freshSnap.data()?.status !== 'removed') {
          selected = { id: freshSnap.id, ...freshSnap.data() }
        }
      } catch (e) {
        console.warn('[AuthContext] Re-fetching latest outlet details failed:', e)
      }

      if (typeof window !== 'undefined') {
        localStorage.setItem('selectedOutletId', selected.id)
        if (uid) localStorage.setItem(`activeOutletId_${uid}`, selected.id)
      }

      // Sync Firestore profile activeOutletId if missing or mismatched
      if (uid && (profileObj?.activeOutletId !== selected.id || profileObj?.outletId !== selected.id)) {
        try {
          const { doc, setDoc } = await import('firebase/firestore')
          const userRef = doc(db, 'users', uid)
          await setDoc(userRef, { outletId: selected.id, activeOutletId: selected.id }, { merge: true })
        } catch (err) {
          console.warn('[AuthContext] Failed to persist active outlet ID to user profile:', err)
        }
      }
    }

    return { selected, allOutlets: fetchedOutlets }
  }

  const loadOutletForProfile = async (userObj, profileObj, targetOutletId = null) => {
    if (profileObj?.role === 'admin') {
      console.debug('[AuthContext] skipping outlet load - role is admin:', profileObj?.role)
      setOutlet(null)
      setOutletState(null)
      setOutlets([])
      setOutletLoading(false)
      return
    }

    setOutletLoading(true)
    try {
      const fetchedOutlets = await fetchUserOutlets(userObj, profileObj)
      const uid = userObj?.uid || user?.uid
      const userScopedSavedId = uid && typeof window !== 'undefined' ? localStorage.getItem(`activeOutletId_${uid}`) : null
      const globalSavedId = typeof window !== 'undefined' ? localStorage.getItem('selectedOutletId') : null
      const targetId = targetOutletId || userScopedSavedId || globalSavedId || profileObj?.activeOutletId || profileObj?.outletId

      const { selected, allOutlets } = await resolveActiveOutlet(fetchedOutlets, targetId, profileObj, userObj)
      
      setOutlets(allOutlets)

      const gbpMap = new Map()
      allOutlets.forEach(o => {
        if (Array.isArray(o.googleLocations)) {
          o.googleLocations.forEach(loc => {
            if (loc && (loc.id || loc.placeId)) {
              gbpMap.set(loc.id || loc.placeId, loc)
            }
          })
        }
      })
      setAccessibleGbpLocations(Array.from(gbpMap.values()))

      if (selected) {
        console.debug('[AuthContext] loadOutlet active outlet:', selected.id)
        setOutlet(selected)
        setOutletState(selected)
      } else {
        setOutlet(null)
        setOutletState(null)
      }
    } catch (err) {
      console.warn('[AuthContext] error loading outlet for profile:', err)
      setOutlet(null)
      setOutletState(null)
    } finally {
      setOutletLoading(false)
    }
  }

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (currentUser) => {
      try {
        if (currentUser) {
          setAuthError(null)
          
          const isAdminEmail = (currentUser.email || '').toLowerCase() === ADMIN_EMAIL.toLowerCase();

          // Verify if user already exists in 'users' collection
          const profileRef = doc(db, 'users', currentUser.uid)
          const profileSnap = await getDoc(profileRef)

          let currentProfile;
          if (profileSnap.exists()) {
            currentProfile = { id: profileSnap.id, ...profileSnap.data() }
            try {
              const tokenResult = await currentUser.getIdTokenResult();
              if (tokenResult.claims.role) {
                currentProfile.role = tokenResult.claims.role;
              }
            } catch (err) {
              console.warn('[AuthContext] Failed to fetch token claims', err);
            }
          } else {
            currentProfile = {
              email: currentUser.email,
              role: isAdminEmail ? 'admin' : 'outlet',
              isSetupComplete: isAdminEmail ? true : false,
              createdAt: new Date()
            }
            await setDoc(profileRef, currentProfile)
            currentProfile.id = currentUser.uid
          }

          // Single Administrator Policy: Only admin@onerepute.com is admin
          if (isAdminEmail) {
            currentProfile.role = 'admin';
            currentProfile.isSetupComplete = true;
          } else if (currentProfile.role === 'admin' || currentProfile.role === 'ADMIN' || currentProfile.role === 'SUPER_ADMIN') {
            currentProfile.role = 'outlet';
          }

          setUser(currentUser)
          setProfile(currentProfile)
          console.debug('[AuthContext] loaded profile', currentProfile)
          setUserState(currentUser)
          setProfileState(currentProfile)

          // Await active outlet resolution before marking overall auth loading complete
          await loadOutletForProfile(currentUser, currentProfile)
        } else {
          setUser(null)
          setProfile(null)
          setOutlet(null)
          setOutlets([])
          setUserState(null)
          setProfileState(null)
          setOutletState(null)
          setOutletLoading(false)
        }
      } catch (error) {
        console.error('AUTH_ERROR', error)
        setAuthError('Authentication verification failed.')
        await signOut(auth)
        setUserState(null)
        setProfileState(null)
        setOutletState(null)
        setOutletLoading(false)
      } finally {
        setLoading(false)
      }
    })
    

    return () => unsubscribe()
  }, [])

  const refreshUserAndOutlets = async (targetOutletId = null) => {
    if (!user?.uid && !profile?.customerId) return
    await loadOutletForProfile(user, profile, targetOutletId)
  }

  const switchOutlet = async (newOutletId) => {
    if (!newOutletId) return
    console.debug('[AuthContext] Switching outlet from', outlet?.id, 'to', newOutletId)

    setOutletLoading(true)

    if (typeof window !== 'undefined') {
      localStorage.setItem('selectedOutletId', newOutletId)
      if (user?.uid) {
        localStorage.setItem(`activeOutletId_${user.uid}`, newOutletId)
      }
    }

    useAppStore.getState().clearOutletData()

    let target = outlets.find(o => o.id === newOutletId) || null

    try {
      const { doc, getDoc } = await import('firebase/firestore')
      const outletRef = doc(db, 'outlets', newOutletId)
      const snap = await getDoc(outletRef)
      if (snap.exists() && snap.data()?.isDeleted !== true && snap.data()?.status !== 'removed') {
        target = { id: snap.id, ...snap.data() }
        setOutlets(prev => {
          const exists = prev.some(o => o.id === target.id)
          return exists ? prev.map(o => o.id === target.id ? target : o) : [...prev, target]
        })
      }
    } catch (err) {
      console.warn('[AuthContext] Failed to fetch target outlet for switch:', err)
    }

    if (target) {
      setOutlet(target)
      setOutletState(target)

      // Dispatch switch event after active outlet state has been updated to new target
      if (typeof window !== 'undefined') {
        window.dispatchEvent(
          new CustomEvent('switch-outlet-start', {
            detail: { newOutletId, targetName: target?.name }
          })
        )
      }

      if (user?.uid) {
        try {
          const { doc, setDoc } = await import('firebase/firestore')
          const userRef = doc(db, 'users', user.uid)
          await setDoc(userRef, { outletId: newOutletId, activeOutletId: newOutletId }, { merge: true })
          setProfile(prev => prev ? { ...prev, outletId: newOutletId, activeOutletId: newOutletId } : null)
        } catch (err) {
          console.warn('[AuthContext] Failed to persist switched active outlet ID', err)
        }
      }
    }

    setOutletLoading(false)
  }

  const value = useMemo(
    () => ({
      user,
      profile,
      outlet,
      outlets,
      accessibleGbpLocations,
      noGmbFound,
      setNoGmbFound,
      setAccessibleGbpLocations,
      loading,
      outletLoading,
      authError,
      switchOutlet,
      refreshUserAndOutlets,
      needsGoogleConnect:
        profile?.role === 'outlet' && (!profile?.outletId || !outlet?.googleRefreshToken),
      signIn: (email, password) => signInWithEmailAndPassword(auth, email, password),
      signOut: () => signOut(auth)
    }),
    [user, profile, outlet, outlets, accessibleGbpLocations, noGmbFound, loading, outletLoading, authError]
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}


export function useAuth() {
  return useContext(AuthContext)
}
