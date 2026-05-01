/**
 * lib/queryClient.ts
 * Centralised React Query client.
 * Drop-in replacement — update App.tsx to use this.
 */

import { QueryClient } from '@tanstack/react-query';

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime:          1000 * 60 * 2,   // data fresh for 2 min
      gcTime:             1000 * 60 * 10,  // cache kept for 10 min
      retry:              2,
      retryDelay:         (attempt) => Math.min(1000 * 2 ** attempt, 10_000),
      refetchOnWindowFocus: false,
      refetchOnReconnect: true,
    },
    mutations: {
      retry: 1,
    },
  },
});