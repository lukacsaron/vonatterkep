'use client';

import { useEffect } from 'react';
import { Navbar } from '@/app/components/UI/Navbar';

export default function SearchPage() {
  // Auto-open search modal when the search page loads
  // This is handled by the GlobalSearchProvider

  return (
    <div className="flex flex-col h-screen bg-white">
      <Navbar />
      <main className="flex-1 bg-gray-50">
        <div className="max-w-4xl mx-auto pt-16 px-4">
          <div className="text-center mb-8">
            <h1 className="text-3xl font-bold text-gray-900 mb-4">
              Search Trains
            </h1>
            <p className="text-gray-600 max-w-2xl mx-auto">
              Find real-time information about Hungarian trains. Search by train number, 
              name, or route to see current positions, delays, and destinations.
            </p>
          </div>

          <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-8">
            <div className="text-center">
              <div className="mb-6">
                <h2 className="text-xl font-semibold text-gray-900 mb-2">
                  Quick Search
                </h2>
                <p className="text-gray-600 text-sm">
                  Press <kbd className="bg-gray-100 border border-gray-300 rounded px-2 py-1 text-xs font-mono">⌘K</kbd> to open search
                </p>
              </div>
            </div>

            <div className="mt-8 grid grid-cols-1 md:grid-cols-3 gap-6 text-center">
              <div className="p-4 bg-gray-50 rounded-lg">
                <div className="text-2xl mb-2">🚄</div>
                <h3 className="font-medium text-gray-900 mb-1">Train Numbers</h3>
                <p className="text-sm text-gray-600">
                  Search by train number like "IC 560" or "S80"
                </p>
              </div>

              <div className="p-4 bg-gray-50 rounded-lg">
                <div className="text-2xl mb-2">📍</div>
                <h3 className="font-medium text-gray-900 mb-1">Routes</h3>
                <p className="text-sm text-gray-600">
                  Find trains by destination or route like "Budapest Szeged"
                </p>
              </div>

              <div className="p-4 bg-gray-50 rounded-lg">
                <div className="text-2xl mb-2">🏷️</div>
                <h3 className="font-medium text-gray-900 mb-1">Train Names</h3>
                <p className="text-sm text-gray-600">
                  Search by special train names like "LATORCA"
                </p>
              </div>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}