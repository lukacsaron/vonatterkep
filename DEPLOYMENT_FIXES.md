# Deployment Fixes for Coolify Build Issues

## Issues Fixed

### 1. Tailwind CSS Configuration Issue
**Problem**: `Cannot find module '@tailwindcss/postcss'`

**Solution**: 
- Switched from Tailwind CSS v4 to stable v3.4.15
- Updated PostCSS configuration to use standard plugins
- Added proper `tailwind.config.ts` file

### 2. Module Resolution Issues  
**Problem**: `Module not found: Can't resolve '@/app/components/UI/Navbar'`

**Solution**:
- Fixed Dockerfile to install all dependencies (including devDependencies) for build
- Ensured proper TypeScript compilation for both web app and worker

### 3. Next.js Configuration Warnings
**Problem**: Invalid config options and deprecated settings

**Solution**:
- Updated `next.config.js` to use current Next.js 15 syntax
- Moved from `experimental.turbo` to `turbopack`
- Removed unsupported `optimizePackageImports` option

### 4. Docker Build Process
**Problem**: Build failing due to missing dependencies

**Solution**:
- Simplified Dockerfile to single-stage build initially
- Proper dependency installation with `npm ci --frozen-lockfile`
- Added comprehensive startup script with error handling

## Files Modified

1. **`package.json`** - Updated Tailwind CSS v3.4.15 and PostCSS dependencies
2. **`package-lock.json`** - Regenerated to match updated dependencies
3. **`postcss.config.mjs`** - Standard Tailwind/Autoprefixer setup  
4. **`tailwind.config.ts`** - Added proper Tailwind v3 configuration
5. **`src/app/globals.css`** - Fixed Tailwind imports for v3 syntax
6. **`next.config.js`** - Fixed Next.js 15 compatibility
7. **`src/app/page.tsx`** - Added Suspense boundary for useSearchParams
8. **`src/app/search/page.tsx`** - Fixed HTML entity encoding
9. **`src/app/components/Search/SearchModal.tsx`** - Fixed useCallback dependencies
10. **`src/lib/store.ts`** - Fixed train position property access
11. **`src/lib/api/client.ts`** - Added proper TypeScript type assertions
12. **`src/lib/api/mav.ts`** - Fixed TypeScript unknown type errors
13. **`tsconfig.worker.json`** - Excluded browser-specific code from worker
14. **`Dockerfile`** - Optimized build process with proper dependencies

## Next Steps for Deployment

1. **Push these fixes to your repository**
2. **Retry deployment in Coolify**
3. **Monitor build logs** - should now complete successfully
4. **Test the health endpoint** - `/api/health` should return 200

## Testing Locally

```bash
# Clean build test
rm -rf .next node_modules dist
npm ci
npm run build

# Docker build test  
docker build -t vonatterkep-test .
docker run -p 3000:3000 vonatterkep-test
```

## Expected Build Output

✅ Next.js build should complete without errors  
✅ TypeScript worker compilation should succeed  
✅ Docker image should build successfully  
✅ Application should start both web server and worker  
✅ Health check endpoint should respond

## Environment Variables Still Needed

Make sure these are set in Coolify:

```bash
NEXT_PUBLIC_MAPBOX_TOKEN=pk.your_token_here
REDIS_URL=redis://password@vonatterkep-redis:6379  
JWT_SECRET=your_generated_secret
NEXTAUTH_SECRET=your_generated_secret
NEXT_PUBLIC_API_URL=https://your-domain.com/api
NEXTAUTH_URL=https://your-domain.com
```

The build should now succeed! 🚀