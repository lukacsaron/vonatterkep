// Simple test script to verify the new API endpoints work
const { mavApi } = require('./vonatterkep/src/lib/api/mav');
const { transformMavDeparture, transformMavArrival, transformSearchResult } = require('./vonatterkep/src/lib/api/transformers');

async function testEndpoints() {
  console.log('🧪 Testing new API endpoints...\n');
  
  try {
    // Test 1: Test enhanced mav.ts API client
    console.log('📡 Testing enhanced MAV API client...');
    
    // Get some stations for testing
    const stations = await mavApi.getStations();
    const testStation = stations.find(s => s.UicKod && s.GPS);
    
    if (!testStation) {
      console.error('❌ No test station found');
      return;
    }
    
    console.log(`✅ Found test station: ${testStation.Nev} (ID: ${testStation.UicKod})`);
    
    // Test departures
    console.log('\n📤 Testing departures...');
    const departures = await mavApi.getDepartures(testStation.UicKod);
    console.log(`✅ Got ${departures.length} departures`);
    
    // Test arrivals
    console.log('\n📥 Testing arrivals...');
    const arrivals = await mavApi.getArrivals(testStation.UicKod);
    console.log(`✅ Got ${arrivals.length} arrivals`);
    
    // Test search functionality
    console.log('\n🔍 Testing train search...');
    const searchResults = await mavApi.searchTrains({
      fromStationId: testStation.UicKod
    });
    console.log(`✅ Got ${searchResults.length} search results`);
    
    // Test transformers
    console.log('\n🔄 Testing transformers...');
    if (departures.length > 0) {
      const stationData = {
        id: testStation.UicKod,
        name: testStation.Nev,
        coordinates: {
          latitude: testStation.GPS?.Lat || 0,
          longitude: testStation.GPS?.Lng || 0
        }
      };
      
      const transformed = transformMavDeparture(departures[0], stationData);
      console.log(`✅ Transformed departure: ${transformed.train.number} → ${transformed.remoteStation.name}`);
    }
    
    if (searchResults.length > 0) {
      const stationMap = new Map([[testStation.UicKod, {
        id: testStation.UicKod,
        name: testStation.Nev,
        coordinates: { latitude: 0, longitude: 0 }
      }]]);
      
      const searchResult = transformSearchResult(searchResults[0], stationMap);
      console.log(`✅ Transformed search result: ${searchResult.trainNumber} (${searchResult.trainType})`);
    }
    
    console.log('\n🎉 All tests passed! The API endpoints should work correctly.');
    
  } catch (error) {
    console.error('❌ Test failed:', error.message);
    console.error('Stack:', error.stack);
  }
}

// Run the tests
testEndpoints().catch(console.error);