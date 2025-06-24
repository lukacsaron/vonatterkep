#!/usr/bin/env node

/**
 * Cloudflare Optimization Setup for Vonat Térkép
 * 
 * This script configures Cloudflare for optimal performance:
 * - Caching rules for static assets and API responses
 * - Security rules for API protection
 * - Performance optimizations
 * - Bot protection
 * 
 * Usage: node scripts/cloudflare-setup.js
 * 
 * Required Environment Variables:
 * - CLOUDFLARE_API_TOKEN: API token with Zone:Edit permissions
 * - CLOUDFLARE_ZONE_ID: Zone ID for vasutterkep.hu
 */

const CLOUDFLARE_API_BASE = 'https://api.cloudflare.com/client/v4';
const ZONE_ID = process.env.CLOUDFLARE_ZONE_ID;
const API_TOKEN = process.env.CLOUDFLARE_API_TOKEN;

if (!ZONE_ID || !API_TOKEN) {
  console.error('❌ Missing required environment variables:');
  console.error('   CLOUDFLARE_ZONE_ID and CLOUDFLARE_API_TOKEN');
  process.exit(1);
}

class CloudflareSetup {
  constructor() {
    this.headers = {
      'Authorization': `Bearer ${API_TOKEN}`,
      'Content-Type': 'application/json',
    };
  }

  async request(method, endpoint, data = null) {
    const url = `${CLOUDFLARE_API_BASE}${endpoint}`;
    
    try {
      const response = await fetch(url, {
        method,
        headers: this.headers,
        body: data ? JSON.stringify(data) : null,
      });

      const result = await response.json();
      
      if (!result.success) {
        throw new Error(`Cloudflare API error: ${JSON.stringify(result.errors)}`);
      }
      
      return result.result;
    } catch (error) {
      console.error(`❌ API request failed: ${error.message}`);
      throw error;
    }
  }

  async setupCacheRules() {
    console.log('🚀 Setting up cache rules...');

    // Cache rule for static assets (images, CSS, JS)
    const staticAssetRule = {
      name: 'Cache Static Assets',
      description: 'Cache images, CSS, JS, and fonts with long TTL',
      expression: '(http.request.uri.path matches ".*\\.(css|js|png|jpg|jpeg|gif|webp|avif|ico|svg|woff|woff2|ttf|otf|eot)$")',
      action: 'set_cache_settings',
      action_parameters: {
        cache: true,
        cache_level: 'cache_everything',
        edge_cache_ttl: 31536000, // 1 year
        browser_cache_ttl: 31536000, // 1 year
        cache_key: {
          ignore_query_strings_order: true,
          cache_deception_armor: true,
        },
      },
      enabled: true,
    };

    // Cache rule for API responses with short TTL
    const apiCacheRule = {
      name: 'Cache API Responses',
      description: 'Cache API responses with short TTL for real-time data',
      expression: '(http.request.uri.path matches "^/api/(trains|stations).*" and http.request.method eq "GET")',
      action: 'set_cache_settings',
      action_parameters: {
        cache: true,
        cache_level: 'cache_everything',
        edge_cache_ttl: 60, // 1 minute for real-time data
        browser_cache_ttl: 30, // 30 seconds for browser
        cache_key: {
          ignore_query_strings_order: false, // Preserve query params for search
          cache_deception_armor: true,
        },
        cache_reserve: {
          eligible: true,
          min_file_size: 0,
        },
      },
      enabled: true,
    };

    // Cache rule for HTML pages
    const htmlCacheRule = {
      name: 'Cache HTML Pages',
      description: 'Cache HTML pages with medium TTL',
      expression: '(http.request.uri.path matches ".*\\.(html|htm)$" or not http.request.uri.path contains ".")',
      action: 'set_cache_settings',
      action_parameters: {
        cache: true,
        cache_level: 'cache_everything',
        edge_cache_ttl: 3600, // 1 hour
        browser_cache_ttl: 1800, // 30 minutes
        cache_key: {
          ignore_query_strings_order: true,
          cache_deception_armor: true,
        },
      },
      enabled: true,
    };

    const rules = [staticAssetRule, apiCacheRule, htmlCacheRule];

    for (const rule of rules) {
      try {
        await this.request('POST', `/zones/${ZONE_ID}/rulesets/phases/http_request_cache_settings/entrypoint`, {
          rules: [rule],
        });
        console.log(`✅ Created cache rule: ${rule.name}`);
      } catch (error) {
        console.warn(`⚠️  Failed to create cache rule ${rule.name}: ${error.message}`);
      }
    }
  }

