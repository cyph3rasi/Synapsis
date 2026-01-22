'use client';

import { usePathname } from 'next/navigation';
import { Sidebar } from './Sidebar';
import { RightSidebar } from './RightSidebar';

export function LayoutWrapper({ children }: { children: React.ReactNode }) {
    const pathname = usePathname();

    // Paths that should NOT have the app layout
    const isStandalone =
        pathname === '/login' ||
        pathname === '/register' ||
        pathname?.startsWith('/install') ||
        pathname?.startsWith('/admin');

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
