'use client';

import { QueryClientProvider } from '@tanstack/react-query';
import { ReactQueryDevtools } from '@tanstack/react-query-devtools';
import { queryClient } from '@/lib/api/client';
import { ReactNode } from 'react';
import { GlobalSearchProvider } from '@/app/components/Search/GlobalSearchProvider';

export function Providers({ children }: { children: ReactNode }) {
  return (
    <QueryClientProvider client={queryClient}>
      <GlobalSearchProvider>
        {children}
        <ReactQueryDevtools initialIsOpen={false} />
      </GlobalSearchProvider>
    </QueryClientProvider>
  );
}