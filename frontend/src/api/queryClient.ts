import { QueryClient } from '@tanstack/react-query'

// App-wide QueryClient. Kept in its own module (not main.tsx) so main.tsx and
// contexts (AuthContext) can both import it without a circular
// main.tsx → App → AuthContext → main.tsx dependency.
export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 5 * 60 * 1000, // 5 min
      retry: 1,
    },
  },
})
