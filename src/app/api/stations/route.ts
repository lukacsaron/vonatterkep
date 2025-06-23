import { NextRequest, NextResponse } from 'next/server';
import { mavApi } from '@/lib/api/mav';
import { transformMavStation } from '@/lib/api/transformers';

// Cache stations in memory for 1 hour since they don't change often
let stationsCache: { data: any[], timestamp: number } | null = null;
const CACHE_DURATION = 60 * 60 * 1000; // 1 hour

// Clear cache on startup to ensure fresh data
stationsCache = null;

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const search = searchParams.get('search');
    
    // Check cache first
    const now = Date.now();
    if (stationsCache && (now - stationsCache.timestamp < CACHE_DURATION)) {
      console.log('Using cached station data');
    } else {
      console.log('Fetching fresh station data from MÁV...');
      try {
        const mavStations = await mavApi.getStations();
        stationsCache = {
          data: mavStations,
          timestamp: now
        };
        console.log(`Cached ${mavStations.length} stations from MÁV API`);
      } catch (stationError) {
        console.warn('MÁV station API failed, using fallback station data:', stationError);
        // Comprehensive fallback set of Hungarian stations including the missing ones
        const fallbackStations = [
          // Major Budapest stations
          { UicKod: '5500007', Nev: 'Budapest-Keleti', GPS: { Lat: 47.5000, Lng: 19.0833 } },
          { UicKod: '5500001', Nev: 'Budapest-Nyugati', GPS: { Lat: 47.5167, Lng: 19.0667 } },
          { UicKod: '5500004', Nev: 'Budapest-Déli', GPS: { Lat: 47.4667, Lng: 19.0167 } },
          { UicKod: '5500002', Nev: 'Budapest-Ferencváros', GPS: { Lat: 47.4833, Lng: 19.0833 } },
          
          // Major regional centers
          { UicKod: '5513604', Nev: 'Debrecen', GPS: { Lat: 47.5316, Lng: 21.6273 } },
          { UicKod: '5518701', Nev: 'Szeged', GPS: { Lat: 46.2530, Lng: 20.1414 } },
          { UicKod: '5517401', Nev: 'Pécs', GPS: { Lat: 46.0727, Lng: 18.2323 } },
          { UicKod: '5512101', Nev: 'Győr', GPS: { Lat: 47.6833, Lng: 17.6333 } },
          { UicKod: '5514701', Nev: 'Nyíregyháza', GPS: { Lat: 47.9556, Lng: 21.7267 } },
          { UicKod: '5515801', Nev: 'Miskolc', GPS: { Lat: 48.1031, Lng: 20.7784 } },
          { UicKod: '5511501', Nev: 'Szombathely', GPS: { Lat: 47.2333, Lng: 16.6167 } },
          { UicKod: '5517001', Nev: 'Keszthely', GPS: { Lat: 46.7667, Lng: 17.2500 } },
          
          // Previously missing stations
          { UicKod: '5516001', Nev: 'Veszprém', GPS: { Lat: 47.0934, Lng: 17.9104 } },
          { UicKod: '5516101', Nev: 'Ukk', GPS: { Lat: 47.0167, Lng: 17.8833 } },
          { UicKod: '5516501', Nev: 'Tapolca', GPS: { Lat: 46.8833, Lng: 17.4333 } },
          
          // Additional important stations around Lake Balaton and major routes
          { UicKod: '5516201', Nev: 'Balatonfüred', GPS: { Lat: 46.9567, Lng: 17.8889 } },
          { UicKod: '5516301', Nev: 'Siófok', GPS: { Lat: 46.9044, Lng: 18.0569 } },
          { UicKod: '5511001', Nev: 'Sopron', GPS: { Lat: 47.6833, Lng: 16.5833 } },
          { UicKod: '5512801', Nev: 'Tatabánya', GPS: { Lat: 47.5694, Lng: 18.3969 } },
          { UicKod: '5513001', Nev: 'Esztergom', GPS: { Lat: 47.7928, Lng: 18.7439 } },
          { UicKod: '5514001', Nev: 'Szolnok', GPS: { Lat: 47.1739, Lng: 20.1989 } },
          { UicKod: '5518001', Nev: 'Békéscsaba', GPS: { Lat: 46.6758, Lng: 21.0967 } },
          { UicKod: '5515001', Nev: 'Eger', GPS: { Lat: 47.9022, Lng: 20.3739 } },
          { UicKod: '5519001', Nev: 'Kaposvár', GPS: { Lat: 46.3667, Lng: 17.8 } },
          { UicKod: '5510001', Nev: 'Kecskemét', GPS: { Lat: 46.8969, Lng: 19.6914 } },
          { UicKod: '5517501', Nev: 'Nagykanizsa', GPS: { Lat: 46.4567, Lng: 16.9914 } },
          { UicKod: '5512501', Nev: 'Székesfehérvár', GPS: { Lat: 47.1889, Lng: 18.4106 } },
          { UicKod: '5516801', Nev: 'Zalaegerszeg', GPS: { Lat: 46.8408, Lng: 16.8439 } },
          
          // Additional regional stations
          { UicKod: '5511801', Nev: 'Pápa', GPS: { Lat: 47.3333, Lng: 17.4667 } },
          { UicKod: '5512401', Nev: 'Vác', GPS: { Lat: 47.7756, Lng: 19.1364 } },
          { UicKod: '5510501', Nev: 'Cegléd', GPS: { Lat: 47.1733, Lng: 19.7953 } },
          { UicKod: '5514201', Nev: 'Hatvan', GPS: { Lat: 47.6667, Lng: 19.6833 } },
          { UicKod: '5515501', Nev: 'Sátoraljaújhely', GPS: { Lat: 48.3939, Lng: 21.6578 } },
          { UicKod: '5516901', Nev: 'Balatonszentgyörgy', GPS: { Lat: 46.7667, Lng: 17.3833 } },
          { UicKod: '5517201', Nev: 'Dombóvár', GPS: { Lat: 46.3739, Lng: 18.1328 } }
        ];
        stationsCache = {
          data: fallbackStations,
          timestamp: now
        };
        console.log(`Using comprehensive fallback data with ${fallbackStations.length} Hungarian stations`);
        // Log some key stations to verify they're included
        const keyStations = ['Tapolca', 'Veszprém', 'Ukk'];
        keyStations.forEach(station => {
          const found = fallbackStations.find(s => s.Nev.includes(station));
          console.log(`🔍 Key station "${station}" in fallback:`, found ? `${found.Nev} (${found.UicKod})` : 'NOT FOUND');
        });
      }
    }
    
    // Transform MÁV stations to our format
    let stations = stationsCache.data
      .filter(station => station.GPS) // Only include stations with GPS coordinates
      .map(transformMavStation);
    
    // Apply search filter if provided
    if (search) {
      const searchLower = search.toLowerCase();
      console.log(`🔍 Searching for: "${search}" (lowercase: "${searchLower}")`);
      console.log(`📋 Available stations before filter: ${stations.length}`);
      
      // Check specifically for Tapolca
      const tapolcaStation = stations.find(s => s.name.toLowerCase().includes('tapolca'));
      console.log(`🎯 Tapolca station found in list:`, tapolcaStation ? tapolcaStation.name : 'NOT FOUND');
      
      stations = stations.filter(station =>
        station.name.toLowerCase().includes(searchLower)
      );
      
      console.log(`📋 Stations after filter: ${stations.length}`);
      console.log(`🔍 Filtered stations:`, stations.map(s => s.name));
    }
    
    return NextResponse.json(stations, {
      headers: {
        'Cache-Control': 'public, max-age=3600', // Cache for 1 hour
      }
    });
    
  } catch (error) {
    console.error('Error fetching stations from MÁV:', error);
    
    // Return error response
    return NextResponse.json(
      { error: 'Failed to fetch station data', details: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}