'use client';

import { 
  MNR_FONT_MAPPING, 
  TRAIN_TYPE_DESCRIPTIONS, 
  MNR_SERVICE_CODES, 
  SERVICE_DESCRIPTIONS 
} from '@/lib/mnrFont';

export default function TestMNRPage() {
  return (
    <div className="container mx-auto px-4 py-8">
      <h1 className="text-3xl font-bold mb-8">MNR2007 Font Test</h1>
      
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {Object.entries(MNR_FONT_MAPPING).map(([uicCode, character]) => (
          <div key={uicCode} className="border rounded-lg p-4 hover:bg-gray-50">
            <div className="flex items-center gap-3">
              <span className="text-4xl mnr-font font-bold text-blue-600">
                {character}
              </span>
              <div>
                <div className="font-mono text-sm text-gray-500">
                  UIC: {uicCode}
                </div>
                <div className="font-semibold text-gray-900">
                  {TRAIN_TYPE_DESCRIPTIONS[uicCode] || 'Leírás hiányzik'}
                </div>
              </div>
            </div>
          </div>
        ))}
      </div>
      
      {/* Service Features Test */}
      <div className="mt-8">
        <h2 className="text-2xl font-bold mb-4">Service Features (EMMA API infoServices)</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {Object.entries(MNR_SERVICE_CODES).map(([fontCode, character]) => (
            <div key={fontCode} className="border rounded-lg p-4 hover:bg-gray-50">
              <div className="flex items-center gap-3">
                <span className="text-4xl mnr-font font-bold text-green-600">
                  {character}
                </span>
                <div>
                  <div className="font-mono text-sm text-gray-500">
                    Code: {fontCode}
                  </div>
                  <div className="font-semibold text-gray-900">
                    {SERVICE_DESCRIPTIONS[parseInt(fontCode)] || 'Leírás hiányzik'}
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="mt-8 p-4 bg-blue-50 rounded-lg">
        <h2 className="text-xl font-semibold mb-4">Font Information</h2>
        <p className="text-sm text-gray-700">
          This page tests the MNR2007 font used by MÁV EMMA for displaying train type icons and service features.
          If you see proper train icons instead of garbled characters, the font is working correctly.
        </p>
        <p className="text-sm text-gray-700 mt-2">
          Font source: <code>public/fonts/mnr2007.ttf</code>
        </p>
      </div>
    </div>
  );
}