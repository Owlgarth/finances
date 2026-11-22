import React from 'react'
import ReactDOM from 'react-dom/client'
import { QueryClientProvider } from '@tanstack/react-query'
import { Toaster } from 'react-hot-toast'
import './i18n'
import App from './App.tsx'
import { queryClient } from './api/queryClient'
import './index.css'
import { applyZoomLock, isZoomDisabled } from './utils/zoomLock'

// One-time cleanup of legacy offline storage (can be removed after a few releases)
localStorage.removeItem('offline_sync_queue')
localStorage.removeItem('offline_display_cache')

// Re-apply the stored zoom preference before first paint (same idea as the
// theme FOUC script: the DOM changes live outside React).
applyZoomLock(isZoomDisabled())

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <QueryClientProvider client={queryClient}>
      <App />
      {/* z-index 600 is the semantic toast tier (index.css @utility z-toast):
          inline here because the library's own default (9999) is also inline
          and would sit above the tooltip tier, off the scale. Stacks above
          open sheets (z-modal 510). On phones the container must clear the
          fixed bottom nav + FAB + safe-area inset (MainLayout's bottom
          padding expression) so the Undo action stays tappable; an
          !important stylesheet declaration beats the library's inline 16px
          offset, and max-sm keeps the desktop offset unchanged. */}
      <Toaster
        position="bottom-center"
        containerStyle={{ zIndex: 600 }}
        containerClassName="max-sm:bottom-[calc(4.5rem+env(safe-area-inset-bottom))]!"
      />
    </QueryClientProvider>
  </React.StrictMode>,
)
