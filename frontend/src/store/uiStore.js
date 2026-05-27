import { create } from 'zustand'

const useUiStore = create((set) => ({
  sidebarOpen: false,
  setSidebarOpen: (value) => set({ sidebarOpen: value })
}))

export default useUiStore
