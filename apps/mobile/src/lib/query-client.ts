import { QueryClient } from '@tanstack/react-query';

export function createAppQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: {
        gcTime: 1000 * 60 * 30,
        retry: 1,
        staleTime: 1000 * 60,
      },
      mutations: {
        retry: 0,
      },
    },
  });
}
