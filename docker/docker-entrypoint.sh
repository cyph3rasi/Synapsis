#!/bin/sh
# Synapsis Docker Entrypoint Script
# Handles database migrations, seeding, and application startup

set -e

echo "========================================"
echo "  Synapsis - Starting Application"
echo "========================================"

# Function to wait for database
wait_for_db() {
    echo "⏳ Waiting for PostgreSQL..."
    
    # Extract connection details from DATABASE_URL
    # Format: postgresql://user:password@host:port/database
    DB_HOST=$(echo "$DATABASE_URL" | sed -n 's/.*@\([^:]*\):.*/\1/p')
    DB_PORT=$(echo "$DATABASE_URL" | sed -n 's/.*:\([0-9]*\)\/.*/\1/p')
    
    # Default values
    DB_HOST=${DB_HOST:-postgres}
    DB_PORT=${DB_PORT:-5432}
    
    max_retries=30
    retry_count=0
    
    while ! nc -z "$DB_HOST" "$DB_PORT"; do
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
    
    # Run drizzle-kit push to create/update database schema
    # This creates tables if they don't exist
    npx drizzle-kit push --force 2>&1 || {
        echo "⚠️  Migration push returned non-zero (may be already up to date or error)"
        echo "   Continuing anyway..."
    }
    
    echo "✅ Migration check complete"
}

# Wait for database to be ready
wait_for_db

# Run migrations
run_migrations

# Display startup info
echo ""
echo "========================================"
echo "  🚀 Starting Synapsis Server"
echo "========================================"
echo "  Environment: $NODE_ENV"
echo "  Port: $PORT"
echo "  Database: Connected"
echo "========================================"
echo ""

# Execute the main command (passed as arguments)
exec "$@"
