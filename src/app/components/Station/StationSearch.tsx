'use client';

import { useState, useEffect, useRef } from 'react';
import { Search, X } from 'lucide-react';
import { useStations } from '@/lib/hooks/useStations';
import { Station } from '@/types';
import { cn, debounce } from '@/lib/utils';
import { LoadingSpinner } from '../UI/LoadingSpinner';

interface StationSearchProps {
  onSelect: (station: Station) => void;
  placeholder?: string;
  value?: Station | null;
  className?: string;
  /** id for the text input, so a page <label htmlFor> can name it. */
  inputId?: string;
}

export function StationSearch({ 
  onSelect, 
  placeholder = 'Állomás keresése...', 
  value,
  className,
  inputId
}: StationSearchProps) {
  const [search, setSearch] = useState(value?.name || '');
  const [isOpen, setIsOpen] = useState(false);
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const { data: stations, isLoading } = useStations(debouncedSearch);

  // Debounce search input
  useEffect(() => {
    const handler = debounce(() => {
      setDebouncedSearch(search);
    }, 300);
    
    handler();
  }, [search]);

  // Handle clicks outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (
        dropdownRef.current && 
        !dropdownRef.current.contains(event.target as Node) &&
        inputRef.current &&
        !inputRef.current.contains(event.target as Node)
      ) {
        setIsOpen(false);
      }
    }

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Update input when value changes
  useEffect(() => {
    setSearch(value?.name || '');
  }, [value]);

  const handleSelect = (station: Station) => {
    setSearch(station.name);
    onSelect(station);
    setIsOpen(false);
  };

  const handleClear = () => {
    setSearch('');
    setDebouncedSearch('');
    onSelect(null as any);
    inputRef.current?.focus();
  };

  return (
    <div className={cn('relative', className)}>
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
        <input
          ref={inputRef}
          id={inputId}
          type="text"
          // Named by the page's <label> when inputId is given; otherwise by this.
          aria-label={inputId ? undefined : 'Állomás keresése'}
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          onFocus={() => setIsOpen(true)}
          placeholder={placeholder}
          className="w-full pl-10 pr-10 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
        />
        {search && (
          <button
            type="button"
            onClick={handleClear}
            aria-label="Állomás törlése"
            className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-gray-500 hover:text-gray-700 rounded focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
          >
            <X className="h-4 w-4" />
          </button>
        )}
      </div>

      {isOpen && (search || debouncedSearch) && (
        <div 
          ref={dropdownRef}
          className="absolute z-10 w-full mt-1 bg-white border border-gray-200 rounded-lg shadow-lg max-h-60 overflow-auto"
        >
          {isLoading ? (
            <div className="p-4">
              <LoadingSpinner size="sm" />
            </div>
          ) : stations && stations.length > 0 ? (
            <ul>
              {stations.map((station) => (
                <li key={station.id}>
                  <button
                    type="button"
                    onClick={() => handleSelect(station)}
                    className="w-full px-4 py-2 text-left hover:bg-gray-50 focus:bg-gray-50 focus:outline-none"
                  >
                    <div className="font-medium">{station.name}</div>
                    {station.services && station.services.length > 0 && (
                      <div className="text-xs text-gray-500">
                        {station.services.join(', ')}
                      </div>
                    )}
                  </button>
                </li>
              ))}
            </ul>
          ) : (
            <div className="p-4 text-center text-gray-500">
              Nincs találat
            </div>
          )}
        </div>
      )}
    </div>
  );
}