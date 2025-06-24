# Cloudflare Setup for Vonat Térkép

This script optimizes Cloudflare configuration for the Vonat Térkép application with caching, security, and performance enhancements.

## Prerequisites

1. **Cloudflare Account** with your domain added
2. **API Token** with Zone:Edit permissions
3. **Zone ID** for your domain

## Getting Your Credentials

### 1. Get API Token
1. Go to [Cloudflare API Tokens](https://dash.cloudflare.com/profile/api-tokens)
2. Click "Create Token"
3. Use "Zone:Edit" template or create custom with:
   - Zone:Zone:Edit
   - Zone:Zone Settings:Edit
   - Zone:Page Rules:Edit
4. Add zone restriction to your domain
5. Copy the generated token

### 2. Get Zone ID
1. Go to your domain in Cloudflare Dashboard
2. In the right sidebar, copy the "Zone ID"

## Environment Setup

Create a `.env.local` file in your project root:

```bash
# Cloudflare Configuration
CLOUDFLARE_API_TOKEN=your_api_token_here
CLOUDFLARE_ZONE_ID=your_zone_id_here
```

## Running the Setup

```bash
# Make the script executable
chmod +x scripts/cloudflare-setup.js

# Run the setup
npm run cloudflare:setup

# Or run directly
node scripts/cloudflare-setup.js
```

## What Gets Configured

### 🚀 Caching Rules
- **Static Assets**: 1-year cache for CSS, JS, images, fonts
- **API Responses**: 1-minute cache for real-time train data
- **HTML Pages**: 1-hour cache for static pages

### 🛡️ Security Rules
- **API Rate Limiting**: 100 requests per minute per IP
- **Bot Protection**: Challenge suspicious bots
- **Admin Protection**: Extra security for admin endpoints

### ⚡ Performance Optimizations
- **Compression**: Brotli compression enabled
- **Minification**: Auto-minify CSS, HTML, JS
- **Image Optimization**: Polish + WebP conversion
- **HTTP/3 & 0-RTT**: Latest protocol optimizations

### 🔒 SSL/TLS Configuration
- **Full SSL Mode**: End-to-end encryption
- **Always HTTPS**: Automatic redirects
- **TLS 1.3**: Latest TLS version
- **HSTS**: Strict Transport Security

### 📄 Page Rules
- Targeted caching for API endpoints
- Long-term caching for Next.js static assets
- Optimized cache settings for different content types

## Monitoring & Testing

After setup, monitor:

1. **Cloudflare Analytics**: Check cache hit rates
2. **Performance**: Test with [PageSpeed Insights](https://pagespeed.web.dev/)
3. **Security**: Monitor blocked requests in Firewall Events

## Cache Strategy for Real-time Data

The script is optimized for your real-time train tracking:

- **Train Positions**: 1-minute edge cache, 30-second browser cache
- **Station Data**: 5-minute cache (changes less frequently)
- **Static Assets**: 1-year cache with immutable headers

## Troubleshooting

### Common Issues

1. **API Token Insufficient Permissions**
   ```
   Error: Cloudflare API error: [{"code":9109,"message":"Invalid zone"}]
   ```
   - Verify API token has Zone:Edit permissions
   - Check zone restriction includes your domain

2. **Zone ID Not Found**
   ```
   Error: Cloudflare API error: [{"code":7003,"message":"No route for the URI"}]
   ```
   - Double-check the Zone ID from dashboard
   - Ensure domain is active in Cloudflare

3. **Rate Limit Exceeded**
   ```
   Error: Cloudflare API error: [{"code":10000,"message":"Rate limit exceeded"}]
   ```
   - Wait a few minutes and retry
   - The script handles retries automatically

### Manual Verification

Check these settings in Cloudflare Dashboard:

1. **SSL/TLS → Overview**: Should show "Full"
2. **Speed → Optimization**: Auto Minify enabled
3. **Security → WAF**: Custom rules created
4. **Caching → Cache Rules**: New rules listed

## Customization

To modify cache times or add new rules, edit the script:

- `staticAssetRule.action_parameters.edge_cache_ttl`: Static asset cache time
- `apiCacheRule.action_parameters.edge_cache_ttl`: API cache time
- Add new rules to the respective arrays

## Performance Impact

Expected improvements:
- **First Load**: 20-30% faster due to caching
- **Subsequent Loads**: 50-70% faster with cached assets
- **API Responses**: Reduced server load with edge caching
- **Global Performance**: CDN acceleration worldwide