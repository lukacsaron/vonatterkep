'use client';

import { useState, useRef, useEffect, useCallback, useId } from 'react';
import { useRouter } from 'next/navigation';
import { Search, Train, MapPin, ArrowRight, X } from 'lucide-react';
import { useGlobalSearch, SearchItem } from '@/lib/hooks/useGlobalSearch';
import { useMapStore } from '@/lib/store';
import { cn, formatDelay, formatTime } from '@/lib/utils';
import { useFocusTrap, useRestoreFocus } from '@/app/components/UI/focus';

interface SearchModalProps {
  isOpen: boolean;
  onClose: () => void;
}

const getTrainIcon = (trainNumber: string) => {
  if (trainNumber.includes('IC') || trainNumber.includes('InterCity')) {
    return '🚄';
  }
  if (trainNumber.includes('S') || trainNumber.includes('suburban')) {
    return '🚊';
  }
  return '🚂';
};

const getDelayColor = (delay: number) => {
  if (delay <= 4) return 'text-green-700';
  if (delay <= 14) return 'text-yellow-700';
  if (delay <= 59) return 'text-orange-700';
  return 'text-red-700';
};

const getDelayDotColor = (delay: number) => {
  if (delay <= 4) return 'bg-green-500';
  if (delay <= 14) return 'bg-yellow-500';
  if (delay <= 59) return 'bg-orange-500';
  return 'bg-red-500';
};

