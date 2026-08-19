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
  const [outletLoading, setOutletLoading] = useState(false)
  const [authError, setAuthError] = useState(null)
  const setUserState = useAppStore((state) => state.setUser)
  const setProfileState = useAppStore((state) => state.setProfile)
  const setOutletState = useAppStore((state) => state.setOutlet)

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
        } else {
          setUser(null)
          setProfile(null)
          setOutlet(null)
          setOutlets([])
          setUserState(null)
          setProfileState(null)
          setOutletState(null)
        }
      } catch (error) {
        console.error('AUTH_ERROR', error)
        setAuthError('Authentication verification failed.')
        await signOut(auth)
        setUserState(null)
        setProfileState(null)
        setOutletState(null)
      } finally {
        setLoading(false)
      }
    })
    

    return () => unsubscribe()
  }, [])

  const [accessibleGbpLocations, setAccessibleGbpLocations] = useState([])
  const [noGmbFound, setNoGmbFound] = useState(false)

  const refreshUserAndOutlets = async () => {
    if (!profile?.customerId && !profile?.outletId) return
    try {
      const { collection, query, where, getDocs } = await import('firebase/firestore')
      let q
      if (profile.customerId) {
        q = query(
          collection(db, 'outlets'),
          where('customerId', '==', profile.customerId),
          where('status', '==', 'active')
        )
      } else {
        q = query(
          collection(db, 'outlets'),
          where('ownerId', '==', user.uid),
          where('status', '==', 'active')
        )
      }
      const querySnapshot = await getDocs(q)
      if (!querySnapshot.empty) {
        const fetchedOutlets = querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }))
        setOutlets(fetchedOutlets)
        
        // Accumulate accessible GMB locations across outlets
        const gbpMap = new Map()
        fetchedOutlets.forEach(o => {
          if (Array.isArray(o.googleLocations)) {
            o.googleLocations.forEach(loc => {
              if (loc && (loc.id || loc.placeId)) {
                gbpMap.set(loc.id || loc.placeId, loc)
              }
            })
          }
        })
        setAccessibleGbpLocations(Array.from(gbpMap.values()))

        const currentOutlet = fetchedOutlets.find(o => o.id === profile.outletId) || fetchedOutlets[0]
        setOutlet(currentOutlet || null)
        setOutletState(currentOutlet || null)
      }
    } catch (err) {
      console.warn('[AuthContext] error refreshing outlets:', err)
    }
  }

  useEffect(() => {
    const loadOutlet = async () => {
      if (!profile?.outletId || profile.role !== 'outlet') {
        console.debug('[AuthContext] skipping outlet load - profile:', { outletId: profile?.outletId, role: profile?.role })
        setOutlet(null)
        setOutletLoading(false)
        return
      }

      setOutletLoading(true)
      try {
        if (profile.customerId) {
          // Fetch only ACTIVE outlets for this customer
          const { collection, query, where, getDocs } = await import('firebase/firestore')
          const q = query(
            collection(db, 'outlets'),
            where('customerId', '==', profile.customerId),
            where('status', '==', 'active')
          )
          const querySnapshot = await getDocs(q)
          
          if (!querySnapshot.empty) {
            const fetchedOutlets = querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }))
            setOutlets(fetchedOutlets)

            const gbpMap = new Map()
            fetchedOutlets.forEach(o => {
              if (Array.isArray(o.googleLocations)) {
                o.googleLocations.forEach(loc => {
                  if (loc && (loc.id || loc.placeId)) {
                    gbpMap.set(loc.id || loc.placeId, loc)
                  }
                })
              }
            })
            setAccessibleGbpLocations(Array.from(gbpMap.values()))

            const currentOutlet = fetchedOutlets.find(o => o.id === profile.outletId) || fetchedOutlets[0]
            setOutlet(currentOutlet || null)
            setOutletState(currentOutlet || null)
          } else {
            setOutlets([])
            setOutlet(null)
            setOutletState(null)
          }
        } else if (profile.outletId) {
          const outletRef = doc(db, 'outlets', profile.outletId)
          const snapshot = await getDoc(outletRef)
          const outletData = snapshot.exists() ? snapshot.data() : null
          if (outletData && outletData.status === 'active' && outletData.isDeleted !== true) {
            const active = { id: snapshot.id, ...outletData }
            setOutlet(active)
            setOutlets([active])
            setOutletState(active)

            if (Array.isArray(outletData.googleLocations)) {
              setAccessibleGbpLocations(outletData.googleLocations)
            }
          } else {
            setOutlet(null)
            setOutlets([])
            setOutletState(null)
          }
        } else {
          setOutlet(null)
          setOutlets([])
          setOutletState(null)
        }
      } finally {
        setOutletLoading(false)
      }
    }

    loadOutlet()
  }, [profile?.outletId, profile?.role, profile?.customerId])

  const switchOutlet = async (newOutletId) => {
    const newOutlet = outlets.find(o => o.id === newOutletId);
    if (newOutlet) {
      setOutlet(newOutlet);
      setOutletState(newOutlet);
      if (user?.uid) {
        try {
          const userRef = doc(db, 'users', user.uid);
          await setDoc(userRef, { outletId: newOutletId }, { merge: true });
          setProfile(prev => prev ? { ...prev, outletId: newOutletId } : null);
        } catch (err) {
          console.warn('[AuthContext] Failed to persist switched active outlet ID', err);
        }
      }
    }
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
