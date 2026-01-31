# Synapsis Docker Production Deployment

One-command Docker deployment for Synapsis using pre-built images from GitHub Container Registry.

## 🚀 Quick Start

```bash
# 1. Create a directory for your Synapsis instance
mkdir -p /opt/synapsis
cd /opt/synapsis

# 2. Download the required files
curl -O https://raw.githubusercontent.com/cyph3rasi/synapsis/main/docker-compose.yml
curl -O https://raw.githubusercontent.com/cyph3rasi/synapsis/main/docker/Caddyfile
curl -O https://raw.githubusercontent.com/cyph3rasi/synapsis/main/docker/.env.example

# 3. Set up environment variables
cp .env.example .env
nano .env  # Edit all required values

# 4. Start the stack
docker compose up -d

# 5. Check logs
docker compose logs -f
```

Your Synapsis instance will be available at `https://your-domain.com` (Caddy automatically handles SSL).

---

## 📋 Server Requirements

| Resource | Minimum | Recommended |
|----------|---------|-------------|
| RAM | 2 GB | 4 GB |
| CPU | 2 cores | 4 cores |
| Disk | 20 GB SSD | 50 GB SSD |
| OS | Ubuntu 22.04/24.04, Debian 12, or compatible |

### Required Software
- Docker 24.0+
- Docker Compose 2.20+

### Installation (Ubuntu/Debian)
```bash
# Install Docker
curl -fsSL https://get.docker.com | sh
sudo usermod -aG docker $USER
newgrp docker

# Verify
docker --version
docker compose version
```

---

## 🔧 Configuration

### 1. Environment Variables

Copy `.env.example` to `.env` and configure:

```bash
cp .env.example .env
nano .env
```

**Required settings:**
- `DOMAIN` - Your domain name (e.g., `synapsis.example.com`)
- `DB_PASSWORD` - Strong database password
- `AUTH_SECRET` - Generate with `openssl rand -hex 32`
- `ADMIN_EMAILS` - Admin user email(s)
- `STORAGE_*` - S3-compatible storage credentials

### 2. DNS Setup

Point your domain's A record to your server's IP address:
```
A  synapsis.example.com  →  YOUR_SERVER_IP
```

Caddy will automatically obtain and renew SSL certificates via Let's Encrypt.

---

## 🔄 Updates

Updating is now simple - just pull the latest image:

```bash
cd /opt/synapsis

# Pull the latest image
docker compose pull

# Restart with new image
docker compose up -d

# Run migrations if needed
docker compose exec app npx drizzle-kit push

# Verify
docker compose ps
docker compose logs -f app
```

### One-Command Update Script

Create `update.sh`:
```bash
#!/bin/bash
cd /opt/synapsis
docker compose pull
docker compose up -d
docker compose exec -T app npx drizzle-kit push || true
echo "✅ Update complete!"
```

Make it executable and run:
```bash
chmod +x update.sh
./update.sh
```

---

## 📁 Directory Structure

```
/opt/synapsis/
├── docker-compose.yml      # Main orchestration file (downloaded from GitHub)
├── Caddyfile               # Caddy reverse proxy config
├── .env                    # Your environment variables
└── update.sh               # Optional update script
```

**Note:** You no longer need to clone the entire Git repository. Just download the three files above.

---

## 🛠️ Management Commands

### View Logs
```bash
docker compose logs -f app      # Application logs
docker compose logs -f caddy    # Caddy logs
docker compose logs -f postgres # Database logs
docker compose logs -f          # All logs
```

### Database Operations
```bash
# Access database shell
docker compose exec postgres psql -U synapsis -d synapsis

# Backup database
docker compose exec postgres pg_dump -U synapsis synapsis > backup.sql

# Restore database
docker compose exec -T postgres psql -U synapsis -d synapsis < backup.sql

# Run migrations manually
docker compose exec app npx drizzle-kit push
```

### Container Management
```bash
# Restart services
docker compose restart app
docker compose restart caddy

# Stop everything
docker compose down

# Stop and remove volumes (⚠️ destroys data!)
docker compose down -v

# View running containers
docker compose ps

# Enter container shell
docker compose exec app sh
docker compose exec postgres sh
```

---

## 🔒 Security Features

This Docker setup includes:

- **Immutable source code** - Application runs from pre-built image
- **Non-root execution** - App runs as unprivileged user
- **Network isolation** - Services communicate via internal Docker network
- **Automatic HTTPS** - Caddy handles SSL certificates
- **Security headers** - X-Frame-Options, X-Content-Type-Options, etc.
- **Resource limits** - Memory constraints on all containers
- **Health checks** - Automatic container health monitoring

---

## 🔍 Troubleshooting

### Container won't start
```bash
# Check for configuration errors
docker compose config

# View detailed logs
docker compose logs app --tail=100
```

### Database connection failed
```bash
# Check database is healthy
docker compose ps

# Verify environment variables
docker compose exec app env | grep DATABASE
```

### SSL certificate issues
```bash
# Check Caddy logs
docker compose logs caddy

# Test Caddy configuration
docker compose exec caddy caddy validate --config /etc/caddy/Caddyfile
```

### Port already in use
```bash
# Find process using port 80/443
sudo netstat -tlnp | grep :80

# Change ports in docker-compose.yml if needed
```

### Image pull fails
```bash
# Check if image exists
docker pull ghcr.io/cyph3rasi/synapsis:latest

# View available tags at:
# https://github.com/cyph3rasi/synapsis/pkgs/container/synapsis
```

---

## 📊 Monitoring

### Health Checks
- App: `https://your-domain.com/api/health`
- Caddy: Built into the Caddyfile

### Resource Usage
```bash
# Container stats
docker stats

# Disk usage
docker system df
```

---

## 💾 Backup Strategy

### Automated Backup Script

Create `/opt/synapsis/backup.sh`:
```bash
#!/bin/bash
BACKUP_DIR="/var/backups/synapsis"
DATE=$(date +%Y%m%d_%H%M%S)
mkdir -p $BACKUP_DIR

# Database backup
docker compose exec -T postgres pg_dump -U synapsis synapsis > "$BACKUP_DIR/db_$DATE.sql"

# Uploads backup
tar -czf "$BACKUP_DIR/uploads_$DATE.tar.gz" -C /var/lib/docker/volumes/synapsis_uploads_data/_data .

# Keep only last 7 days
find $BACKUP_DIR -type f -mtime +7 -delete

echo "✅ Backup complete: $DATE"
```

Add to crontab:
```bash
0 2 * * * /opt/synapsis/backup.sh >> /var/log/synapsis-backup.log 2>&1
```

---

## 🏗️ Building from Source (Advanced)

If you prefer to build the image locally instead of using the pre-built one:

```bash
# Clone the repository
git clone https://github.com/cyph3rasi/synapsis.git
cd synapsis/docker

# Build and run
docker compose -f docker-compose.build.yml up -d --build
```

See `docker-compose.yml` in the docker/ directory for the build configuration.

---

## 📞 Support

For issues or questions:
1. Check logs: `docker compose logs -f`
2. Review configuration: `docker compose config`
3. Consult the main Synapsis documentation: https://docs.synapsis.social

---

## 📝 License

This Docker configuration follows the same license as Synapsis (Apache 2.0).
