import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Enable standalone output for Docker deployment
  // This creates a minimal server.js that doesn't require full node_modules
  output: 'standalone',
  
  // Turbopack configuration
  turbopack: {},
};

export default nextConfig;
