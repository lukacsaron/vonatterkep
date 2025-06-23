'use client';

import { useState, useRef, useEffect } from 'react';
import { Search, Train, MapPin, Clock, X } from 'lucide-react';
import { useTrainSearch } from '@/lib/hooks/useTrainSearch';
import { useMapStore } from '@/lib/store';
import { cn } from '@/lib/utils';
import { Train as TrainType } from '@/types';

interface SearchModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export function SearchModal({ isOpen, onClose }: SearchModalProps) {
  const [query, setQuery] = useState('');
  const [selectedIndex, setSelectedIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const resultsRef = useRef<HTMLDivElement>(null);
  
  const { results, isLoading, hasQuery } = useTrainSearch(query);
  const { zoomToTrain } = useMapStore();

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

  // Handle keyboard navigation
  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
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
          e.preventDefault();
          if (results[selectedIndex]) {
            selectTrain(results[selectedIndex].train);
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
  }, [isOpen, results, selectedIndex, onClose]);

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

  const selectTrain = (train: TrainType) => {
    zoomToTrain(train);
    onClose();
  };

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
    if (delay <= 4) return 'text-green-600';
    if (delay <= 14) return 'text-yellow-600';
    if (delay <= 59) return 'text-orange-600';
    return 'text-red-600';
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center pt-[15vh] px-4">
      {/* Backdrop */}
      <div 
        className="absolute inset-0 bg-black/50 backdrop-blur-sm"
        onClick={onClose}
      />
      
      {/* Modal */}
      <div className="relative bg-white rounded-lg shadow-xl w-full max-w-2xl max-h-[70vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center gap-3 p-4 border-b border-gray-200">
          <Search className="h-5 w-5 text-gray-400" />
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search trains by number, name, or route..."
            className="flex-1 text-lg border-none outline-none placeholder-gray-400"
          />
          <button
            onClick={onClose}
            className="p-1 hover:bg-gray-100 rounded"
          >
            <X className="h-4 w-4 text-gray-400" />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-hidden">
          {isLoading && hasQuery && (
            <div className="flex items-center justify-center py-12">
              <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-blue-600" />
              <span className="ml-3 text-gray-500">Searching trains...</span>
            </div>
          )}

          {!hasQuery && !isLoading && (
            <div className="p-8 text-center text-gray-500">
              <Train className="h-12 w-12 mx-auto mb-4 text-gray-300" />
              <h3 className="text-lg font-medium text-gray-900 mb-2">Search for trains</h3>
              <p className="text-sm text-gray-500 mb-4">
                Type a train number, name, or station to find real-time train information
              </p>
              <div className="grid grid-cols-1 gap-2 text-xs text-gray-400 max-w-md mx-auto">
                <div className="flex items-center gap-2">
                  <span className="bg-gray-100 px-2 py-1 rounded font-mono">IC 560</span>
                  <span>Search by train number</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="bg-gray-100 px-2 py-1 rounded font-mono">LATORCA</span>
                  <span>Search by train name</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="bg-gray-100 px-2 py-1 rounded font-mono">Budapest Szeged</span>
                  <span>Search by route</span>
                </div>
              </div>
            </div>
          )}

          {hasQuery && !isLoading && results.length === 0 && (
            <div className="p-8 text-center text-gray-500">
              <Search className="h-12 w-12 mx-auto mb-4 text-gray-300" />
              <h3 className="text-lg font-medium text-gray-900 mb-2">No trains found</h3>
              <p className="text-sm text-gray-500">
                Try searching for a different train number, name, or station
              </p>
            </div>
          )}

          {results.length > 0 && (
            <div ref={resultsRef} className="overflow-y-auto max-h-[50vh]">
              {results.map((result, index) => (
                <button
                  key={`${result.train.id}-${result.type}`}
                  onClick={() => selectTrain(result.train)}
                  className={cn(
                    "w-full p-4 text-left hover:bg-gray-50 border-b border-gray-100 last:border-b-0 transition-colors",
                    index === selectedIndex && "bg-blue-50 border-blue-200"
                  )}
                >
                  <div className="flex items-center gap-3">
                    <div className="text-2xl">
                      {getTrainIcon(result.train.number)}
                    </div>
                    
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <h3 className="font-semibold text-gray-900 truncate">
                          {result.train.trainName ? 
                            `${result.train.trainName} (${result.train.number})` : 
                            `Train ${result.train.number}`
                          }
                        </h3>
                        {result.train.delay > 0 && (
                          <span className={cn("text-xs font-medium", getDelayColor(result.train.delay))}>
                            +{result.train.delay}min
                          </span>
                        )}
                      </div>
                      
                      <p className="text-sm text-gray-600 mb-1">
                        {result.matchedText}
                      </p>
                      
                      {result.route && (
                        <div className="flex items-center gap-1 text-xs text-gray-500">
                          <MapPin className="h-3 w-3" />
                          <span>{result.route.from}</span>
                          <span>→</span>
                          <span>{result.route.to}</span>
                        </div>
                      )}
                      
                      <div className="flex items-center gap-4 mt-2 text-xs text-gray-500">
                        <div className="flex items-center gap-1">
                          <Train className="h-3 w-3" />
                          <span>{Math.round(result.train.speed)} km/h</span>
                        </div>
                        {result.train.destination && (
                          <div className="flex items-center gap-1">
                            <MapPin className="h-3 w-3" />
                            <span>To {result.train.destination.name}</span>
                          </div>
                        )}
                      </div>
                    </div>
                    
                    <div className={cn(
                      "w-3 h-3 rounded-full",
                      result.train.delay <= 4 ? "bg-green-500" :
                      result.train.delay <= 14 ? "bg-yellow-500" :
                      result.train.delay <= 59 ? "bg-orange-500" : "bg-red-500"
                    )} />
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between p-3 bg-gray-50 text-xs text-gray-500 border-t">
          <div className="flex items-center gap-4">
            <span className="flex items-center gap-1">
              <kbd className="bg-white border border-gray-300 rounded px-1">↑↓</kbd>
              to navigate
            </span>
            <span className="flex items-center gap-1">
              <kbd className="bg-white border border-gray-300 rounded px-1">Enter</kbd>
              to select
            </span>
            <span className="flex items-center gap-1">
              <kbd className="bg-white border border-gray-300 rounded px-1">Esc</kbd>
              to close
            </span>
          </div>
          {results.length > 0 && (
            <span>{results.length} result{results.length !== 1 ? 's' : ''}</span>
          )}
        </div>
      </div>
    </div>
  );
}