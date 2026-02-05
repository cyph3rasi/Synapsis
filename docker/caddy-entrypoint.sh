#!/bin/sh
# Caddy Entrypoint Script for Synapsis
# Reads the dynamic port from the shared file and starts Caddy

set -e

SHARED_PORT_FILE="/var/run/synapsis/port"
DEFAULT_PORT=3000

# Normalize DOMAIN (strip scheme/path) to avoid invalid Caddyfile hostnames
sanitize_domain() {
    echo "$1" | sed -E 's#^[a-zA-Z]+://##; s#/.*$##'
}

if [ -n "$DOMAIN" ]; then
    CLEAN_DOMAIN=$(sanitize_domain "$DOMAIN")
    if [ "$CLEAN_DOMAIN" != "$DOMAIN" ]; then
        export DOMAIN="$CLEAN_DOMAIN"
        echo "🌐 DOMAIN normalized to $DOMAIN"
    fi
fi

if [ -z "$DOMAIN" ]; then
    echo "❌ DOMAIN is not set. Exiting."
    exit 1
fi

# Wait for the port file to exist (with timeout)
echo "⏳ Waiting for Synapsis app to announce its port..."
TIMEOUT=60
ELAPSED=0

while [ ! -f "$SHARED_PORT_FILE" ] && [ $ELAPSED -lt $TIMEOUT ]; do
    sleep 1
    ELAPSED=$((ELAPSED + 1))
done

if [ -f "$SHARED_PORT_FILE" ]; then
    APP_PORT=$(cat "$SHARED_PORT_FILE")
    echo "✅ Found Synapsis app on port: $APP_PORT"
else
    echo "⚠️ Port file not found after ${TIMEOUT}s, using default port: $DEFAULT_PORT"
    APP_PORT=$DEFAULT_PORT
fi

export APP_PORT

# Validate that APP_PORT is a number
if ! echo "$APP_PORT" | grep -qE '^[0-9]+$'; then
    echo "❌ Invalid port number: $APP_PORT"
    exit 1
fi

echo "🌐 Starting Caddy reverse proxy to app:$APP_PORT..."
echo ""

# Start Caddy with the environment variable set
exec caddy run --config /etc/caddy/Caddyfile --adapter caddyfile
