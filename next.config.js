/** @type {import('next').NextConfig} */
const nextConfig = {
  turbopack: {
    rules: {
      '*.svg': {
        loaders: ['@svgr/webpack'],
        as: '*.js',
      },
    },
  },
  output: 'standalone',
  
  // Advanced bundle optimizations
  experimental: {
    optimizePackageImports: [
      'lucide-react',
      '@radix-ui/react-dialog',
      '@radix-ui/react-dropdown-menu',
      '@radix-ui/react-select',
      '@radix-ui/react-tabs',
    ],
    // Disable CSS optimization due to critters module dependency issue in Next.js 15
    // optimizeCss: true,
  },
  
  // SWC optimizations (minification is enabled by default in Next.js 15)
  compiler: {
    // Strip console.log/info/debug from production bundles, but KEEP
    // console.error and console.warn. removeConsole applies to server code
    // too: with `true` the API routes compiled to zero log lines, so a week of
    // HTTP 500s in production left no trace in the container logs.
    removeConsole:
      process.env.NODE_ENV === 'production' ? { exclude: ['error', 'warn'] } : false,
  },
  
  // Security response headers (applied to every route).
  // NOTE: no Content-Security-Policy is set here on purpose - this app loads
  // Mapbox GL (api.mapbox.com, events.mapbox.com, blob: workers, data: images,
  // eval-based shaders) and Google Tag Manager, and a wrong CSP would silently
  // break the live map. Add one only after testing it against the real map.
  async headers() {
    return [
      {
        source: '/:path*',
        headers: [
          {
            key: 'Strict-Transport-Security',
            value: 'max-age=63072000; includeSubDomains; preload',
          },
          {
            key: 'X-Content-Type-Options',
            value: 'nosniff',
          },
          {
            key: 'X-Frame-Options',
            value: 'DENY',
          },
          {
            key: 'Referrer-Policy',
            value: 'strict-origin-when-cross-origin',
          },
          {
            // geolocation stays enabled for self: the live map uses it to
            // centre on the visitor.
            key: 'Permissions-Policy',
            value: 'camera=(), microphone=(), geolocation=(self)',
          },
        ],
      },
    ]
  },
  
  // Webpack optimizations
  webpack: (config, { dev, isServer }) => {
    // Production optimizations.
    // NOTE: merge into Next's existing splitChunks config - replacing it wholesale
    // drops the rules that keep extracted CSS out of the JS chunk groups, which
    // makes Next emit <script src="....css"> and throws a SyntaxError in the browser.
    if (!dev && !isServer && typeof config.optimization?.splitChunks === 'object') {
      config.optimization.splitChunks.cacheGroups = {
        ...config.optimization.splitChunks.cacheGroups,
        mapbox: {
          test: /[\\/]node_modules[\\/]mapbox-gl[\\/]/,
          name: 'mapbox',
          chunks: 'all',
          priority: 10,
          reuseExistingChunk: true,
        },
        radix: {
          test: /[\\/]node_modules[\\/]@radix-ui[\\/]/,
          name: 'radix-ui',
          chunks: 'all',
          priority: 5,
          reuseExistingChunk: true,
        },
      };
    }

    return config;
  },
  
  images: {
    formats: ['image/avif', 'image/webp'],
    // Remote images the optimizer may fetch. (The deprecated `images.domains`
    // entry was dropped: it allowed ANY path on api.mapbox.com, and nothing in
    // the app passes a remote URL to next/image.)
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'api.mapbox.com',
        port: '',
        pathname: '/styles/**',
      },
    ],
  },
  
  // Disable source maps in production for better performance
  productionBrowserSourceMaps: false,
  // Enable compression
  compress: true,
  
  // Environment variables that should be available on the client
  env: {
    NEXT_PUBLIC_API_URL: process.env.NEXT_PUBLIC_API_URL,
    NEXT_PUBLIC_MAPBOX_TOKEN: process.env.NEXT_PUBLIC_MAPBOX_TOKEN,
  },
}

module.exports = nextConfig