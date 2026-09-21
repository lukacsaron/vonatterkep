'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { Search, Train, MapPin, ArrowRight, X } from 'lucide-react';
import { useGlobalSearch, SearchItem } from '@/lib/hooks/useGlobalSearch';
import { useMapStore } from '@/lib/store';
import { cn, formatTime } from '@/lib/utils';

interface SearchModalProps {
  isOpen: boolean;
  onClose: () => void;
}

function getTrainIcon(trainNumber: string) {
  if (trainNumber.includes('IC') || trainNumber.includes('InterCity')) return '🚄';
  if (trainNumber.includes('S') || trainNumber.includes('suburban')) return '🚊';
  return '🚂';
}

function getDelayColor(delay: number) {
  if (delay <= 4) return 'text-green-600';
  if (delay <= 14) return 'text-yellow-600';
  if (delay <= 59) return 'text-orange-600';
  return 'text-red-600';
}

function getDelayDotColor(delay: number) {
  if (delay <= 4) return 'bg-green-500';
  if (delay <= 14) return 'bg-yellow-500';
  if (delay <= 59) return 'bg-orange-500';
  return 'bg-red-500';
}

export function SearchModal({ isOpen, onClose }: SearchModalProps) {
  const [query, setQuery] = useState('');
  const [selectedIndex, setSelectedIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const resultsRef = useRef<HTMLDivElement>(null);
  const router = useRouter();

  const { sections, items, isLoading, hasQuery } = useGlobalSearch(query);
  const { zoomToTrain } = useMapStore();

  const selectItem = useCallback(
    (item: SearchItem) => {
      switch (item.kind) {
        case 'station':
          router.push(`/stations/${item.station.id}`);
          break;
        case 'arrival':
          zoomToTrain(item.arrival.train);
          break;
        case 'train':
          zoomToTrain(item.train);
          break;
      }
      onClose();
    },
    [router, zoomToTrain, onClose]
  );

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

  // Handle keyboard navigation
  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
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
          e.preventDefault();
          if (items[selectedIndex]) {
            selectItem(items[selectedIndex]);
          }
          break;
        case 'Escape':
          e.preventDefault();
          onClose();
          break;
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, items, selectedIndex, onClose, selectItem]);

  // Scroll selected item into view
  useEffect(() => {
    const selectedElement = resultsRef.current?.querySelector('[data-selected="true"]');
    selectedElement?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }, [selectedIndex]);

  if (!isOpen) return null;

  const renderItem = (item: SearchItem, index: number) => {
    const isSelected = index === selectedIndex;
    const rowClass = cn(
      'w-full p-4 text-left hover:bg-gray-50 border-b border-gray-100 last:border-b-0 transition-colors',
      isSelected && 'bg-blue-50'
    );

    if (item.kind === 'station') {
      return (
        <button
          key={item.key}
          data-selected={isSelected}
          onClick={() => selectItem(item)}
          className={rowClass}
        >
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-blue-100">
              <MapPin className="h-4 w-4 text-blue-600" />
            </div>
            <div className="min-w-0 flex-1">
              <h3 className="truncate font-semibold text-gray-900">{item.station.name}</h3>
              <p className="text-sm text-gray-500">Állomás · menetrend</p>
            </div>
            <ArrowRight className="h-4 w-4 shrink-0 text-gray-400" />
          </div>
        </button>
      );
    }

    if (item.kind === 'arrival') {
      const { arrival } = item;
      const trainLabel = arrival.train.trainName
        ? `${arrival.train.trainName} (${arrival.train.number})`
        : arrival.train.number;

      return (
        <button
          key={item.key}
          data-selected={isSelected}
          onClick={() => selectItem(item)}
          className={rowClass}
        >
          <div className="flex items-center gap-3">
            <div className="w-14 shrink-0 text-base font-semibold tabular-nums text-gray-900">
              {formatTime(arrival.time)}
            </div>
            <div className="min-w-0 flex-1">
              <h3 className="truncate font-medium text-gray-900">{trainLabel}</h3>
              {arrival.remoteStation?.name && (
                <p className="truncate text-sm text-gray-500">
                  {arrival.remoteStation.name} felől
                </p>
              )}
            </div>
            {arrival.delay > 0 && (
              <span className={cn('shrink-0 text-xs font-medium', getDelayColor(arrival.delay))}>
                +{arrival.delay} perc
              </span>
            )}
          </div>
        </button>
      );
    }

    const { train } = item;
    return (
      <button
        key={item.key}
        data-selected={isSelected}
        onClick={() => selectItem(item)}
        className={rowClass}
      >
        <div className="flex items-center gap-3">
          <div className="text-2xl">{getTrainIcon(train.number)}</div>

          <div className="min-w-0 flex-1">
            <div className="mb-1 flex items-center gap-2">
              <h3 className="truncate font-semibold text-gray-900">
                {train.trainName ? `${train.trainName} (${train.number})` : `${train.number} vonat`}
              </h3>
              {train.delay > 0 && (
                <span className={cn('text-xs font-medium', getDelayColor(train.delay))}>
                  +{train.delay} perc
                </span>
              )}
            </div>

            <p className="mb-1 truncate text-sm text-gray-600">{item.label}</p>

            <div className="flex items-center gap-4 text-xs text-gray-500">
              <span className="flex items-center gap-1">
                <Train className="h-3 w-3" />
                {Math.round(train.speed)} km/h
              </span>
              {train.origin?.name && train.destination?.name && (
                <span className="flex min-w-0 items-center gap-1">
                  <MapPin className="h-3 w-3 shrink-0" />
                  <span className="truncate">
                    {train.origin.name} → {train.destination.name}
                  </span>
                </span>
              )}
            </div>
          </div>

          <div className={cn('h-3 w-3 shrink-0 rounded-full', getDelayDotColor(train.delay))} />
        </div>
      </button>
    );
  };

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center px-4 pt-[15vh]">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={onClose} />

      {/* Modal */}
      <div className="relative flex max-h-[70vh] w-full max-w-2xl flex-col rounded-lg bg-white shadow-xl">
        {/* Header */}
        <div className="flex items-center gap-3 border-b border-gray-200 p-4">
          <Search className="h-5 w-5 text-gray-400" />
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={e => setQuery(e.target.value)}
            placeholder="Keress állomásra, vonatszámra vagy vonatnévre..."
            className="flex-1 border-none text-lg outline-none placeholder-gray-400"
          />
          <button onClick={onClose} className="rounded p-1 hover:bg-gray-100">
            <X className="h-4 w-4 text-gray-400" />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-hidden">
          {isLoading && hasQuery && items.length === 0 && (
            <div className="flex items-center justify-center py-12">
              <div className="h-6 w-6 animate-spin rounded-full border-b-2 border-blue-600" />
              <span className="ml-3 text-gray-500">Keresek...</span>
            </div>
          )}

          {!hasQuery && (
            <div className="p-8 text-center text-gray-500">
              <Train className="mx-auto mb-4 h-12 w-12 text-gray-300" />
              <h3 className="mb-2 text-lg font-medium text-gray-900">Keresés</h3>
              <p className="mb-4 text-sm text-gray-500">
                Írj be egy állomást, vonatszámot vagy vonatnevet
              </p>
              <div className="mx-auto grid max-w-md grid-cols-1 gap-2 text-xs text-gray-400">
                <div className="flex items-center gap-2">
                  <span className="rounded bg-gray-100 px-2 py-1 font-mono">Balatonföldvár</span>
                  <span>Állomás és érkező vonatai</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="rounded bg-gray-100 px-2 py-1 font-mono">IC 560</span>
                  <span>Keresés vonatszám alapján</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="rounded bg-gray-100 px-2 py-1 font-mono">LATORCA</span>
                  <span>Keresés vonatnév alapján</span>
                </div>
              </div>
            </div>
          )}

          {hasQuery && !isLoading && items.length === 0 && (
            <div className="p-8 text-center text-gray-500">
              <Search className="mx-auto mb-4 h-12 w-12 text-gray-300" />
              <h3 className="mb-2 text-lg font-medium text-gray-900">Nincs találat</h3>
              <p className="text-sm text-gray-500">
                Próbálj meg egy másik vonatszámot, nevet vagy állomást
              </p>
            </div>
          )}

          {items.length > 0 && (
            <div ref={resultsRef} className="max-h-[50vh] overflow-y-auto">
              {sections.map(section => (
                <div key={section.title}>
                  <div className="sticky top-0 z-10 flex items-center justify-between bg-gray-50 px-4 py-2 text-xs font-medium uppercase tracking-wide text-gray-500">
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
        <div className="flex items-center justify-between border-t bg-gray-50 p-3 text-xs text-gray-500">
          <div className="flex items-center gap-4">
            <span className="flex items-center gap-1">
              <kbd className="rounded border border-gray-300 bg-white px-1">↑↓</kbd>
              navigálás
            </span>
            <span className="flex items-center gap-1">
              <kbd className="rounded border border-gray-300 bg-white px-1">Enter</kbd>
              kiválasztás
            </span>
            <span className="flex items-center gap-1">
              <kbd className="rounded border border-gray-300 bg-white px-1">Esc</kbd>
              bezárás
            </span>
          </div>
          {items.length > 0 && <span>{items.length} találat</span>}
        </div>
      </div>
    </div>
  );
}
