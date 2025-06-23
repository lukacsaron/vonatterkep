'use client';

import { useState, useCallback } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import { SearchModal } from './SearchModal';
import { useKeyboardShortcut } from '@/lib/hooks/useKeyboardShortcut';

export function GlobalSearchProvider({ children }: { children: React.ReactNode }) {
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const router = useRouter();
  const pathname = usePathname();

  const openSearch = useCallback(() => {
    setIsSearchOpen(true);
  }, []);

  const closeSearch = useCallback(() => {
    setIsSearchOpen(false);
    // If we're on the search page, navigate back to map
    if (pathname === '/search') {
      router.push('/');
    }
  }, [pathname, router]);

  // Handle Cmd+K shortcut (Mac)
  useKeyboardShortcut(
    { key: 'k', metaKey: true },
    openSearch
  );

  // Handle Ctrl+K shortcut (Windows/Linux)
  useKeyboardShortcut(
    { key: 'k', ctrlKey: true },
    openSearch
  );

  return (
    <>
      {children}
      <SearchModal 
        isOpen={isSearchOpen} 
        onClose={closeSearch}
      />
    </>
  );
}