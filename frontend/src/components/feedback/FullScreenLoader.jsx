export default function FullScreenLoader() {
  return (
    <div className="flex min-h-screen items-center justify-center">
      <div className="flex items-center gap-3 rounded-full border border-slatey-200 bg-white/80 px-6 py-3 text-sm text-slatey-600 shadow-sm">
        <span className="h-2 w-2 animate-pulse rounded-full bg-brand-500" />
        Loading workspace
      </div>
    </div>
  )
}
