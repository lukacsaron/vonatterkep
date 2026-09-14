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
    removeConsole: process.env.NODE_ENV === 'production',
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
    domains: ['api.mapbox.com'],
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