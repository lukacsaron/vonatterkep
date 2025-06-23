#!/bin/bash

# VonatterKep Deployment Verification Script
# Run this after deployment to verify everything is working

set -e

echo "🔍 VonatterKep Deployment Verification"
echo "======================================"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Default URL - can be overridden
DEPLOYMENT_URL=${1:-"http://localhost:3000"}

echo -e "${BLUE}Testing deployment at: $DEPLOYMENT_URL${NC}"
echo ""

# Function to test endpoint
test_endpoint() {
    local endpoint=$1
    local expected_status=${2:-200}
    local description=$3
    
    echo -n "Testing $description... "
    
    response=$(curl -s -w "%{http_code}" -o /tmp/response.json "$DEPLOYMENT_URL$endpoint" || echo "000")
    
    if [ "$response" = "$expected_status" ]; then
        echo -e "${GREEN}✅ PASS${NC}"
        return 0
    else
        echo -e "${RED}❌ FAIL (Status: $response)${NC}"
        if [ -f /tmp/response.json ]; then
            echo "Response: $(cat /tmp/response.json)"
        fi
        return 1
    fi
}

# Function to test JSON response
test_json_endpoint() {
    local endpoint=$1
    local description=$2
    local required_field=$3
    
    echo -n "Testing $description... "
    
    response=$(curl -s "$DEPLOYMENT_URL$endpoint" 2>/dev/null || echo '{"error": "request_failed"}')
    
    if echo "$response" | jq -e ".$required_field" > /dev/null 2>&1; then
        echo -e "${GREEN}✅ PASS${NC}"
        return 0
    else
        echo -e "${RED}❌ FAIL${NC}"
        echo "Response: $response"
        return 1
    fi
}

# Start verification
failed_tests=0

echo "1. Basic Connectivity Tests"
echo "==========================="

# Test main page
if test_endpoint "/" 200 "Main page"; then
    echo "   Main application is accessible"
else
    ((failed_tests++))
fi

# Test health endpoint
if test_json_endpoint "/api/health" "Health endpoint" "status"; then
    health_response=$(curl -s "$DEPLOYMENT_URL/api/health" 2>/dev/null)
    echo "   Health status: $(echo "$health_response" | jq -r '.status // "unknown"')"
    echo "   Redis status: $(echo "$health_response" | jq -r '.services.redis // "unknown"')"
else
    ((failed_tests++))
fi

echo ""
echo "2. API Endpoint Tests"
echo "===================="

# Test trains API
if test_endpoint "/api/trains" 200 "Trains API"; then
    trains_response=$(curl -s "$DEPLOYMENT_URL/api/trains" 2>/dev/null)
    train_count=$(echo "$trains_response" | jq '. | length' 2>/dev/null || echo "0")
    echo "   Found $train_count trains"
else
    ((failed_tests++))
fi

# Test stations API
if test_endpoint "/api/stations" 200 "Stations API"; then
    stations_response=$(curl -s "$DEPLOYMENT_URL/api/stations" 2>/dev/null)
    station_count=$(echo "$stations_response" | jq '. | length' 2>/dev/null || echo "0")
    echo "   Found $station_count stations"
else
    ((failed_tests++))
fi

echo ""
echo "3. Page Route Tests"
echo "=================="

# Test search page
if test_endpoint "/search" 200 "Search page"; then
    echo "   Search functionality accessible"
else
    ((failed_tests++))
fi

echo ""
echo "4. Security Tests"
echo "================"

# Test HTTPS redirect (if not localhost)
if [[ $DEPLOYMENT_URL != *"localhost"* ]] && [[ $DEPLOYMENT_URL != *"127.0.0.1"* ]]; then
    http_url=$(echo $DEPLOYMENT_URL | sed 's/https:/http:/')
    if test_endpoint "" 301 "HTTPS redirect" <<< "$http_url"; then
        echo "   HTTPS redirect is working"
    else
        echo -e "${YELLOW}⚠️  HTTPS redirect not configured${NC}"
    fi
fi

# Test security headers
echo -n "Testing security headers... "
headers=$(curl -s -I "$DEPLOYMENT_URL" 2>/dev/null || echo "")
if echo "$headers" | grep -qi "x-frame-options\|content-security-policy"; then
    echo -e "${GREEN}✅ PASS${NC}"
else
    echo -e "${YELLOW}⚠️  Security headers not found${NC}"
fi

echo ""
echo "5. Performance Tests"
echo "==================="

# Test response time
echo -n "Testing response time... "
start_time=$(date +%s%N)
curl -s "$DEPLOYMENT_URL" > /dev/null 2>&1
end_time=$(date +%s%N)
response_time=$(( (end_time - start_time) / 1000000 ))

if [ $response_time -lt 2000 ]; then
    echo -e "${GREEN}✅ PASS${NC} (${response_time}ms)"
else
    echo -e "${YELLOW}⚠️  SLOW${NC} (${response_time}ms)"
fi

# Test static assets
if test_endpoint "/_next/static/css" 200 "Static CSS assets" 2>/dev/null; then
    echo "   Static assets are being served"
fi

echo ""
echo "6. Cache Tests"
echo "============="

# Test cache headers on API
cache_headers=$(curl -s -I "$DEPLOYMENT_URL/api/trains" 2>/dev/null | grep -i "cache\|etag" || echo "")
if [ -n "$cache_headers" ]; then
    echo -e "${GREEN}✅ API caching headers present${NC}"
else
    echo -e "${YELLOW}⚠️  No caching headers found${NC}"
fi

echo ""
echo "Summary"
echo "======="

if [ $failed_tests -eq 0 ]; then
    echo -e "${GREEN}🎉 All critical tests passed!${NC}"
    echo ""
    echo "Deployment appears to be successful. Your VonatterKep instance is ready!"
    echo ""
    echo "You can now:"
    echo "- Access the application at: $DEPLOYMENT_URL"
    echo "- View train tracking on the map"
    echo "- Use Cmd+K to search for trains"
    echo "- Monitor health at: $DEPLOYMENT_URL/api/health"
    exit 0
else
    echo -e "${RED}❌ $failed_tests test(s) failed${NC}"
    echo ""
    echo "Please check the following:"
    echo "1. All environment variables are configured correctly"
    echo "2. Redis service is running and accessible"
    echo "3. Mapbox token is valid"
    echo "4. Network connectivity between services"
    echo ""
    echo "Check the application logs for more details."
    exit 1
fi