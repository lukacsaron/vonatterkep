'use client';

import { use } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowLeft, MapPin, ExternalLink } from 'lucide-react';
import { useTrain } from '@/lib/hooks/useTrains';
import { TrainInfoCard } from '../../components/Train/TrainInfoCard';
import { LoadingSpinner } from '../../components/UI/LoadingSpinner';
import { Navbar } from '../../components/UI/Navbar';

interface TrainDetailPageProps {
  params: Promise<{ gtfsId: string }>;
}

export default function TrainDetailPage({ params }: TrainDetailPageProps) {
  const { gtfsId } = use(params);
  const router = useRouter();
  const decodedGtfsId = decodeURIComponent(gtfsId);
  
  const { data: train, isLoading, error } = useTrain(decodedGtfsId);

  const handleBackToSearch = () => {
    router.push('/trains');
  };

  const handleViewOnMap = () => {
    if (train) {
      // Navigate to main map page with the train focused
      router.push(`/?train=${encodeURIComponent(train.id)}`);
    }
  };

  if (isLoading) {
    return (
      <div className="flex flex-col min-h-screen bg-gray-50">
        <Navbar />
        <div className="max-w-4xl mx-auto px-4 py-8">
          {/* Header */}
          <div className="mb-8">
            <button
              onClick={handleBackToSearch}
              className="flex items-center gap-2 text-blue-600 hover:text-blue-700 mb-4"
            >
              <ArrowLeft className="h-4 w-4" />
              Back to search
            </button>
            <h1 className="text-3xl font-bold text-gray-900">Train Details</h1>
          </div>

          {/* Loading state */}
          <div className="flex items-center justify-center py-12">
            <LoadingSpinner size="lg" />
            <span className="ml-3 text-gray-500">Loading train details...</span>
          </div>
        </div>
      </div>
    );
  }

  if (error || !train) {
    return (
      <div className="flex flex-col min-h-screen bg-gray-50">
        <Navbar />
        <div className="max-w-4xl mx-auto px-4 py-8">
          {/* Header */}
          <div className="mb-8">
            <button
              onClick={handleBackToSearch}
              className="flex items-center gap-2 text-blue-600 hover:text-blue-700 mb-4"
            >
              <ArrowLeft className="h-4 w-4" />
              Back to search
            </button>
            <h1 className="text-3xl font-bold text-gray-900">Train Details</h1>
          </div>

          {/* Error state */}
          <div className="bg-red-50 border border-red-200 rounded-lg p-6">
            <div className="text-red-800 font-medium mb-2">Train not found</div>
            <div className="text-red-600 text-sm mb-4">
              The train with ID &quot;{decodedGtfsId}&quot; could not be found or is no longer available.
            </div>
            <button
              onClick={handleBackToSearch}
              className="bg-red-600 text-white px-4 py-2 rounded-lg hover:bg-red-700 transition-colors"
            >
              Return to search
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col min-h-screen bg-gray-50">
      <Navbar />
      <div className="max-w-4xl mx-auto px-4 sm:px-6 py-6 sm:py-8">
        {/* Header */}
        <div className="mb-8">
          <button
            onClick={handleBackToSearch}
            className="flex items-center gap-2 text-blue-600 hover:text-blue-700 mb-4 transition-colors"
          >
            <ArrowLeft className="h-4 w-4" />
            Back to search
          </button>
          
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <div>
              <h1 className="text-2xl sm:text-3xl font-bold text-gray-900">
                Train {train.number}
              </h1>
              {train.trainName && (
                <p className="text-gray-600 mt-1">{train.trainName}</p>
              )}
            </div>
            
            {/* View on map button */}
            <button
              onClick={handleViewOnMap}
              className="flex items-center justify-center gap-2 bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 transition-colors w-full sm:w-auto"
            >
              <MapPin className="h-4 w-4" />
              View on map
              <ExternalLink className="h-4 w-4" />
            </button>
          </div>
        </div>

        {/* Train info card container */}
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
          <TrainInfoCard train={train} />
        </div>

        {/* Additional information */}
        <div className="mt-6 bg-blue-50 border border-blue-200 rounded-lg p-4">
          <div className="text-blue-900 font-medium mb-2">Live tracking information</div>
          <div className="text-blue-800 text-sm space-y-1">
            <p>• Real-time position and delay data is updated every 30 seconds</p>
            <p>• Platform information may change - check station displays for final confirmation</p>
            <p>• Click &quot;View on map&quot; to see the train&apos;s current location and route</p>
          </div>
        </div>
      </div>
    </div>
  );
}