import type { Metadata } from "next";
import { Inter, Saira_Condensed } from "next/font/google";
import "./globals.css";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
});

const sairaCondensed = Saira_Condensed({
  subsets: ["latin"],
  weight: ["700"],
  variable: "--font-saira",
});

export const metadata: Metadata = {
  title: "Synapsis",
  description: "Federated social network infrastructure",
  manifest: "/manifest.json",
  icons: {
    icon: "/favicon.png",
  },
  themeColor: "#0a0a0a",
  viewport: "width=device-width, initial-scale=1, maximum-scale=1",
};

// Force all routes to be dynamic (no static generation at build time)
// This is appropriate for a social network where all content is user-generated
export const dynamic = 'force-dynamic';

// This is appropriate for a social network where all content is user-generated

import { AuthProvider } from '@/lib/contexts/AuthContext';
import { LayoutWrapper } from '@/components/LayoutWrapper';

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className={`${inter.variable} ${sairaCondensed.variable}`}>
      <body>
        <AuthProvider>
          <LayoutWrapper>
            {children}
          </LayoutWrapper>
        </AuthProvider>
      </body>
    </html>
  );
}
