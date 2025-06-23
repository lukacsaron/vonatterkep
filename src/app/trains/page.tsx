'use client';

import { useState, useEffect } from 'react';
import { Search, ArrowUpDown } from 'lucide-react';
import { useTrainSearch, useFeaturedTrains, TrainSearchParams } from '@/lib/hooks/useTrains';
import { StationSearch } from '../components/Station/StationSearch';
import { TrainSearchResultItem } from '../components/Train/TrainSearchResultItem';
import { LoadingSpinner } from '../components/UI/LoadingSpinner';
import { Navbar } from '../components/UI/Navbar';
import { Station } from '@/types';
import { debounce } from '@/lib/utils';

export default function TrainsPage() {
  const [searchQuery, setSearchQuery] = useState('');
  const [debouncedQuery, setDebouncedQuery] = useState('');
  const [fromStation, setFromStation] = useState<Station | null>(null);
  const [toStation, setToStation] = useState<Station | null>(null);

  // Debounce search query
  useEffect(() => {
    const handler = debounce(() => {
      setDebouncedQuery(searchQuery);
    }, 500);
    
    handler();
  }, [searchQuery]);

  // Prepare search parameters
  const searchParams: TrainSearchParams = {
    q: debouncedQuery || undefined,
    fromStationId: fromStation?.id,
    toStationId: toStation?.id,
  };

  // Use search or featured trains
  const hasSearchCriteria = debouncedQuery || fromStation || toStation;
  const { data: searchResults, isLoading: isSearchLoading, error: searchError } = useTrainSearch(searchParams);
  const { data: featuredTrains, isLoading: isFeaturedLoading, error: featuredError } = useFeaturedTrains();

  const trains = hasSearchCriteria ? searchResults : featuredTrains;
  const isLoading = hasSearchCriteria ? isSearchLoading : isFeaturedLoading;
  const error = hasSearchCriteria ? searchError : featuredError;

  const handleSwapStations = () => {
    const temp = fromStation;
    setFromStation(toStation);
    setToStation(temp);
  };

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    // The search is triggered automatically by the debounced query
  };

  return (
    <div className="flex flex-col min-h-screen bg-gray-50">
      <Navbar />
      <div className="max-w-4xl mx-auto px-4 sm:px-6 py-6 sm:py-8">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-gray-900 mb-2">Train Search</h1>
          <p className="text-gray-600">
            Find trains by number, route, or search between stations
          </p>
        </div>

        {/* Search Form */}
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6 mb-8">
          <form onSubmit={handleSearch} className="space-y-6">
            {/* Main search input */}
            <div>
              <label htmlFor="train-search" className="block text-sm font-medium text-gray-700 mb-2">
                Search trains
              </label>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-gray-400" />
                <input
                  id="train-search"
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Search train number, name, or route (e.g., S60, IC 560, Budapest-Szeged)..."
                  className="w-full pl-12 pr-4 py-3 border border-gray-300 rounded-lg text-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                />
              </div>
            </div>

            {/* Station search */}
            <div className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    From station
                  </label>
                  <StationSearch
                    value={fromStation}
                    onSelect={setFromStation}
                    placeholder="Select origin station..."
                  />
                </div>
                
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    To station
                  </label>
                  <StationSearch
                    value={toStation}
                    onSelect={setToStation}
                    placeholder="Select destination station..."
                  />
                </div>
              </div>
              
              {/* Swap button - centered on mobile */}
              {(fromStation || toStation) && (
                <div className="flex justify-center md:justify-end">
                  <button
                    type="button"
                    onClick={handleSwapStations}
                    className="flex items-center gap-2 px-3 py-2 text-gray-600 hover:text-gray-800 hover:bg-gray-100 rounded-lg transition-colors"
                    title="Swap stations"
                  >
                    <ArrowUpDown className="h-4 w-4" />
                    <span className="text-sm">Swap stations</span>
                  </button>
                </div>
              )}
            </div>

          </form>
        </div>

        {/* Results */}
        <div>
          {/* Results header */}
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-xl font-semibold text-gray-900">
              {hasSearchCriteria ? 'Search Results' : 'Featured Trains'}
            </h2>
            {trains && (
              <span className="text-sm text-gray-500">
                {trains.length} train{trains.length !== 1 ? 's' : ''} found
              </span>
            )}
          </div>

          {/* Loading state */}
          {isLoading && (
            <div className="flex items-center justify-center py-12">
              <LoadingSpinner size="lg" />
              <span className="ml-3 text-gray-500">
                {hasSearchCriteria ? 'Searching trains...' : 'Loading featured trains...'}
              </span>
            </div>
          )}

          {/* Error state */}
          {error && (
            <div className="bg-red-50 border border-red-200 rounded-lg p-4 mb-6">
              <div className="text-red-800 font-medium">Error loading trains</div>
              <div className="text-red-600 text-sm mt-1">
                Please try again or check your connection.
              </div>
            </div>
          )}

          {/* Results list */}
          {trains && trains.length > 0 && (
            <div className="space-y-4">
              {trains.map((train) => (
                <TrainSearchResultItem
                  key={train.gtfsId}
                  train={train}
                />
              ))}
            </div>
          )}

          {/* Empty state */}
          {trains && trains.length === 0 && !isLoading && !error && (
            <div className="text-center py-12">
              <div className="text-gray-500 text-lg mb-2">
                {hasSearchCriteria ? 'No trains found' : 'No featured trains available'}
              </div>
              <div className="text-gray-400 text-sm">
                {hasSearchCriteria 
                  ? 'Try adjusting your search criteria or search for a different route.'
                  : 'Featured trains will appear here when available.'
                }
              </div>
            </div>
          )}

          {/* Initial state help text */}
          {!hasSearchCriteria && !featuredTrains && !isFeaturedLoading && !featuredError && (
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-6">
              <h3 className="text-blue-900 font-medium mb-2">How to search for trains</h3>
              <ul className="text-blue-800 text-sm space-y-1">
                <li>• Enter a train number (e.g., &quot;S60&quot;, &quot;IC 560&quot;)</li>
                <li>• Search by train name or route (e.g., &quot;LATORCA&quot;, &quot;Budapest-Szeged&quot;)</li>
                <li>• Select origin and destination stations to find connecting trains</li>
              </ul>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}