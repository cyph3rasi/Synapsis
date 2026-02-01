# Synapsis

**Your node. Your network. Your identity.**

Synapsis is an open-source, federated social network built for the decentralized web. Run your own node, own your identity with DIDs, and communicate across the Swarm network with end-to-end encryption. No corporations. No lock-in. Just you and the network.

---

## 🚀 Deploy Your Own Node (5 Minutes)

Run your personal Synapsis node with a single command:

```bash
# 1. Download and start
mkdir -p /opt/synapsis && cd /opt/synapsis
curl -O https://raw.githubusercontent.com/cyph3rasi/synapsis/main/docker-compose.yml
curl -O https://raw.githubusercontent.com/cyph3rasi/synapsis/main/docker/Caddyfile
curl -O https://raw.githubusercontent.com/cyph3rasi/synapsis/main/docker/.env.example
cp .env.example .env

# 2. Edit .env with your domain and secrets (takes 2 minutes)
nano .env

# 3. Start your node
docker compose up -d
```

Done! Your node is live at `https://your-domain.com` with automatic SSL. No build step. No dependencies. No fuss.

**Updating:**
```bash
docker compose pull && docker compose up -d
```

For detailed Docker setup, see [docker/README.md](docker/README.md).

---

## ✨ Features

- **🌐 Swarm Network** — Native peer-to-peer network with automatic node discovery and gossip protocol
- **💬 Swarm Chat** — End-to-end encrypted messaging across the entire network
- **🔐 Decentralized Identity (DIDs)** — Cryptographic identity you truly own, portable between nodes
- **🤖 AI Bots** — Create AI-powered bot accounts with custom personalities
- **🎨 Modern UI** — Clean, responsive interface inspired by Vercel's design system
- **🖼️ Rich Media** — Image uploads, media galleries, and S3-compatible storage
- **🛡️ Built-in Moderation** — Admin dashboard for user management and content moderation
- **📱 Auto Port Detection** — Runs on the first available port (3000-3020) automatically
- **📊 Curated Feeds** — Smart algorithms highlighting engaging content across the swarm

---

## 📖 Documentation

- **[Docker Deployment Guide](docker/README.md)** — Complete production deployment instructions
- **[User Guide](/guide)** — Learn how Synapsis works (visit after installing)
- **[API Documentation](https://docs.synapsis.social)** — Developer reference

---

## 🏗️ Architecture

Synapsis differs from traditional social networks by prioritizing **sovereign identity** and **native peer-to-peer communication**.

### 🔐 Decentralized Identity (DIDs)

Unlike centralized platforms where your identity is a row in a database owned by a corporation, Synapsis uses a cryptographic identity system:

| Concept | Description |
|---------|-------------|
| **DID** | A unique, cryptographically-generated identifier (`did:key:...`) assigned to every user. This is your true identity that exists independently of any server. |
| **Handle** | A human-readable username (`@alice`) that points to your DID. Think of it like a domain name pointing to an IP address. |
| **Key Pair** | Every account has a public/private key pair. Your private key proves you are you; your public key lets others verify your identity. |

**Why this matters:**
- **Ownership** — Your identity is cryptographically yours, not controlled by a company
- **Authenticity** — Every post is signed with your private key, proving it came from you
- **True Portability** — Move your account between nodes without losing followers

### 🌐 The Swarm Network

Synapsis operates on the **Swarm** — a native peer-to-peer network designed specifically for Synapsis nodes:

- **Gossip Protocol** — Nodes discover each other automatically and exchange information
- **Swarm Timeline** — Aggregated feed of posts from across all Synapsis nodes
- **Swarm Chat** — End-to-end encrypted direct messaging between users on any Synapsis node
- **Handle Registry** — Distributed directory of user handles across the swarm
- **Instant Interactions** — Likes, reposts, follows, and mentions delivered in real-time

### 🆚 Synapsis vs. Traditional Federation

| Feature | Traditional Federation | Synapsis |
|---------|------------------------|----------|
| **Identity** | Server-bound (`@user@server`) | DID-based (cryptographic, portable) |
| **Account Migration** | Limited (followers don't auto-migrate) | **Full** — DID-based migration with auto-follow |
| **Cryptographic Signing** | HTTP Signatures only | Full post signing with user keys |
| **Direct Messages** | Posts with limited visibility | True E2E encrypted chat |
| **Network Discovery** | Manual server discovery | Automatic gossip protocol |
| **AI Bots** | Not supported | Native bot framework with LLM integration |
| **Interactions** | Queue-based, delayed | Instant delivery via Swarm |

---

## 🛠️ Development

Want to hack on Synapsis? Here's how to run it locally:

### Prerequisites
- Node.js 20+
- PostgreSQL 15+
- S3-compatible storage (or MinIO for local dev)

### Local Setup

```bash
# 1. Clone the repository
git clone https://github.com/cyph3rasi/synapsis.git
cd synapsis

# 2. Install dependencies
npm install

# 3. Configure environment
cp .env.example .env
# Edit .env with your local database and storage settings

# 4. Set up the database
npx drizzle-kit push

# 5. Run the development server
npm run dev
```

Visit `http://localhost:3000` — the app will redirect you to `/install` for initial setup.

### Tech Stack

- **Framework** — [Next.js 15+](https://nextjs.org/) (App Router)
- **Database** — PostgreSQL with [Drizzle ORM](https://orm.drizzle.team/)
- **Styling** — Tailwind CSS v4 & custom Vercel-like design system
- **Authentication** — Auth.js (NextAuth)
- **Type Safety** — TypeScript

---

## 📜 License

Licensed under the **Apache 2.0 License**. See [LICENSE](LICENSE) for details.

---

<p align="center">
  <strong>Run your node. Join the swarm. Own your social.</strong>
</p>
