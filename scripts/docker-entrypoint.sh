#!/bin/sh
# Synapsis Docker Entrypoint Script
# Handles database migrations, port detection, and application startup

set -e

# Default port range for auto-detection
PORT_START=${PORT_START:-3000}
PORT_END=${PORT_END:-3020}

# Function to check if a port is available
check_port_available() {
    local port=$1
    if ! nc -z localhost "$port" 2>/dev/null; then
        return 0  # Port is available
    else
        return 1  # Port is in use
    fi
}

# Function to find first available port in range
find_available_port() {
    local start=$1
    local end=$2
    
    for port in $(seq "$start" "$end"); do
        if check_port_available "$port"; then
            echo "$port"
            return 0
        fi
    done
    
    echo "ERROR: No available ports found in range $start-$end" >&2
    return 1
}

# Handle PORT=auto
if [ "${PORT}" = "auto" ]; then
    echo "🔍 PORT=auto detected, scanning for available port in range ${PORT_START}-${PORT_END}..."
    
    DETECTED_PORT=$(find_available_port "$PORT_START" "$PORT_END")
    
    if [ $? -ne 0 ]; then
        echo "❌ Failed to find an available port. Exiting."
        exit 1
    fi
    
    export PORT="$DETECTED_PORT"
    echo "✅ Using automatically detected port: $PORT"
else
    echo "📡 Using configured port: $PORT"
fi

# Ensure PORT is set
if [ -z "$PORT" ]; then
    echo "⚠️ PORT not set, defaulting to 3000"
    export PORT=3000
fi

# Write port to shared file for Caddy to read
SHARED_PORT_FILE="/var/run/synapsis/port"
mkdir -p "$(dirname "$SHARED_PORT_FILE")"
echo "$PORT" > "$SHARED_PORT_FILE"
echo "📝 Port $PORT written to $SHARED_PORT_FILE"

# Export HOSTNAME for Next.js
export HOSTNAME="0.0.0.0"

# ============================================
# Database Migrations
# ============================================

echo ""
echo "========================================"
echo "  Synapsis - Starting Application"
echo "========================================"
echo "  Time: $(date)"
echo "  Working Dir: $(pwd)"
echo "  Database URL: ${DATABASE_URL%%:*}://***@***"
echo "  Port: $PORT"
echo "========================================"

# Ensure DATABASE_URL is set
if [ -z "$DATABASE_URL" ]; then
    echo "❌ DATABASE_URL is not set. Exiting."
    exit 1
fi

# Normalize domain inputs (strip scheme/path) to avoid localhost/protocol issues
sanitize_domain() {
    echo "$1" | sed -E 's#^[a-zA-Z]+://##; s#/.*$##'
}

# Normalize DOMAIN if provided
if [ -n "$DOMAIN" ]; then
    CLEAN_DOMAIN=$(sanitize_domain "$DOMAIN")
    if [ "$CLEAN_DOMAIN" != "$DOMAIN" ]; then
        export DOMAIN="$CLEAN_DOMAIN"
        echo "🌐 DOMAIN normalized to $DOMAIN"
    fi
fi

# Normalize NEXT_PUBLIC_NODE_DOMAIN if provided
if [ -n "$NEXT_PUBLIC_NODE_DOMAIN" ]; then
    CLEAN_NODE_DOMAIN=$(sanitize_domain "$NEXT_PUBLIC_NODE_DOMAIN")
    if [ "$CLEAN_NODE_DOMAIN" != "$NEXT_PUBLIC_NODE_DOMAIN" ]; then
        export NEXT_PUBLIC_NODE_DOMAIN="$CLEAN_NODE_DOMAIN"
        echo "🌐 NEXT_PUBLIC_NODE_DOMAIN normalized to $NEXT_PUBLIC_NODE_DOMAIN"
    fi
fi

# Ensure NEXT_PUBLIC_NODE_DOMAIN is set (fallback to DOMAIN)
if [ -z "$NEXT_PUBLIC_NODE_DOMAIN" ] && [ -n "$DOMAIN" ]; then
    export NEXT_PUBLIC_NODE_DOMAIN="$DOMAIN"
    echo "🌐 NEXT_PUBLIC_NODE_DOMAIN set to $NEXT_PUBLIC_NODE_DOMAIN"
fi

# Fail fast if running in production with localhost domain
if [ "$NODE_ENV" = "production" ]; then
    case "$NEXT_PUBLIC_NODE_DOMAIN" in
        ""|localhost|localhost:*|127.0.0.1|127.0.0.1:*)
            if [ -z "$ALLOW_LOCALHOST" ]; then
                echo "❌ NEXT_PUBLIC_NODE_DOMAIN is set to localhost in production."
                echo "   Set DOMAIN to your public domain in .env, or set ALLOW_LOCALHOST=1 to bypass."
                exit 1
            fi
            ;;
    esac
fi

# Ensure NEXT_PUBLIC_APP_URL is set for background jobs
if [ -z "$NEXT_PUBLIC_APP_URL" ] && [ -n "$NEXT_PUBLIC_NODE_DOMAIN" ]; then
    case "$NEXT_PUBLIC_NODE_DOMAIN" in
        http://*|https://*)
            NEXT_PUBLIC_APP_URL="$NEXT_PUBLIC_NODE_DOMAIN"
            ;;
        localhost*|127.0.0.1*)
            NEXT_PUBLIC_APP_URL="http://$NEXT_PUBLIC_NODE_DOMAIN"
            ;;
        *)
            NEXT_PUBLIC_APP_URL="https://$NEXT_PUBLIC_NODE_DOMAIN"
            ;;
    esac
    export NEXT_PUBLIC_APP_URL
    echo "🌐 NEXT_PUBLIC_APP_URL set to $NEXT_PUBLIC_APP_URL"
fi

# Function to wait for database
wait_for_db() {
    echo ""
    echo "⏳ Waiting for PostgreSQL..."
    
    # Extract host and port from DATABASE_URL
    DB_HOST=$(echo "$DATABASE_URL" | sed -n 's#.*@\([^/:]*\).*#\1#p')
    DB_PORT=$(echo "$DATABASE_URL" | sed -n 's#.*:\([0-9][0-9]*\)/.*#\1#p')
    DB_HOST=${DB_HOST:-postgres}
    DB_PORT=${DB_PORT:-5432}
    
    max_retries=30
    retry_count=0
    
    while ! nc -z "$DB_HOST" "$DB_PORT" 2>/dev/null; do
        retry_count=$((retry_count + 1))
        if [ $retry_count -ge $max_retries ]; then
            echo "❌ Failed to connect to database after $max_retries attempts"
            exit 1
        fi
        echo "   Attempt $retry_count/$max_retries - waiting for $DB_HOST:$DB_PORT..."
        sleep 2
    done
    
    echo "✅ Database is ready!"
}

# Function to run database migrations
run_migrations() {
    echo ""
    echo "🔄 Running database migrations..."
    echo "   Current directory: $(pwd)"
    echo "   Drizzle directory contents:"
    ls -la drizzle/ 2>/dev/null || echo "   (drizzle dir not found or empty)"
    
    # Run migrations using npm script
    echo "   Executing: npm run db:push"
    if npm run db:push 2>&1; then
        echo "✅ Migration step complete"
    else
        echo "❌ Migration failed"
        exit 1
    fi
}

# Wait for database
wait_for_db

# Run migrations
run_migrations

echo "🚀 Starting Synapsis on port $PORT..."
echo ""

# Start the Next.js application
exec node server.js
