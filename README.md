# Project Synapsis

An open-source, federated social network designed as global communication infrastructure.

## Features

- **Federation**: ActivityPub-compatible, interoperable with Mastodon and other fediverse platforms
- **Global Identity**: Portable identity backed by DIDs - your handle works everywhere
- **Easy Deployment**: Deploy to Vercel with one click, no Docker or complex setup required
- **Modern UX**: Clean, Vercel-inspired dark theme with responsive design
- **Transparent Feeds**: Chronological and curated feeds with clear algorithms
- **Moderation**: Admin dashboard for reports, post removals, and user actions

## Quick Start

### Prerequisites

- Node.js 18+
- A Neon PostgreSQL database (free tier available at https://neon.tech)
- An Upstash Redis database (free tier available at https://upstash.com)

### Setup

1. Clone the repository:
   ```bash
   git clone https://github.com/your-username/synapsis.git
   cd synapsis
   ```

2. Install dependencies:
   ```bash
   npm install
   ```

3. Copy the environment example and configure:
   ```bash
   cp .env.example .env
   ```

4. Update `.env` with your database credentials:
   ```
   DATABASE_URL=postgresql://...
   UPSTASH_REDIS_REST_URL=https://...
   UPSTASH_REDIS_REST_TOKEN=...
  AUTH_SECRET=generate-a-random-string
  NEXT_PUBLIC_NODE_DOMAIN=your-domain.com
  NEXT_PUBLIC_NODE_NAME=My Synapsis Node
  ADMIN_EMAILS=comma,separated,emails
  ```

5. Run database migrations:
   ```bash
   npm run db:push
   ```

6. Start the development server:
   ```bash
   npm run dev
   ```

### Deploy to Vercel

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https://github.com/your-username/synapsis)

1. Click the button above
2. Connect your Neon PostgreSQL and Upstash Redis
3. Configure environment variables
4. Deploy!

## Architecture

- **Frontend**: Next.js 14+ with App Router
- **Backend**: Next.js API Routes (serverless)
- **Database**: PostgreSQL via Neon
- **Cache**: Redis via Upstash
- **Federation**: ActivityPub protocol

## API Endpoints

### Authentication
- `POST /api/auth/register` - Create account
- `POST /api/auth/login` - Login
- `POST /api/auth/logout` - Logout
- `GET /api/auth/me` - Get current user

### Posts
- `POST /api/posts` - Create a post
- `GET /api/posts` - Get feed
- `POST /api/posts/[id]/like` - Like a post
- `DELETE /api/posts/[id]/like` - Unlike a post
- `POST /api/posts/[id]/repost` - Repost

### Federation
- `GET /.well-known/webfinger` - WebFinger discovery
- `GET /.well-known/nodeinfo` - NodeInfo discovery
- `GET /nodeinfo/2.1` - Node metadata
- `GET /.well-known/synapsis-handles` - Handle registry export
- `POST /api/federation/handles` - Ingest handle registry from peers
- `POST /api/federation/gossip` - Pull registry from peer nodes (admin)
- `GET /api/handles/resolve` - Resolve handle to DID

### Installation
- `GET /install` - Setup wizard
- `GET /api/install/status` - Installation status

## License

Apache 2.0 License - see LICENSE file for details.
