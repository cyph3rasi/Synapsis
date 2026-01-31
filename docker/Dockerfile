# Synapsis - Multi-stage Production Dockerfile
# This Dockerfile creates a production-ready image that:
# - Keeps source files immutable (prevents accidental modifications)
# - Optimizes build size with multi-stage approach
# - Runs as non-root user for security

# ============================================
# Stage 1: Dependencies
# ============================================
FROM node:22-alpine AS deps
RUN apk add --no-cache libc6-compat openssl

WORKDIR /app

# Copy package files for efficient layer caching
COPY package.json package-lock.json* ./

# Install production dependencies only (using ci for reproducible builds)
RUN npm ci --only=production --ignore-scripts && npm cache clean --force

# ============================================
# Stage 2: Builder
# ============================================
FROM node:22-alpine AS builder
RUN apk add --no-cache libc6-compat openssl

WORKDIR /app

# Copy dependencies from deps stage
COPY --from=deps /app/node_modules ./node_modules

# Copy all source files
COPY . .

# Set environment variables for build
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1

# Build the Next.js application
RUN npm run build

# ============================================
# Stage 3: Production Runner
# ============================================
FROM node:22-alpine AS runner
RUN apk add --no-cache libc6-compat openssl netcat-openbsd

WORKDIR /app

# Create non-root user for security
RUN addgroup --system --gid 1001 nodejs && \
    adduser --system --uid 1001 nextjs

# Set production environment
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PORT=3000
ENV HOSTNAME="0.0.0.0"

# Copy public assets
COPY --from=builder /app/public ./public

# Copy Next.js build output
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static

# Copy drizzle migrations, config, and schema (needed for migrations)
COPY --from=builder --chown=nextjs:nodejs /app/drizzle ./drizzle
COPY --from=builder --chown=nextjs:nodejs /app/drizzle.config.ts ./
COPY --from=builder --chown=nextjs:nodejs /app/package.json ./
COPY --from=builder --chown=nextjs:nodejs /app/package-lock.json ./
COPY --from=builder --chown=nextjs:nodejs /app/src/db/schema.ts ./src/db/schema.ts

# Install drizzle-kit and pg (postgres driver) for migrations
# These are needed at runtime for the entrypoint to run migrations
RUN npm install -g drizzle-kit pg && npm cache clean --force

# Copy entrypoint script
COPY --from=builder --chown=nextjs:nodejs /app/docker/docker-entrypoint.sh ./
RUN chmod +x ./docker-entrypoint.sh

# Switch to non-root user
USER nextjs

# Expose the application port
EXPOSE 3000

# Health check - longer start period to allow migrations to run
HEALTHCHECK --interval=30s --timeout=10s --start-period=60s --retries=5 \
    CMD node -e "require('http').get('http://localhost:3000/api/health', (r) => r.statusCode === 200 ? process.exit(0) : process.exit(1))"

# Set the entrypoint
ENTRYPOINT ["./docker-entrypoint.sh"]

# Default command (can be overridden)
CMD ["node", "server.js"]
