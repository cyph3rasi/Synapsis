# Synapsis

Synapsis is an open-source, federated social network built to serve as global communication infrastructure. It is designed to be lightweight, easy to deploy, and interoperable with the broader Fediverse.

## Features

- **Federation Ready**: Built with ActivityPub compatibility for cross-platform communication.
- **Decentralized Identity (DIDs)**: Portable identity system that you truly own.
- **Modern UI**: Clean, responsive interface inspired by Vercel's design system.
- **Rich Media**: Support for image uploads and media galleries.
- **Moderation**: Built-in admin dashboard for user management and content moderation.
- **Setup Wizard**: User-friendly `/install` flow to get your node running in minutes.
- **Curated Feeds**: Smart feed algorithms to highlight engaging content.

---

## 📖 User Guide

New to Synapsis or the Fediverse? Visit the **[/guide](/guide)** page in the app for a comprehensive walkthrough on:

- What the Fediverse is and how it works
- How Synapsis differs from platforms like Mastodon
- How to follow users on other servers
- How others can follow you
- Understanding Decentralized Identifiers (DIDs) and portable identity

---

## Architecture & Concepts

Synapsis differs from traditional social networks by prioritizing **sovereign identity** and **federated interoperability**.

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
- **Future Portability**: The foundation for moving your account between nodes without losing followers.

### 🌐 Federation via ActivityPub

Synapsis is designed as a network of independent **Nodes** that communicate using the ActivityPub protocol.

- **Sovereign Data**: Communities run their own Synapsis nodes with their own rules.
- **Interconnectivity**: A user on *Node A* can follow and interact with a user on *Node B*.
- **Fediverse Compatibility**: Synapsis can communicate with Mastodon, Pleroma, Misskey, and other ActivityPub platforms.

**How it works:**
1. **WebFinger**: When you search for `@user@other-server.com`, WebFinger discovers their profile.
2. **Follow Request**: Synapsis sends an ActivityPub `Follow` activity to the remote server.
3. **Content Delivery**: When they post, it's delivered to your inbox via ActivityPub.

### 🆚 Synapsis vs. Mastodon

| Feature | Mastodon | Synapsis |
|---------|----------|----------|
| **Identity** | Server-bound (`@user@server`) | DID-based (cryptographic, portable) |
| **Account Migration** | Limited (followers don't auto-migrate) | **Supported**: Full DID-based migration with auto-follow |
| **Cryptographic Signing** | HTTP Signatures only | Full post signing with user keys |
| **Protocol** | ActivityPub | ActivityPub + DID layer |

---

## Tech Stack

- **Framework**: [Next.js 15+](https://nextjs.org/) (App Router)
- **Database**: PostgreSQL (via [Neon](https://neon.tech) / Drizzle ORM)
- **Styling**: Tailwind CSS v4 & custom Vercel-like design system
- **Authentication**: Auth.js (NextAuth)
- **Type Safety**: TypeScript

---

## Run Your Own Node

For complete setup instructions, visit the official documentation:

**📚 [docs.synapsis.social/run-your-own-node](https://docs.synapsis.social/run-your-own-node)**

---

## License

Licensed under the **Apache 2.0 License**. See [LICENSE](LICENSE) for details.