export function SearchModal({ isOpen, onClose }: SearchModalProps) {
  const [query, setQuery] = useState('');
  const [selectedIndex, setSelectedIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const resultsRef = useRef<HTMLDivElement>(null);
  const dialogRef = useRef<HTMLDivElement>(null);
  const baseId = useId();
  const titleId = `${baseId}-title`;
  const listboxId = `${baseId}-results`;
  const optionId = (index: number) => `${baseId}-option-${index}`;
  const router = useRouter();

  const { sections, items, isLoading, hasQuery } = useGlobalSearch(query);
  const { zoomToTrain } = useMapStore();

  // Must come before the effect that focuses the input (see useRestoreFocus).
  useRestoreFocus(isOpen, dialogRef);
  useFocusTrap(dialogRef, isOpen);

  const selectItem = useCallback((item: SearchItem) => {
    switch (item.kind) {
      case 'station':
        router.push(`/stations/${encodeURIComponent(item.station.id)}`);
        break;
      case 'arrival':
        zoomToTrain(item.arrival.train);
        break;
      case 'train':
        zoomToTrain(item.train);
        break;
    }
    onClose();
  }, [router, zoomToTrain, onClose]);

  // Focus input when modal opens
  useEffect(() => {
    if (isOpen && inputRef.current) {
      inputRef.current.focus();
      setQuery('');
      setSelectedIndex(0);
    }
  }, [isOpen]);

  // Reset selected index when results change
  useEffect(() => {
    setSelectedIndex(0);
  }, [items]);

  // Escape closes the dialog wherever focus is inside it.
  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  // Arrow keys and Enter belong to the search box (combobox). Handling them on
  // the document swallowed Enter on the close button. Navigation runs over the
  // flat `items` list, so it crosses section headings without stopping on them.
  const handleInputKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault();
        setSelectedIndex(prev => Math.min(prev + 1, items.length - 1));
        break;
      case 'ArrowUp':
        e.preventDefault();
        setSelectedIndex(prev => Math.max(prev - 1, 0));
        break;
      case 'Enter':
        if (items[selectedIndex]) {
          e.preventDefault();
          selectItem(items[selectedIndex]);
        }
        break;
    }
  };

  // Scroll selected item into view
  useEffect(() => {
    const selected = resultsRef.current?.querySelector('[data-selected="true"]');
    selected?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }, [selectedIndex]);

  if (!isOpen) return null;

  const showResults = items.length > 0;
  const statusMessage = isLoading && hasQuery
    ? 'Keresés folyamatban'
    : hasQuery && items.length === 0
      ? 'Nincs találat'
      : showResults
        ? `${items.length} találat`
        : '';

  const renderItem = (item: SearchItem, index: number) => {
    const isSelected = index === selectedIndex;
    const common = {
      id: optionId(index),
      role: 'option' as const,
      'aria-selected': isSelected,
      'data-selected': isSelected,
      onClick: () => selectItem(item),
      className: cn(
        'w-full p-4 text-left hover:bg-gray-50 border-b border-gray-100 last:border-b-0 transition-colors cursor-pointer',
        isSelected && 'bg-blue-50 border-blue-200'
      ),
    };

    if (item.kind === 'station') {
      return (
        <div key={item.key} {...common}>
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-blue-100" aria-hidden="true">
              <MapPin className="h-4 w-4 text-blue-700" />
            </div>
            <div className="flex-1 min-w-0">
              <h3 className="font-semibold text-gray-900 truncate">{item.station.name}</h3>
              <p className="text-sm text-gray-600">Állomás – menetrend</p>
            </div>
            <ArrowRight className="h-4 w-4 shrink-0 text-gray-500" aria-hidden="true" />
          </div>
        </div>
      );
    }

    if (item.kind === 'arrival') {
      const { arrival } = item;
      const trainLabel = arrival.train.trainName
        ? `${arrival.train.trainName} (${arrival.train.number})`
        : `Vonat ${arrival.train.number}`;

      return (
        <div key={item.key} {...common}>
          <div className="flex items-center gap-3">
            <div className="w-14 shrink-0 font-mono text-sm font-medium text-gray-900">
              {formatTime(arrival.time)}
            </div>
            <div className="flex-1 min-w-0">
              <h3 className="font-medium text-gray-900 truncate">{trainLabel}</h3>
              {arrival.remoteStation?.name && (
                <p className="text-sm text-gray-600 truncate">
                  {arrival.remoteStation.name} felől
                </p>
              )}
            </div>
            {arrival.delay > 0 ? (
              <span className={cn('shrink-0 text-xs font-medium', getDelayColor(arrival.delay))}>
                {formatDelay(arrival.delay)}
              </span>
            ) : (
              <span className="sr-only">Pontos</span>
            )}
          </div>
        </div>
      );
    }

    const { train } = item;
    return (
      <div key={item.key} {...common}>
        <div className="flex items-center gap-3">
          <div className="text-2xl" aria-hidden="true">
            {getTrainIcon(train.number)}
          </div>

          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1">
              <h3 className="font-semibold text-gray-900 truncate">
                {train.trainName ? `${train.trainName} (${train.number})` : `Vonat ${train.number}`}
              </h3>
              {train.delay > 0 && (
                <span className={cn('text-xs font-medium', getDelayColor(train.delay))}>
                  {formatDelay(train.delay)}
                </span>
              )}
              {train.delay <= 0 && <span className="sr-only">Pontos</span>}
            </div>

            <p className="text-sm text-gray-600 mb-1">{item.matchedText}</p>

            {item.route && (
              <div className="flex items-center gap-1 text-xs text-gray-600">
                <MapPin className="h-3 w-3" />
                <span>{item.route.from}</span>
                <span aria-hidden="true">→</span>
                <span className="sr-only">–</span>
                <span>{item.route.to}</span>
              </div>
            )}

            <div className="flex items-center gap-4 mt-2 text-xs text-gray-600">
              <div className="flex items-center gap-1">
                <Train className="h-3 w-3" />
                <span>{Math.round(train.speed)} km/h</span>
              </div>
            </div>
          </div>

          {/* Colour repeats the delay text above (or "Pontos" for screen readers). */}
          <div aria-hidden="true" className={cn('w-3 h-3 shrink-0 rounded-full', getDelayDotColor(train.delay))} />
        </div>
      </div>
    );
  };

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center pt-[15vh] px-4">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/50 backdrop-blur-sm"
        onClick={onClose}
        aria-hidden="true"
      />

      {/* Modal */}
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="relative bg-white rounded-lg shadow-xl w-full max-w-2xl max-h-[70vh] flex flex-col"
      >
        <h2 id={titleId} className="sr-only">Állomás vagy vonat keresése</h2>

        {/* Header */}
        <div className="flex items-center gap-3 p-4 border-b border-gray-200">
          <Search className="h-5 w-5 text-gray-400" />
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={handleInputKeyDown}
            placeholder="Keress állomásra, vonatszámra vagy vonatnévre..."
            aria-label="Keresés állomás, vonatszám vagy vonatnév alapján"
            role="combobox"
            aria-autocomplete="list"
            aria-expanded={showResults}
            aria-controls={showResults ? listboxId : undefined}
            aria-activedescendant={showResults && items[selectedIndex] ? optionId(selectedIndex) : undefined}
            autoComplete="off"
            className="flex-1 text-lg border-none outline-none placeholder-gray-500"
          />
          <button
            type="button"
            onClick={onClose}
            aria-label="Keresés bezárása"
            className="p-1 hover:bg-gray-100 rounded focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
          >
            <X className="h-4 w-4 text-gray-500" />
          </button>
        </div>

        {/* Announces result counts to screen readers as they change. */}
        <div className="sr-only" role="status" aria-live="polite">
          {statusMessage}
        </div>

        {/* Content */}
        <div className="flex-1 overflow-hidden">
          {isLoading && hasQuery && !showResults && (
            <div className="flex items-center justify-center py-12">
              <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-blue-600" aria-hidden="true" />
              <span className="ml-3 text-gray-500">Keresek...</span>
            </div>
          )}

          {!hasQuery && !isLoading && (
            <div className="p-8 text-center text-gray-500">
              <Train className="h-12 w-12 mx-auto mb-4 text-gray-300" />
              <h3 className="text-lg font-medium text-gray-900 mb-2">Keresés</h3>
              <p className="text-sm text-gray-500 mb-4">
                Írj be egy állomást, vonatszámot vagy vonatnevet
              </p>
              <div className="grid grid-cols-1 gap-2 text-xs text-gray-500 max-w-md mx-auto">
                <div className="flex items-center gap-2">
                  <span className="bg-gray-100 px-2 py-1 rounded font-mono">Balatonföldvár</span>
                  <span>Állomás és az érkező vonatai</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="bg-gray-100 px-2 py-1 rounded font-mono">IC 560</span>
                  <span>Keresés vonatszám alapján</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="bg-gray-100 px-2 py-1 rounded font-mono">LATORCA</span>
                  <span>Keresés vonatnév alapján</span>
                </div>
              </div>
            </div>
          )}

          {hasQuery && !isLoading && items.length === 0 && (
            <div className="p-8 text-center text-gray-500">
              <Search className="h-12 w-12 mx-auto mb-4 text-gray-300" />
              <h3 className="text-lg font-medium text-gray-900 mb-2">Nincs találat</h3>
              <p className="text-sm text-gray-500">
                Próbálj meg egy másik vonatszámot, nevet vagy állomást
              </p>
            </div>
          )}

          {showResults && (
            <div
              ref={resultsRef}
              id={listboxId}
              role="listbox"
              aria-label="Találatok"
              className="overflow-y-auto max-h-[50vh]"
            >
              {sections.map(section => (
                <div key={section.title} role="group" aria-label={section.title}>
                  <div
                    className="sticky top-0 z-10 flex items-center justify-between bg-gray-50 px-4 py-2 text-xs font-medium uppercase tracking-wide text-gray-600"
                    aria-hidden="true"
                  >
                    <span className="truncate">{section.title}</span>
                    {section.isLoading && (
                      <span className="h-3 w-3 shrink-0 animate-spin rounded-full border-b-2 border-gray-400" />
                    )}
                  </div>
                  {section.items.map((item, index) => renderItem(item, section.offset + index))}
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between p-3 bg-gray-50 text-xs text-gray-500 border-t">
          <div className="flex items-center gap-4" aria-hidden="true">
            <span className="flex items-center gap-1">
              <kbd className="bg-white border border-gray-300 rounded px-1">↑↓</kbd>
navigálás
            </span>
            <span className="flex items-center gap-1">
              <kbd className="bg-white border border-gray-300 rounded px-1">Enter</kbd>
kiválasztás
            </span>
            <span className="flex items-center gap-1">
              <kbd className="bg-white border border-gray-300 rounded px-1">Esc</kbd>
bezárás
            </span>
          </div>
          {items.length > 0 && (
            <span>{items.length} találat</span>
          )}
        </div>
      </div>
    </div>
  );
}
