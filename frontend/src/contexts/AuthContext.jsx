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
          // Fetch all outlets for this customer
          const { collection, query, where, getDocs } = await import('firebase/firestore')
          const q = query(collection(db, 'outlets'), where('customerId', '==', profile.customerId))
          const querySnapshot = await getDocs(q)
          
          if (!querySnapshot.empty) {
            const fetchedOutlets = querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }))
            setOutlets(fetchedOutlets)
            
            // Set current outlet to the one matching profile.outletId, or the first one
            const currentOutlet = fetchedOutlets.find(o => o.id === profile.outletId) || fetchedOutlets[0]
            setOutlet(currentOutlet)
            setOutletState(currentOutlet)
          } else {
            setOutlets([])
            setOutlet(null)
            setOutletState(null)
          }
        } else if (profile.outletId) {
          // Fallback for older users without customerId
          const outletRef = doc(db, 'outlets', profile.outletId)
          const snapshot = await getDoc(outletRef)
          if (snapshot.exists()) {
            const outletData = { id: snapshot.id, ...snapshot.data() }
            setOutlet(outletData)
            setOutlets([outletData])
            setOutletState(outletData)
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
  }, [profile?.outletId, profile?.role])

  const value = useMemo(
    () => ({
      user,
      profile,
      outlet,
      outlets,
      loading,
      outletLoading,
      authError,
      switchOutlet: (newOutletId) => {
        const newOutlet = outlets.find(o => o.id === newOutletId);
        if (newOutlet) {
          setOutlet(newOutlet);
          setOutletState(newOutlet);
          // Optional: we could persist this to user profile as the 'active' outlet
        }
      },
      needsGoogleConnect:
        profile?.role === 'outlet' && (!profile?.outletId || !outlet?.googleRefreshToken),
      signIn: (email, password) => signInWithEmailAndPassword(auth, email, password),
      signOut: () => signOut(auth)
    }),
    [user, profile, outlet, outlets, loading, outletLoading, authError]
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth() {
  return useContext(AuthContext)
}
