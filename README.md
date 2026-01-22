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

## Architecture & Concepts

Synapsis differs from traditional social networks by prioritizing **sovereign identity** and **federated interoperability**.

### 🔐 The ID System
Unlike centralized platforms where your identity is a row in a database owned by a corporation, Synapsis uses a cryptographic identity system:
- **DIDs (Decentralized Identifiers)**: Every user is assigned a unique DID (`did:key:...`) upon registration. This is your true, portable identity that exists independently of any specific server.
- **Handles**: Human-readable names (e.g., `@alice`) are mapped to DIDs. This allows you to potentially move your account to a different node while keeping your connections, as the underlying DID remains the same.
- **Cryptographic Signing**: Every post and action is cryptographically signed using your private key, ensuring authenticity and preventing tampering.

### 🌐 Federation
Synapsis is designed as a network of independent **Nodes**.
- **Sovereign Data**: Communities can run their own Synapsis node, setting their own moderation rules and data policies.
- **Interconnectivity**: Nodes can talk to each other (via ActivityPub), allowing a user on *Node A* to follow and interact with a user on *Node B*.
- **Shared Protocol**: By adhering to open standards (WebFinger, NodeInfo), Synapsis plays nicely with the broader Fediverse.

## Tech Stack

- **Framework**: [Next.js 15+](https://nextjs.org/) (App Router)
- **Database**: PostgreSQL (via [Neon](https://neon.tech) / Drizzle ORM)
- **Styling**: Tailwind CSS v4 & custom Vercel-like design system
- **Authentication**: Auth.js (NextAuth)
- **Type Safety**: TypeScript

## Installation & Setup

You can run Synapsis locally for development or deploy it to a VPS for production.

### Prerequisites

- Node.js 18+
- PostgreSQL database (e.g., [Neon](https://neon.tech) or self-hosted)
- Domain name (for production)

### 1. Clone & Install

```bash
git clone https://github.com/cyph3rasi/Synapsis.git
cd Synapsis
npm install
```

### 2. Configure Environment

Copy the example configuration:
```bash
cp .env.example .env
```

Edit `.env` with your credentials:
```env
# Database
DATABASE_URL="postgresql://user:password@host/dbname..."

# Auth (Generate with: openssl rand -base64 33)
AUTH_SECRET="your-secret-key"

# Node Info
NEXT_PUBLIC_NODE_DOMAIN="localhost:3000" # Use your domain for production
NEXT_PUBLIC_NODE_NAME="My Synapsis Node"

# Admin Access
ADMIN_EMAILS="admin@example.com"
```

### 3. Initialize Database
```bash
npm run db:push
```

### 4. Run the Application

**For Local Development:**
```bash
npm run dev
# Visit http://localhost:3000
```

**For Production (VPS):**
We recommend using **PM2** to run the app in the background.

```bash
# Build the project
npm run build

# Install PM2
sudo npm install -g pm2

# Start the app
pm2 start npm --name "synapsis" -- start
pm2 save
pm2 startup
```

### 5. Production Reverse Proxy (Optional)
For production, use Nginx to handle SSL and forward traffic to port 3000.

```nginx
server {
    server_name your-domain.com;
    location / {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
    }
}
```

## Updates

To update your node:

```bash
git pull origin main
npm install
npm run build
pm2 restart synapsis
```

## License

Licensed under the **Apache 2.0 License**. See [LICENSE](LICENSE) for details.
