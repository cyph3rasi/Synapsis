#!/bin/sh
# Synapsis Docker Entrypoint Script
# Handles automatic port detection when PORT=auto

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

echo "🚀 Starting Synapsis on port $PORT..."
echo ""

# Start the Next.js application
exec node server.js
