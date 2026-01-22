'use client';

import { useEffect } from 'react';
import { usePathname } from 'next/navigation';
import { Sidebar } from './Sidebar';
import { RightSidebar } from './RightSidebar';
import { useAuth } from '@/lib/contexts/AuthContext';

export function LayoutWrapper({ children }: { children: React.ReactNode }) {
    const { loading } = useAuth();

    // Paths that should NOT have the app layout
    const isStandalone =
        pathname === '/login' ||
        pathname === '/register' ||
        pathname?.startsWith('/install') ||
        pathname?.startsWith('/admin');

    useEffect(() => {
        const applyAccent = (color?: string | null) => {
            if (!color) return;
            const cleaned = color.trim();
            const normalized = cleaned.startsWith('#') ? cleaned : `#${cleaned}`;
            const hexMatch = /^#([0-9a-fA-F]{6})$/.exec(normalized);
            if (!hexMatch) return;

            const hex = hexMatch[1];
            const r = parseInt(hex.slice(0, 2), 16);
            const g = parseInt(hex.slice(2, 4), 16);
            const b = parseInt(hex.slice(4, 6), 16);

            const mix = (channel: number, target: number, amount: number) =>
                Math.round(channel + (target - channel) * amount);

            const hover = `rgb(${mix(r, 255, 0.12)}, ${mix(g, 255, 0.12)}, ${mix(b, 255, 0.12)})`;
            const muted = `rgba(${r}, ${g}, ${b}, 0.12)`;

            const root = document.documentElement;
            root.style.setProperty('--accent', `#${hex}`);
            root.style.setProperty('--accent-hover', hover);
            root.style.setProperty('--accent-muted', muted);
        };

        fetch('/api/node', { cache: 'no-store' })
            .then((res) => res.json())
            .then((data) => applyAccent(data?.accentColor))
            .catch(() => { });
    }, []);

    if (loading) {
        return (
            <div style={{
                height: '100vh',
                width: '100vw',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                background: 'var(--background)'
            }}>
                <div style={{
                    width: '24px',
                    height: '24px',
                    borderRadius: '50%',
                    border: '2px solid var(--border)',
                    borderTopColor: 'var(--accent)',
                    animation: 'spin 0.8s linear infinite'
                }} />
                <style jsx>{`
                    @keyframes spin {
                        to { transform: rotate(360deg); }
                    }
                `}</style>
            </div>
        );
    }

    if (isStandalone) {
        return <>{children}</>;
    }

    return (
        <div className="layout">
            <Sidebar />
            <main className="main">
                {children}
            </main>
            <RightSidebar />
        </div>
    );
}
