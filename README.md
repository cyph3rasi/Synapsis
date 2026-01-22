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

## Deployment

This project is optimized for deployment on **Vercel**.

1. Push your code to a Git repository.
2. Import the project into Vercel.
3. Add the required environment variables (`DATABASE_URL`, `AUTH_SECRET`, etc.) in the Vercel project settings.
4. Deploy.

## License

Licensed under the **Apache 2.0 License**. See [LICENSE](LICENSE) for details.
