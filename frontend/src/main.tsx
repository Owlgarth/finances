import React from 'react'
import ReactDOM from 'react-dom/client'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { Toaster } from 'react-hot-toast'
import App from './App.tsx'
import './index.css'
import { applyZoomLock, isZoomDisabled } from './utils/zoomLock'

// One-time cleanup of legacy offline storage (can be removed after a few releases)
localStorage.removeItem('offline_sync_queue')
localStorage.removeItem('offline_display_cache')

// Re-apply the stored zoom preference before first paint (same idea as the
// theme FOUC script: the DOM changes live outside React).
applyZoomLock(isZoomDisabled())

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 5 * 60 * 1000, // 5 min
      retry: 1,
    },
  },
})

export { queryClient }

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <QueryClientProvider client={queryClient}>
      <App />
      <Toaster position="bottom-center" />
    </QueryClientProvider>
  </React.StrictMode>,
)
