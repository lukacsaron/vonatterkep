#!/bin/bash

# VasútTérkép Deployment Script for Coolify
# This script helps deploy the application to Coolify

set -e

echo "🚀 VasútTérkép Deployment Script"
echo "================================"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Check if required files exist
echo "📋 Checking required files..."

required_files=(
    "Dockerfile"
    "package.json"
    "next.config.js"
    ".env.production"
)

for file in "${required_files[@]}"; do
    if [ ! -f "$file" ]; then
        echo -e "${RED}❌ Missing required file: $file${NC}"
        exit 1
    fi
done

echo -e "${GREEN}✅ All required files present${NC}"

# Check if environment variables are configured
echo "🔧 Checking environment configuration..."

if [ ! -f ".env.local" ]; then
    echo -e "${YELLOW}⚠️  .env.local not found. Copy .env.production to .env.local and configure your values.${NC}"
    echo "   Required variables:"
    echo "   - NEXT_PUBLIC_MAPBOX_TOKEN"
    echo "   - JWT_SECRET"
    echo "   - NEXTAUTH_SECRET"
    echo "   - REDIS_URL"
fi

# Run pre-deployment checks
echo "🧪 Running pre-deployment checks..."

# Check Node.js version
node_version=$(node --version)
echo "Node.js version: $node_version"

# Install dependencies and run build test
echo "📦 Installing dependencies..."
npm ci

echo "🔨 Testing build..."
npm run build

if [ $? -eq 0 ]; then
    echo -e "${GREEN}✅ Build successful${NC}"
else
    echo -e "${RED}❌ Build failed${NC}"
    exit 1
fi

# Run linting and type checking
echo "🔍 Running code quality checks..."
npm run lint
npm run typecheck

echo -e "${GREEN}✅ All checks passed!${NC}"

echo ""
echo "🎯 Deployment Checklist:"
echo "========================"
echo "1. ✅ Required files created"
echo "2. ✅ Build successful"
echo "3. ✅ Code quality checks passed"
echo ""
echo "Next steps for Coolify:"
echo "1. Push your code to Git repository"
echo "2. Create Redis service in Coolify"
echo "3. Create new application in Coolify"
echo "4. Configure environment variables"
echo "5. Deploy!"
echo ""
echo -e "${GREEN}🚀 Ready for deployment!${NC}"