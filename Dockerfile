# Synapsis Docker Image
# Multi-stage build for production

# Stage 1: Dependencies
FROM node:20-alpine AS deps
RUN apk add --no-cache libc6-compat
WORKDIR /app

# Copy package files
COPY package.json package-lock.json* ./
RUN npm ci --only=production

# Stage 2: Builder
FROM node:20-alpine AS builder
WORKDIR /app

# Copy deps from previous stage
COPY --from=deps /app/node_modules ./node_modules
COPY . .

# Build the application
ENV NEXT_TELEMETRY_DISABLED=1
ENV NODE_ENV=production
RUN npm run build

# Stage 3: Runner
FROM node:20-alpine AS runner
WORKDIR /app

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1

# Install tools needed for port detection and healthchecks
RUN apk add --no-cache netcat-openbsd wget

# Create non-root user
RUN addgroup --system --gid 1001 nodejs
RUN adduser --system --uid 1001 nextjs

# Copy necessary files
COPY --from=builder /app/public ./public
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static
COPY --from=builder --chown=nextjs:nodejs /app/node_modules ./node_modules
COPY --from=builder --chown=nextjs:nodejs /app/package.json ./
COPY --from=builder --chown=nextjs:nodejs /app/drizzle ./drizzle
COPY --from=builder --chown=nextjs:nodejs /app/drizzle.config.ts ./
COPY --from=builder --chown=nextjs:nodejs /app/src/db/schema.ts ./src/db/schema.ts

# Copy and set up entrypoint script
COPY --chown=nextjs:nodejs scripts/docker-entrypoint.sh /usr/local/bin/
RUN chmod +x /usr/local/bin/docker-entrypoint.sh

# Create shared directory for port file (must be writable by nextjs)
RUN mkdir -p /var/run/synapsis && chown nextjs:nodejs /var/run/synapsis

# Switch to non-root user
USER nextjs

# Expose port range for auto-detection
EXPOSE 3000-3020

# Set environment variables (can be overridden at runtime)
ENV PORT=3000
ENV HOSTNAME="0.0.0.0"

# Health check (reads dynamic port file when PORT=auto)
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
  CMD sh -c 'PORT_FILE=/var/run/synapsis/port; PORT=3000; if [ -f "$PORT_FILE" ]; then PORT=$(cat "$PORT_FILE"); fi; case "$PORT" in ""|*[!0-9]*) PORT=3000;; esac; wget -q --spider "http://127.0.0.1:${PORT}/api/health" || exit 1'

# Use entrypoint script for port detection
ENTRYPOINT ["/usr/local/bin/docker-entrypoint.sh"]
