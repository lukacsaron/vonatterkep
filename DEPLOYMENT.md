# VonatterKep Deployment Guide for Coolify

## Prerequisites
- Coolify instance running
- Git repository with VonatterKep code
- Mapbox account and access token
- Domain name (optional)

## Quick Start

1. **Run the deployment script:**
   ```bash
   ./scripts/deploy.sh
   ```

2. **Configure environment variables** (copy `.env.production` to `.env.local`)

3. **Push to Git and deploy via Coolify**

## Step-by-Step Deployment

### 1. Prepare Environment

```bash
# Copy environment template
cp .env.production .env.local

# Edit environment variables
nano .env.local
```

**Required Variables:**
- `NEXT_PUBLIC_MAPBOX_TOKEN` - Get from https://mapbox.com
- `JWT_SECRET` - Generate: `openssl rand -base64 32`
- `NEXTAUTH_SECRET` - Generate: `openssl rand -base64 32`
- `REDIS_URL` - Will be configured in Coolify

### 2. Create Redis Service in Coolify

1. Go to Coolify Dashboard
2. **New Resource** → **Service** → **Redis**
3. Configuration:
   - Name: `vonatterkep-redis`
   - Password: Generate secure password
   - Memory: 256MB (or as needed)
4. Deploy and note the connection string

### 3. Create Application in Coolify

1. **New Resource** → **Application**
2. **Source**: Connect your Git repository
3. **Configuration**:
   - Name: `vonatterkep`
   - Port: `3000`
   - Build Pack: `Dockerfile`
   - Branch: `main`

### 4. Configure Environment Variables in Coolify

```bash
# Application
NODE_ENV=production
PORT=3000

# URLs (replace with your domain)
NEXT_PUBLIC_API_URL=https://vonatterkep.your-domain.com/api
NEXTAUTH_URL=https://vonatterkep.your-domain.com

# Mapbox
NEXT_PUBLIC_MAPBOX_TOKEN=pk.your_actual_mapbox_token

# Redis (from step 2)
REDIS_URL=redis://:password@vonatterkep-redis:6379

# Security
JWT_SECRET=your-generated-jwt-secret
NEXTAUTH_SECRET=your-generated-nextauth-secret

# Optional: Monitoring
SENTRY_DSN=your-sentry-dsn
```

### 5. Configure Networking

1. **Domain**: Add your domain or use Coolify subdomain
2. **SSL**: Enable automatic SSL certificate
3. **Network**: Ensure Redis and app are on same network

### 6. Health Checks

Coolify will automatically configure health checks using `/api/health`

### 7. Deploy

1. Click **Deploy** in Coolify
2. Monitor build logs
3. Verify deployment at your domain
4. Test functionality

## Monitoring and Maintenance

### Health Check Endpoint
- URL: `https://your-domain.com/api/health`
- Returns app status, Redis connection, memory usage

### Log Monitoring
- **Application logs**: Available in Coolify dashboard
- **Error tracking**: Configure Sentry (optional)

### Backup Strategy
- **Redis**: Enable periodic backups in Coolify
- **Code**: Ensure Git repository is backed up

## Troubleshooting

### Common Issues

**Build Failures:**
```bash
# Check Node.js version compatibility
node --version  # Should be 18+

# Clean build
rm -rf .next node_modules
npm ci
npm run build
```

**Redis Connection Issues:**
- Verify Redis service is running
- Check network connectivity
- Validate REDIS_URL format

**Environment Variable Issues:**
- Ensure all required variables are set
- Check for typos in variable names
- Verify Mapbox token is valid

### Debug Commands

```bash
# Test health endpoint
curl https://your-domain.com/api/health

# Check Redis connection locally
redis-cli -u $REDIS_URL ping

# Validate environment
npm run build  # Should complete without errors
```

## Performance Optimization

### Production Settings
- **Redis Memory**: Monitor usage, increase if needed
- **Node.js Memory**: Default limits should be sufficient
- **CDN**: Consider adding Cloudflare for static assets

### Scaling
- **Horizontal**: Deploy multiple app instances
- **Vertical**: Increase CPU/RAM in Coolify
- **Database**: Monitor Redis performance

## Security Checklist

- ✅ HTTPS enabled and enforced
- ✅ Environment variables secured
- ✅ JWT secrets are randomly generated
- ✅ Redis password protected
- ✅ Firewall configured (if applicable)
- ✅ Regular security updates

## Files Created for Deployment

- `Dockerfile` - Multi-stage production build
- `.dockerignore` - Excludes unnecessary files
- `next.config.js` - Production optimization
- `docker-compose.yml` - Local testing
- `.env.production` - Environment template
- `src/app/api/health/route.ts` - Health monitoring
- `scripts/deploy.sh` - Deployment helper script

## Support

For deployment issues:
1. Check application logs in Coolify
2. Verify health endpoint status
3. Test individual components (Redis, API endpoints)
4. Review environment variable configuration