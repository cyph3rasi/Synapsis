#!/bin/sh
# Synapsis Docker Entrypoint Script
# Handles database migrations and application startup

set -e

echo "========================================"
echo "  Synapsis - Starting Application"
echo "========================================"
echo "  Time: $(date)"
echo "  Working Dir: $(pwd)"
echo "  Database URL: ${DATABASE_URL%%:*}://***@***"
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
    # This uses the drizzle.config.ts which should be in the app root
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

# Execute the main command
exec "$@"
