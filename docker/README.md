# Synapsis Docker Production Deployment

One-command Docker deployment for Synapsis that solves the "user modifies file and breaks git sync" problem.

## 🚀 Quick Start

```bash
cd /var/www/Synapsis/docker

# 1. Copy and edit environment variables
cp .env.example .env
nano .env  # Edit all required values

# 2. Start the stack
docker-compose up -d

# 3. Check logs
docker-compose logs -f
```

Your Synapsis instance will be available at `http://localhost` (or your configured domain).

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
docker-compose --version
```

---

## 🔧 Configuration

### 1. Environment Variables

Copy `.env.example` to `.env` and configure:

```bash
cd /var/www/Synapsis/docker
cp .env.example .env
```

**Required settings:**
- `DOMAIN` - Your domain name (e.g., `synapsis.example.com`)
- `DB_PASSWORD` - Strong database password
- `AUTH_SECRET` - Generate with `openssl rand -hex 32`
- `ADMIN_EMAILS` - Admin user email(s)
- `STORAGE_*` - S3-compatible storage credentials

### 2. SSL/HTTPS Setup

#### Option A: Let's Encrypt (Recommended)

1. Start with HTTP first:
```bash
docker-compose up -d
```

2. Obtain SSL certificates:
```bash
docker run -it --rm \
  -v ./certbot_data:/etc/letsencrypt \
  -v ./certbot_www:/var/www/certbot \
  -p 80:80 \
  certbot/certbot certonly \
  --standalone \
  -d your-domain.com
```

3. Enable SSL configuration:
```bash
cd nginx/conf.d
mv default.conf default.conf.http
mv default.conf.ssl default.conf
# Edit default.conf and replace ${DOMAIN} with your actual domain
docker-compose restart nginx
```

4. Uncomment the certbot service in docker-compose.yml for auto-renewal.

#### Option B: Custom SSL Certificates

Place your certificates in `./certbot_data/live/your-domain.com/`:
- `fullchain.pem`
- `privkey.pem`

---

## 🔄 Updates

### Standard Update Process

```bash
cd /var/www/Synapsis/docker

# 1. Pull latest changes
git pull origin main

# 2. Rebuild and restart
docker-compose down
docker-compose pull  # If using pre-built images
docker-compose up -d --build

# 3. Run migrations (if needed)
docker-compose exec app npx drizzle-kit push

# 4. Verify
docker-compose ps
docker-compose logs -f app
```

### One-Command Update Script

Create `update.sh`:
```bash
#!/bin/bash
cd /var/www/Synapsis/docker
git pull origin main
docker-compose down
docker-compose up -d --build
docker-compose exec -T app npx drizzle-kit push || true
echo "✅ Update complete!"
```

---

## 📁 Directory Structure

```
/var/www/Synapsis/docker/
├── docker-compose.yml      # Main orchestration file
├── Dockerfile              # Multi-stage build
├── docker-entrypoint.sh    # Startup script
├── .env                    # Your environment variables
├── .env.example            # Template
├── .dockerignore           # Build exclusions
├── nginx/
│   ├── nginx.conf          # Main Nginx config
│   └── conf.d/
│       ├── default.conf          # HTTP config
│       └── default.conf.ssl      # HTTPS config
└── README.md               # This file
```

---

## 🛠️ Management Commands

### View Logs
```bash
docker-compose logs -f app      # Application logs
docker-compose logs -f nginx    # Nginx logs
docker-compose logs -f postgres # Database logs
docker-compose logs -f          # All logs
```

### Database Operations
```bash
# Access database shell
docker-compose exec postgres psql -U synapsis -d synapsis

# Backup database
docker-compose exec postgres pg_dump -U synapsis synapsis > backup.sql

# Restore database
docker-compose exec -T postgres psql -U synapsis -d synapsis < backup.sql

# Run migrations manually
docker-compose exec app npx drizzle-kit push
```

### Container Management
```bash
# Restart services
docker-compose restart app
docker-compose restart nginx

# Stop everything
docker-compose down

# Stop and remove volumes (⚠️ destroys data!)
docker-compose down -v

# View running containers
docker-compose ps

# Enter container shell
docker-compose exec app sh
docker-compose exec postgres sh
```

---

## 🔒 Security Features

This Docker setup includes:

- **Immutable source code** - Application runs from image, not bind-mounted files
- **Non-root execution** - App runs as unprivileged user
- **Network isolation** - Services communicate via internal Docker network
- **Rate limiting** - Nginx protects against brute force attacks
- **Security headers** - X-Frame-Options, X-Content-Type-Options, etc.
- **Resource limits** - Memory constraints on all containers
- **Health checks** - Automatic container health monitoring

---

## 🔍 Troubleshooting

### Container won't start
```bash
# Check for configuration errors
docker-compose config

# View detailed logs
docker-compose logs app --tail=100
```

### Database connection failed
```bash
# Check database is healthy
docker-compose ps

# Verify environment variables
docker-compose exec app env | grep DATABASE
```

### SSL certificate issues
```bash
# Test SSL configuration
docker-compose exec nginx nginx -t

# Check certificate files
ls -la certbot_data/live/
```

### Port already in use
```bash
# Find process using port 80/443
sudo netstat -tlnp | grep :80

# Change ports in docker-compose.yml if needed
```

---

## 📊 Monitoring

### Health Checks
- App: `http://your-domain/api/health`
- Nginx: `http://your-domain/nginx-health`

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

Create `/var/www/Synapsis/docker/backup.sh`:
```bash
#!/bin/bash
BACKUP_DIR="/var/backups/synapsis"
DATE=$(date +%Y%m%d_%H%M%S)
mkdir -p $BACKUP_DIR

# Database backup
docker-compose exec -T postgres pg_dump -U synapsis synapsis > "$BACKUP_DIR/db_$DATE.sql"

# Uploads backup
tar -czf "$BACKUP_DIR/uploads_$DATE.tar.gz" -C /var/lib/docker/volumes/synapsis_uploads_data/_data .

# Keep only last 7 days
find $BACKUP_DIR -type f -mtime +7 -delete

echo "✅ Backup complete: $DATE"
```

Add to crontab:
```bash
0 2 * * * /var/www/Synapsis/docker/backup.sh >> /var/log/synapsis-backup.log 2>&1
```

---

## 📞 Support

For issues or questions:
1. Check logs: `docker-compose logs -f`
2. Review configuration: `docker-compose config`
3. Consult the main Synapsis documentation

---

## 📝 License

This Docker configuration follows the same license as Synapsis (Apache 2.0).
