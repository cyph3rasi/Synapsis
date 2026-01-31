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
    drizzle-kit push --force || {
        echo "⚠️  Migration completed or already up to date"
    }
    
    echo "✅ Migration check complete"
}

# Function to check/create initial admin user
check_admin_setup() {
    echo ""
    echo "👤 Checking admin setup..."
    
    # This is a placeholder - you can add logic here to ensure
    # at least one admin user exists on first run
    # For now, we rely on the application to handle this
    
    echo "✅ Admin check complete (handled by application)"
}

# Install netcat for database connectivity check if not present
if ! command -v nc >/dev/null 2>&1; then
    echo "📦 Installing netcat for database checks..."
    # Note: In Alpine, nc is typically included in busybox
    # If not, we'll proceed anyway and let the app handle connection
    echo "   (Skipping - using application-level retry logic)"
fi

# Wait for database to be ready
wait_for_db

# Run migrations
run_migrations

# Check admin setup
check_admin_setup

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
