import { create } from 'zustand'

const useAppStore = create((set) => ({
  user: null,
  profile: null,
  outlet: null,
  outlets: [],
  reviews: [],
  analytics: null,
  loadingStates: {},
  errors: {},
  setUser: (user) => set({ user }),
  setProfile: (profile) => set({ profile }),
  setOutlet: (outlet) => set({ outlet }),
  setOutlets: (outlets) => set({ outlets: outlets || [] }),
  setReviews: (reviews) => set({ reviews: reviews || [] }),
  setAnalytics: (analytics) => set({ analytics }),
  setLoading: (key, value) =>
    set((state) => ({
      loadingStates: { ...state.loadingStates, [key]: value }
    })),
  setError: (key, value) =>
    set((state) => ({
      errors: { ...state.errors, [key]: value }
    }))
}))

export default useAppStore
