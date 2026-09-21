'use client';

import { QueryClientProvider } from '@tanstack/react-query';
import { queryClient } from '@/lib/api/client';
import { ReactNode, useState, useEffect } from 'react';
import { GlobalSearchProvider } from '@/app/components/Search/GlobalSearchProvider';
import { ConsentProvider } from '@/app/components/Consent/ConsentProvider';

// Dynamic DevTools component
function DevTools() {
  const [DevToolsComponent, setDevToolsComponent] = useState<React.ComponentType<any> | null>(null);

  useEffect(() => {
    // Only load DevTools in development
    if (process.env.NODE_ENV === 'development') {
      import('@tanstack/react-query-devtools').then(({ ReactQueryDevtools }) => {
        setDevToolsComponent(() => ReactQueryDevtools);
      });
    }
  }, []);

  if (!DevToolsComponent) {
    return null;
  }

  return <DevToolsComponent initialIsOpen={false} />;
}

export function Providers({ children }: { children: ReactNode }) {
  return (
    <QueryClientProvider client={queryClient}>
      <ConsentProvider>
        <GlobalSearchProvider>
          {children}
          <DevTools />
        </GlobalSearchProvider>
      </ConsentProvider>
    </QueryClientProvider>
  );
}