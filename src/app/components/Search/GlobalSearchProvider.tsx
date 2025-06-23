'use client';

import { useState, useCallback, createContext, useContext } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import { SearchModal } from './SearchModal';
import { useKeyboardShortcut } from '@/lib/hooks/useKeyboardShortcut';

// Create search context
const SearchContext = createContext<{
  openSearch: () => void;
  closeSearch: () => void;
  isSearchOpen: boolean;
} | null>(null);

export function useSearch() {
  const context = useContext(SearchContext);
  if (!context) {
    throw new Error('useSearch must be used within GlobalSearchProvider');
  }
  return context;
}

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
    <SearchContext.Provider value={{ openSearch, closeSearch, isSearchOpen }}>
      {children}
      <SearchModal 
        isOpen={isSearchOpen} 
        onClose={closeSearch}
      />
    </SearchContext.Provider>
  );
}