  async setupSecurityRules() {
    console.log('🛡️  Setting up security rules...');

    // Rate limiting for API endpoints
    const rateLimitRule = {
      name: 'API Rate Limiting',
      description: 'Rate limit API endpoints to prevent abuse',
      expression: '(http.request.uri.path matches "^/api/.*")',
      action: 'rate_limit',
      action_parameters: {
        rate_limit: {
          characteristics: ['cf.colo.id', 'ip.src'],
          period: 60,
          requests_per_period: 100,
          mitigation_timeout: 600,
        },
      },
      enabled: true,
    };

    // Block known bad bots
    const botProtectionRule = {
      name: 'Bot Protection',
      description: 'Block malicious bots and scrapers',
      expression: '(cf.bot_management.score lt 30 and not cf.bot_management.verified_bot)',
      action: 'challenge',
      enabled: true,
    };

    // Protect admin endpoints (if any)
    const adminProtectionRule = {
      name: 'Admin Protection',
      description: 'Extra protection for admin endpoints',
      expression: '(http.request.uri.path matches "^/(admin|api/admin).*")',
      action: 'challenge',
      enabled: true,
    };

    const securityRules = [rateLimitRule, botProtectionRule, adminProtectionRule];

    for (const rule of securityRules) {
      try {
        await this.request('POST', `/zones/${ZONE_ID}/rulesets/phases/http_request_firewall_custom/entrypoint`, {
          rules: [rule],
        });
        console.log(`✅ Created security rule: ${rule.name}`);
      } catch (error) {
        console.warn(`⚠️  Failed to create security rule ${rule.name}: ${error.message}`);
      }
    }
  }

  async setupPerformanceSettings() {
    console.log('⚡ Setting up performance optimizations...');

    const performanceSettings = [
      // Enable Brotli compression
      {
        setting: 'brotli',
        value: 'on',
        description: 'Brotli compression',
      },
      // Enable Auto Minify
      {
        setting: 'minify',
        value: { css: 'on', html: 'on', js: 'on' },
        description: 'Auto minification',
      },
      // Enable Rocket Loader for JS optimization
      {
        setting: 'rocket_loader',
        value: 'on',
        description: 'Rocket Loader',
      },
      // Enable Polish for image optimization
      {
        setting: 'polish',
        value: 'lossless',
        description: 'Image optimization',
      },
      // Enable WebP conversion
      {
        setting: 'webp',
        value: 'on',
        description: 'WebP conversion',
      },
      // Enable HTTP/2
      {
        setting: 'http2',
        value: 'on',
        description: 'HTTP/2',
      },
      // Enable HTTP/3
      {
        setting: 'http3',
        value: 'on',
        description: 'HTTP/3',
      },
      // Enable 0-RTT
      {
        setting: '0rtt',
        value: 'on',
        description: '0-RTT Connection Resumption',
      },
    ];

    for (const { setting, value, description } of performanceSettings) {
      try {
        await this.request('PATCH', `/zones/${ZONE_ID}/settings/${setting}`, { value });
        console.log(`✅ Enabled ${description}`);
      } catch (error) {
        console.warn(`⚠️  Failed to enable ${description}: ${error.message}`);
      }
    }
  }

