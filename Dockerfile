# Use Node.js 18 Alpine as base
FROM node:18-alpine AS base

# Install system dependencies
RUN apk add --no-cache libc6-compat curl

# Set working directory
WORKDIR /app

# Copy package files
COPY package.json package-lock.json* ./

# Install dependencies (all dependencies needed for build)
RUN npm ci --include=dev

# Copy source code
COPY . .

# Set environment variables for build
ENV NEXT_TELEMETRY_DISABLED=1
ENV NODE_ENV=production

# Build the application and worker
RUN npm run build

# Create production runtime
FROM node:18-alpine AS runner
WORKDIR /app

# Install system dependencies for runtime
RUN apk add --no-cache curl

# Create system user
RUN addgroup --system --gid 1001 nodejs
RUN adduser --system --uid 1001 nextjs

# Set environment variables
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PORT=3000
ENV HOSTNAME="0.0.0.0"

# Copy built application
COPY --from=base /app/.next/standalone ./
COPY --from=base /app/.next/static ./.next/static
COPY --from=base /app/public ./public
COPY --from=base /app/dist ./dist

# Copy node_modules for worker dependencies
COPY --from=base /app/node_modules ./node_modules

# Copy startup script
COPY --from=base /app/start.sh ./start.sh
RUN chmod +x /app/start.sh

# Set ownership
RUN chown -R nextjs:nodejs /app

# Switch to non-root user
USER nextjs

# Expose port
EXPOSE 3000

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=60s --retries=3 \
  CMD curl -f http://localhost:3000/api/health || exit 1

# Start application
CMD ["/app/start.sh"]