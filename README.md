# Synapsis

Synapsis is an open-source, federated social network built to serve as global communication infrastructure. It is designed to be lightweight, easy to deploy, and interoperable with the broader fediverse.

## Features

- **Federation Ready**: Built with ActivityPub compatibility in mind (WebFinger, NodeInfo).
- **Identity**: Portable identity system backed by user handles.
- **Modern UI**: Clean, responsive interface inspired by Vercel's design system.
- **Rich Media**: Support for image uploads and media galleries.
- **Moderation**: Built-in admin dashboard for user management and content moderation.
- **Setup Wizard**: User-friendly `/install` flow to get your node running in minutes.
- **Curated Feeds**: Smart feed algorithms to highlight engaging content.

## Tech Stack

- **Framework**: [Next.js 15+](https://nextjs.org/) (App Router)
- **Database**: PostgreSQL (via [Neon](https://neon.tech) / Drizzle ORM)
- **Styling**: Tailwind CSS v4 & custom Vercel-like design system
- **Authentication**: Auth.js (NextAuth)
- **Type Safety**: TypeScript

## Getting Started

### Prerequisites

- Node.js 18+
- A PostgreSQL database (e.g., [Neon](https://neon.tech))

### Installation

1. **Clone the repository**
   ```bash
   git clone https://github.com/cyph3rasi/Synapsis.git
   cd Synapsis
   ```

2. **Install dependencies**
   ```bash
   npm install
   ```

3. **Configure Environment**
   Copy the example environment file:
   ```bash
   cp .env.example .env
   ```

   Update `.env` with your credentials:
   ```env
   # Database (PostgreSQL connection string)
   DATABASE_URL="postgresql://user:password@host/dbname..."

   # Auth (Generate with: openssl rand -base64 33)
   AUTH_SECRET="your-secret-key"

   # Node Configuration
   NEXT_PUBLIC_NODE_DOMAIN="your-domain.com"
   NEXT_PUBLIC_NODE_NAME="My Synapsis Node"

   # Admin Access (Comma-separated emails)
   ADMIN_EMAILS="admin@example.com,moderator@example.com"
   ```

4. **Initialize Database**
   Push the schema to your database:
   ```bash
   npm run db:push
   ```

5. **Start Development Server**
   ```bash
   npm run dev
   ```
   Visit `http://localhost:3000` to see your node.

### Initial Setup

1. Go to `http://localhost:3000` (or your deployed URL).
2. You will be redirected to the **Setup Wizard** (`/install`) if the node is not configured.
3. Follow the wizard to verify your environment and database connection.
4. **Register your first account**.
5. Add your email to `ADMIN_EMAILS` in your `.env` file to grant yourself admin privileges.
6. Restart the server (if running locally) to apply the admin changes.

## Deployment (VPS)

Since Synapsis stores media files locally by default, it is best hosted on a VPS (Virtual Private Server) like DigitalOcean, Hetzner, or AWS EC2.

### Prerequisites

- A VPS running Ubuntu 20.04 or later.
- A domain name pointing to your VPS IP address.
- PostgreSQL database (managed or self-hosted).

### 1. Server Setup

Install Node.js 18+ and PM2 (process manager):

```bash
# Install Node.js
curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
sudo apt-get install -y nodejs

# Install PM2
sudo npm install -g pm2
```

### 2. Installation

Clone and configure the application:

```bash
# Clone repo
git clone https://github.com/cyph3rasi/Synapsis.git
cd Synapsis

# Install dependencies
npm install

# Setup Env
cp .env.example .env
nano .env # (Edit with your DB credentials and domain)

# Build the project
npm run build

# Push Database Schema
npm run db:push
```

### 3. Start Application

Use PM2 to run the app in the background:

```bash
pm2 start npm --name "synapsis" -- start
pm2 save
pm2 startup
```

Your node is now running on port 3000!

### 4. Reverse Proxy (Nginx)

It is highly recommended to use Nginx to handle SSL and forward traffic to port 3000.

```nginx
server {
    server_name your-domain.com;

    location / {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
    }
}
```

## Updating Your Instance

To update your node when a new version is released:

```bash
cd Synapsis
git pull origin main
npm install
npm run build
pm2 restart synapsis
```

## License

Licensed under the **Apache 2.0 License**. See [LICENSE](LICENSE) for details.