  async setupSSLSettings() {
    console.log('🔒 Setting up SSL/TLS configuration...');

    const sslSettings = [
      // Set SSL mode to Full (Strict)
      {
        setting: 'ssl',
        value: 'full',
        description: 'SSL Full mode',
      },
      // Enable Always Use HTTPS
      {
        setting: 'always_use_https',
        value: 'on',
        description: 'Always Use HTTPS',
      },
      // Set minimum TLS version
      {
        setting: 'min_tls_version',
        value: '1.2',
        description: 'Minimum TLS 1.2',
      },
      // Enable TLS 1.3
      {
        setting: 'tls_1_3',
        value: 'on',
        description: 'TLS 1.3',
      },
      // Enable Automatic HTTPS Rewrites
      {
        setting: 'automatic_https_rewrites',
        value: 'on',
        description: 'Automatic HTTPS Rewrites',
      },
      // Enable HSTS
      {
        setting: 'security_header',
        value: {
          strict_transport_security: {
            enabled: true,
            max_age: 31536000,
            include_subdomains: true,
            preload: true,
          },
        },
        description: 'HSTS',
      },
    ];

    for (const { setting, value, description } of sslSettings) {
      try {
        await this.request('PATCH', `/zones/${ZONE_ID}/settings/${setting}`, { value });
        console.log(`✅ Configured ${description}`);
      } catch (error) {
        console.warn(`⚠️  Failed to configure ${description}: ${error.message}`);
      }
    }
  }

  async setupPageRules() {
    console.log('📄 Setting up page rules...');

    // Get existing page rules first
    const existingRules = await this.request('GET', `/zones/${ZONE_ID}/pagerules`);
    
    // Define new page rules
    const pageRules = [
      {
        targets: [{ target: 'url', constraint: { operator: 'matches', value: 'vasutterkep.hu/api/trains*' }}],
        actions: [
          { id: 'cache_level', value: 'cache_everything' },
          { id: 'edge_cache_ttl', value: 60 },
          { id: 'browser_cache_ttl', value: 30 },
        ],
        priority: 1,
        status: 'active',
      },
      {
        targets: [{ target: 'url', constraint: { operator: 'matches', value: 'vasutterkep.hu/api/stations*' }}],
        actions: [
          { id: 'cache_level', value: 'cache_everything' },
          { id: 'edge_cache_ttl', value: 300 }, // 5 minutes for stations
          { id: 'browser_cache_ttl', value: 180 },
        ],
        priority: 2,
        status: 'active',
      },
      {
        targets: [{ target: 'url', constraint: { operator: 'matches', value: 'vasutterkep.hu/_next/static/*' }}],
        actions: [
          { id: 'cache_level', value: 'cache_everything' },
          { id: 'edge_cache_ttl', value: 31536000 }, // 1 year for Next.js static assets
          { id: 'browser_cache_ttl', value: 31536000 },
        ],
        priority: 3,
        status: 'active',
      },
    ];

    // Check if we have room for new rules (Cloudflare has a limit)
    if (existingRules.length + pageRules.length > 100) {
      console.warn('⚠️  Too many page rules, skipping some...');
      return;
    }

    for (const rule of pageRules) {
      try {
        await this.request('POST', `/zones/${ZONE_ID}/pagerules`, rule);
        console.log(`✅ Created page rule for ${rule.targets[0].constraint.value}`);
      } catch (error) {
        console.warn(`⚠️  Failed to create page rule: ${error.message}`);
      }
    }
  }

  async run() {
    console.log('🌟 Starting Cloudflare optimization setup for Vonat Térkép...\n');

    try {
      await this.setupCacheRules();
      await this.setupSecurityRules();
      await this.setupPerformanceSettings();
      await this.setupSSLSettings();
      await this.setupPageRules();

      console.log('\n🎉 Cloudflare optimization setup completed successfully!');
      console.log('\n📊 Summary of optimizations:');
      console.log('✅ Cache rules for static assets, API responses, and HTML');
      console.log('✅ Security rules with rate limiting and bot protection');
      console.log('✅ Performance optimizations (Brotli, minification, HTTP/3)');
      console.log('✅ SSL/TLS configuration with HSTS');
      console.log('✅ Page rules for targeted caching');
      
      console.log('\n🔧 Next steps:');
      console.log('1. Test your site performance at https://pagespeed.web.dev/');
      console.log('2. Monitor Cloudflare Analytics for cache hit rates');
      console.log('3. Adjust cache TTL values based on your data update frequency');

    } catch (error) {
      console.error('❌ Setup failed:', error.message);
      process.exit(1);
    }
  }
}

// Run the setup
const setup = new CloudflareSetup();
setup.run().catch(console.error);