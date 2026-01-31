# Synapsis

Synapsis is an open-source, federated social network built to serve as global communication infrastructure. It is designed to be lightweight, easy to deploy, and built on the Synapsis Swarm network.

## Features

- **Swarm Network**: Native peer-to-peer network for Synapsis nodes with gossip protocol.
- **Swarm Chat**: End-to-end encrypted chat system built for the swarm.
- **Decentralized Identity (DIDs)**: Portable identity system that you truly own.
- **AI Bots**: Create and manage AI-powered bot accounts with custom personalities.
- **Modern UI**: Clean, responsive interface inspired by Vercel's design system.
- **Rich Media**: Support for image uploads and media galleries.
- **Moderation**: Built-in admin dashboard for user management and content moderation.
- **Setup Wizard**: User-friendly `/install` flow to get your node running in minutes.
- **Curated Feeds**: Smart feed algorithms to highlight engaging content across the swarm.

---

## 📖 User Guide

New to Synapsis? Visit the **[/guide](/guide)** page in the app for a comprehensive walkthrough on:

- How the Swarm network works
- How Synapsis differs from traditional social networks
- How to follow users on other nodes
- How others can follow you
- Understanding Decentralized Identifiers (DIDs) and portable identity

---

## Architecture & Concepts

Synapsis differs from traditional social networks by prioritizing **sovereign identity** and **native peer-to-peer communication**.

### 🔐 Decentralized Identity (DIDs)

Unlike centralized platforms where your identity is a row in a database owned by a corporation, Synapsis uses a cryptographic identity system:

| Concept | Description |
|---------|-------------|
| **DID** | A unique, cryptographically-generated identifier (`did:key:...`) assigned to every user. This is your true identity that exists independently of any server. |
| **Handle** | A human-readable username (`@alice`) that points to your DID. Think of it like a domain name pointing to an IP address. |
| **Key Pair** | Every account has a public/private key pair. Your private key proves you are you; your public key lets others verify your identity. |

**Why this matters:**
- **Ownership**: Your identity is cryptographically yours, not controlled by a company.
- **Authenticity**: Every post is signed with your private key, proving it came from you.
- **True Portability**: Move your account between nodes without losing followers.

### 🌐 The Swarm Network

Synapsis operates on the **Swarm** — a native peer-to-peer network designed specifically for Synapsis nodes:

- **Gossip Protocol**: Nodes discover each other automatically and exchange information.
- **Swarm Timeline**: Aggregated feed of posts from across all Synapsis nodes.
- **Swarm Chat**: End-to-end encrypted direct messaging between users on any Synapsis node.
- **Handle Registry**: Distributed directory of user handles across the swarm.
- **Instant Interactions**: Likes, reposts, follows, and mentions delivered in real-time.

**Swarm Features:**
- Real-time post delivery across the network
- Encrypted chat with read receipts
- Automatic node discovery and health monitoring
- Distributed user directory
- Cross-node interactions (likes, reposts, follows)

### 🆚 Synapsis vs. Traditional Federation

| Feature | Traditional Federation | Synapsis |
|---------|------------------------|----------|
| **Identity** | Server-bound (`@user@server`) | DID-based (cryptographic, portable) |
| **Account Migration** | Limited (followers don't auto-migrate) | **Full**: DID-based migration with auto-follow |
| **Cryptographic Signing** | HTTP Signatures only | Full post signing with user keys |
| **Direct Messages** | Posts with limited visibility | True E2E encrypted chat |
| **Network Discovery** | Manual server discovery | Automatic gossip protocol |
| **AI Bots** | Not supported | Native bot framework with LLM integration |
| **Interactions** | Queue-based, delayed | Instant delivery via Swarm |

---

## Tech Stack

- **Framework**: [Next.js 15+](https://nextjs.org/) (App Router)
- **Database**: PostgreSQL (via [Neon](https://neon.tech) / Drizzle ORM)
- **Styling**: Tailwind CSS v4 & custom Vercel-like design system
- **Authentication**: Auth.js (NextAuth)
- **Type Safety**: TypeScript

---

## Recent Updates

### Swarm Chat (Latest)
- End-to-end encrypted messaging between Synapsis users
- Real-time delivery across nodes
- Read receipts and delivery status
- No legacy protocol limitations - built for the swarm
- See [SWARM_CHAT.md](SWARM_CHAT.md) for details

### Bug Fixes
- Fixed remote users appearing in local user lists
- Fixed duplicate posts in swarm feeds
- Improved swarm timeline filtering to only show local posts

### Swarm Network Improvements
- Enhanced gossip protocol for node discovery
- Improved handle registry synchronization
- Better error handling for cross-node communication

---

## 🚀 Run Your Own Node

### Quick Start (Docker - Recommended)

Deploy your own Synapsis node in minutes using Docker:

```bash
# 1. Create directory and download files
mkdir -p /opt/synapsis && cd /opt/synapsis
curl -O https://raw.githubusercontent.com/cyph3rasi/synapsis/main/docker-compose.yml
curl -O https://raw.githubusercontent.com/cyph3rasi/synapsis/main/docker/Caddyfile
curl -O https://raw.githubusercontent.com/cyph3rasi/synapsis/main/.env.example

# 2. Configure environment
cp .env.example .env
# Edit .env with your domain, database password, auth secret, etc.

# 3. Start your node
docker compose up -d
```

Your node will be available at `https://your-domain.com` with automatic SSL.

**Updating:**
```bash
docker compose pull && docker compose up -d
```

For detailed instructions, see [docker/README.md](docker/README.md).

### Documentation

For complete setup instructions, visit:

**📚 [docs.synapsis.social/run-your-own-node](https://docs.synapsis.social/run-your-own-node)**

---

## License

Licensed under the **Apache 2.0 License**. See [LICENSE](LICENSE) for details.
