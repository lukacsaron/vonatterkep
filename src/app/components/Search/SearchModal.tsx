'use client';

import { useState, useRef, useEffect, useCallback, useId } from 'react';
import { Search, Train, MapPin, X } from 'lucide-react';
import { useTrainSearch } from '@/lib/hooks/useTrainSearch';
import { useMapStore } from '@/lib/store';
import { cn, formatDelay } from '@/lib/utils';
import { Train as TrainType } from '@/types';
import { useFocusTrap, useRestoreFocus } from '@/app/components/UI/focus';

interface SearchModalProps {
  isOpen: boolean;
  onClose: () => void;
}

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

  const { results, isLoading, hasQuery } = useTrainSearch(query);
  const { zoomToTrain } = useMapStore();

  // Must come before the effect that focuses the input (see useRestoreFocus).
  useRestoreFocus(isOpen, dialogRef);
  useFocusTrap(dialogRef, isOpen);

  const selectTrain = useCallback((train: TrainType) => {
    zoomToTrain(train);
    onClose();
  }, [zoomToTrain, onClose]);

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
  }, [results]);

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
  // the document swallowed Enter on the close button.
  const handleInputKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault();
        setSelectedIndex(prev => Math.min(prev + 1, results.length - 1));
        break;
      case 'ArrowUp':
        e.preventDefault();
        setSelectedIndex(prev => Math.max(prev - 1, 0));
        break;
      case 'Enter':
        if (results[selectedIndex]) {
          e.preventDefault();
          selectTrain(results[selectedIndex].train);
        }
        break;
    }
  };

  // Scroll selected item into view
  useEffect(() => {
    if (resultsRef.current) {
      const selectedElement = resultsRef.current.children[selectedIndex] as HTMLElement;
      if (selectedElement) {
        selectedElement.scrollIntoView({
          block: 'nearest',
          behavior: 'smooth'
        });
      }
    }
  }, [selectedIndex]);

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

  if (!isOpen) return null;

  const showResults = results.length > 0;
  const statusMessage = isLoading && hasQuery
    ? 'Keresés folyamatban'
    : hasQuery && results.length === 0
      ? 'Nincs találat'
      : showResults
        ? `${results.length} találat`
        : '';

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
        <h2 id={titleId} className="sr-only">Vonat keresése</h2>

        {/* Header */}
        <div className="flex items-center gap-3 p-4 border-b border-gray-200">
          <Search className="h-5 w-5 text-gray-400" />
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={handleInputKeyDown}
            placeholder="Keress vonatnév, szám, vagy induló / végállomás alapján..."
            aria-label="Vonat keresése vonatszám, név vagy állomás alapján"
            role="combobox"
            aria-autocomplete="list"
            aria-expanded={showResults}
            aria-controls={showResults ? listboxId : undefined}
            aria-activedescendant={showResults && results[selectedIndex] ? optionId(selectedIndex) : undefined}
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
          {isLoading && hasQuery && (
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
                Írj be egy vonatszámot, nevet vagy induló / végállomást, hogy megtaláld a vonatod
              </p>
              <div className="grid grid-cols-1 gap-2 text-xs text-gray-500 max-w-md mx-auto">
                <div className="flex items-center gap-2">
                  <span className="bg-gray-100 px-2 py-1 rounded font-mono">IC 560</span>
                  <span>Keresés vonatszám alapján</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="bg-gray-100 px-2 py-1 rounded font-mono">LATORCA</span>
                  <span>Keresés vonatnév alapján</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="bg-gray-100 px-2 py-1 rounded font-mono">Budapest Szeged</span>
                  <span>Keresés útvonal alapján</span>
                </div>
              </div>
            </div>
          )}

          {hasQuery && !isLoading && results.length === 0 && (
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
              {results.map((result, index) => (
                <div
                  key={`${result.train.id}-${result.type}`}
                  id={optionId(index)}
                  role="option"
                  aria-selected={index === selectedIndex}
                  onClick={() => selectTrain(result.train)}
                  className={cn(
                    "w-full p-4 text-left hover:bg-gray-50 border-b border-gray-100 last:border-b-0 transition-colors cursor-pointer",
                    index === selectedIndex && "bg-blue-50 border-blue-200"
                  )}
                >
                  <div className="flex items-center gap-3">
                    <div className="text-2xl" aria-hidden="true">
                      {getTrainIcon(result.train.number)}
                    </div>

                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <h3 className="font-semibold text-gray-900 truncate">
                          {result.train.trainName ?
                            `${result.train.trainName} (${result.train.number})` :
                            `Vonat ${result.train.number}`
                          }
                        </h3>
                        {result.train.delay > 0 && (
                          <span className={cn("text-xs font-medium", getDelayColor(result.train.delay))}>
                            {formatDelay(result.train.delay)}
                          </span>
                        )}
                        {result.train.delay <= 0 && (
                          <span className="sr-only">Pontos</span>
                        )}
                      </div>

                      <p className="text-sm text-gray-600 mb-1">
                        {result.matchedText}
                      </p>

                      {result.route && (
                        <div className="flex items-center gap-1 text-xs text-gray-600">
                          <MapPin className="h-3 w-3" />
                          <span>{result.route.from}</span>
                          <span aria-hidden="true">→</span>
                          <span className="sr-only">–</span>
                          <span>{result.route.to}</span>
                        </div>
                      )}

                      <div className="flex items-center gap-4 mt-2 text-xs text-gray-600">
                        <div className="flex items-center gap-1">
                          <Train className="h-3 w-3" />
                          <span>{Math.round(result.train.speed)} km/h</span>
                        </div>
                        {(result.train.origin || result.train.destination) && (
                          <div className="flex items-center gap-1">
                            <MapPin className="h-3 w-3" />
                            <span>
                              {result.train.origin?.name && result.train.destination?.name
                                ? `${result.train.origin.name} → ${result.train.destination.name}`
                                : result.train.destination?.name
                                  ? `Cél: ${result.train.destination.name}`
                                  : result.train.origin?.name
                                    ? `Indul: ${result.train.origin.name}`
                                    : ''
                              }
                            </span>
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Colour repeats the delay text above (or "Pontos" for screen readers). */}
                    <div
                      aria-hidden="true"
                      className={cn(
                        "w-3 h-3 rounded-full",
                        result.train.delay <= 4 ? "bg-green-500" :
                        result.train.delay <= 14 ? "bg-yellow-500" :
                        result.train.delay <= 59 ? "bg-orange-500" : "bg-red-500"
                      )}
                    />
                  </div>
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
          {results.length > 0 && (
            <span>{results.length} találat</span>
          )}
        </div>
      </div>
    </div>
  );
}
