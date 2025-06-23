'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Clock, ArrowRight } from 'lucide-react';
import { StationSearch } from '@/app/components/Station/StationSearch';
import { Navbar } from '@/app/components/UI/Navbar';
import { Station } from '@/types';

export default function DeparturesPage() {
  const router = useRouter();
  const [selectedStation, setSelectedStation] = useState<Station | null>(null);

  const handleStationSelect = (station: Station | null) => {
    setSelectedStation(station);
    if (station) {
      // Redirect to the station timetable page
      router.push(`/stations/${station.id}`);
    }
  };

  const popularStations = [
    { id: '5500007', name: 'Budapest-Keleti' },
    { id: '5500001', name: 'Budapest-Nyugati' },
    { id: '5500004', name: 'Budapest-Déli' },
    { id: '5513604', name: 'Debrecen' },
    { id: '5518701', name: 'Szeged' },
    { id: '5517401', name: 'Pécs' },
    { id: '5512101', name: 'Győr' },
    { id: '5514701', name: 'Nyíregyháza' },
  ];

  return (
    <div className="flex flex-col min-h-screen bg-gray-50">
      <Navbar />
      <div className="container mx-auto px-4 py-8">
        <div className="max-w-2xl mx-auto">
        {/* Header */}
        <div className="text-center mb-8">
          <div className="flex items-center justify-center mb-4">
            <Clock className="h-12 w-12 text-blue-600" />
          </div>
          <h1 className="text-3xl font-bold text-gray-900 mb-2">
            Station Departures
          </h1>
          <p className="text-gray-600">
            Select a station to view real-time departures and arrivals
          </p>
        </div>

        {/* Station Search */}
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6 mb-8">
          <label className="block text-sm font-medium text-gray-700 mb-3">
            Search for a station
          </label>
          <StationSearch
            value={selectedStation}
            onSelect={handleStationSelect}
            placeholder="Enter station name (e.g., Budapest-Keleti, Debrecen)..."
            className="w-full"
          />
        </div>

        {/* Popular Stations */}
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">
            Popular Stations
          </h2>
          <div className="space-y-2">
            {popularStations.map((station) => (
              <button
                key={station.id}
                onClick={() => router.push(`/stations/${station.id}`)}
                className="w-full flex items-center justify-between p-3 text-left rounded-lg hover:bg-gray-50 transition-colors border border-transparent hover:border-gray-200"
              >
                <div>
                  <div className="font-medium text-gray-900">
                    {station.name}
                  </div>
                  <div className="text-sm text-gray-500">
                    View departures and arrivals
                  </div>
                </div>
                <ArrowRight className="h-5 w-5 text-gray-400" />
              </button>
            ))}
          </div>
        </div>

        {/* Info */}
        <div className="mt-8 text-center text-sm text-gray-500">
          <p>
            Real-time departure and arrival information from MÁV
          </p>
          <p className="mt-1">
            Data refreshes automatically every 30 seconds
          </p>
        </div>
        </div>
      </div>
    </div>
  );
}