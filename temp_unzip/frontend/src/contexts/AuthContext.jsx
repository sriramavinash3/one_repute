import { createContext, useContext, useEffect, useMemo, useState } from 'react'
import { onAuthStateChanged, signInWithEmailAndPassword, signOut } from 'firebase/auth'
import { doc, getDoc, setDoc } from 'firebase/firestore'
import { auth, db } from '../firebase/firebase'
import useAppStore from '../store/appStore'

const AuthContext = createContext(null)

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null)
  const [profile, setProfile] = useState(null)
  const [outlet, setOutlet] = useState(null)
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
          
          // Verify if user already exists in 'users' collection
          const profileRef = doc(db, 'users', currentUser.uid)
          const profileSnap = await getDoc(profileRef)

          if (profileSnap.exists()) {
            const currentProfile = { id: profileSnap.id, ...profileSnap.data() }
            setUser(currentUser)
            setProfile(currentProfile)
            console.debug('[AuthContext] loaded profile', currentProfile)
            setUserState(currentUser)
            setProfileState(currentProfile)
          } else {
            // Create a new default profile for the onboarding flow
            const newProfile = {
              email: currentUser.email,
              role: 'outlet',
              isSetupComplete: false,
              createdAt: new Date()
            }
            
            // We use setDoc here to explicitly create the document with the user's UID
            await setDoc(profileRef, newProfile)
            newProfile.id = currentUser.uid
            
            setUser(currentUser)
            setProfile(newProfile)
            setUserState(currentUser)
            setProfileState(newProfile)
          }
        } else {
          setUser(null)
          setProfile(null)
          setOutlet(null)
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
        const outletRef = doc(db, 'outlets', profile.outletId)
        const snapshot = await getDoc(outletRef)
        if (snapshot.exists()) {
          const outletData = { id: snapshot.id, ...snapshot.data() }
          setOutlet(outletData)
          setOutletState(outletData)
        } else {
          setOutlet(null)
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
      loading,
      outletLoading,
      authError,
      needsGoogleConnect:
        profile?.role === 'outlet' && (!profile?.outletId || !outlet?.googleRefreshToken),
      signIn: (email, password) => signInWithEmailAndPassword(auth, email, password),
      signOut: () => signOut(auth)
    }),
    [user, profile, outlet, loading, outletLoading, authError]
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth() {
  return useContext(AuthContext)
}
