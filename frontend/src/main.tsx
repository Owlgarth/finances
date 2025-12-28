import React from 'react'
import ReactDOM from 'react-dom/client'
import { QueryClient } from '@tanstack/react-query'
import { PersistQueryClientProvider } from '@tanstack/react-query-persist-client'
import { del, get, set } from 'idb-keyval'
import { Toaster } from 'react-hot-toast'
import { initializeOfflineInterceptors } from './api/client'
import App from './App.tsx'
import './index.css'

// Configure QueryClient with defaults optimized for offline usage
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      // Cache data for 24 hours
      gcTime: 1000 * 60 * 60 * 24,
      // Keep data fresh for 5 minutes
      staleTime: 1000 * 60 * 5,
      // Retry failed requests
      retry: 3,
      retryDelay: (attemptIndex) => Math.min(1000 * 2 ** attemptIndex, 30000),
      // Refetch on window focus only when online
      refetchOnWindowFocus: (query) => {
        return navigator.onLine && query.state.dataUpdateCount === 0
      },
      // Refetch on mount if data is stale
      refetchOnMount: true,
      // Refetch on reconnect
      refetchOnReconnect: true,
    },
  },
})

// Initialize offline interceptors with QueryClient
initializeOfflineInterceptors(queryClient)

// Create persister using IndexedDB via idb-keyval
const persister = {
  persistClient: async (client: any) => {
    await set('monie-cache', client)
  },
  restoreClient: async () => {
    return await get('monie-cache')
  },
  removeClient: async () => {
    await del('monie-cache')
  },
}

// Export queryClient and persister for use in auth context
export { queryClient, persister }

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <PersistQueryClientProvider
      client={queryClient}
      persistOptions={{
        persister,
        maxAge: 1000 * 60 * 60 * 24, // 24 hours
        buster: '1.0', // Increment this to invalidate all cached data
      }}
    >
      <App />
      <Toaster position="top-right" />
    </PersistQueryClientProvider>
  </React.StrictMode>,
)