#!/bin/sh
# Synapsis Docker Entrypoint Script
# Handles database migrations, port detection, and application startup

set -e

# ============================================
# Port Detection Configuration
# ============================================
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

# Function to wait for database
wait_for_db() {
    echo ""
    echo "⏳ Waiting for PostgreSQL..."
    
    # Extract host and port from DATABASE_URL
    DB_HOST=$(echo "$DATABASE_URL" | sed -n 's/.*@\([^:]*\):.*/\1/p')
    DB_PORT=$(echo "$DATABASE_URL" | sed -n 's/.*:\([0-9]*\)\/.*/\1/p')
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
    npm run db:push 2>&1 || {
        echo "⚠️  Migration command exited with error (may be already up to date)"
    }
    
    echo "✅ Migration step complete"
}

# Wait for database
wait_for_db

# Run migrations
run_migrations

# Final startup message
echo ""
echo "========================================"
echo "  🚀 Starting Synapsis Server"
echo "========================================"
echo "  Environment: $NODE_ENV"
echo "  Port: $PORT"
echo "  Node Version: $(node --version)"
echo "========================================"
echo ""

# Start the application
exec node server.js
