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

import { db } from "@/db";

export async function generateMetadata(): Promise<Metadata> {
  let title = "Synapsis";

  try {
    const node = await db.query.nodes.findFirst();
    if (node?.name) {
      title = node.name;
    }
  } catch (e) {
    console.error("Failed to fetch node info for metadata", e);
  }

  return {
    title: {
      default: title,
      template: `%s | ${title}`,
    },
    description: "Synapsis is designed to function like a global signal layer rather than a culture-bound platform. Anyone can run their own node and still participate in a shared, interconnected network, with global identity, clean terminology, and a modern interface that feels current rather than experimental.",
    manifest: "/manifest.json",
    icons: {
      icon: "/api/favicon",
    },
    themeColor: "#0a0a0a",
    viewport: "width=device-width, initial-scale=1, maximum-scale=1",
  };
}

// Force all routes to be dynamic (no static generation at build time)
// This is appropriate for a social network where all content is user-generated
export const dynamic = 'force-dynamic';

// This is appropriate for a social network where all content is user-generated

import { AuthProvider } from '@/lib/contexts/AuthContext';
import { ToastProvider } from '@/lib/contexts/ToastContext';
import { AccentColorProvider } from '@/lib/contexts/AccentColorContext';
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
          <AccentColorProvider>
            <ToastProvider>
              <LayoutWrapper>
                {children}
              </LayoutWrapper>
            </ToastProvider>
          </AccentColorProvider>
        </AuthProvider>
      </body>
    </html>
  );
}
