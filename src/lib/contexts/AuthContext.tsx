'use client';

import { createContext, useContext, useEffect, useState } from 'react';

export interface User {
    id: string;
    handle: string;
    displayName: string;
    avatarUrl?: string;
}

interface AuthContextType {
    user: User | null;
    isAdmin: boolean;
    loading: boolean;
    checkAdmin: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType>({
    user: null,
    isAdmin: false,
    loading: true,
    checkAdmin: async () => { },
});

export function AuthProvider({ children }: { children: React.ReactNode }) {
    const [user, setUser] = useState<User | null>(null);
    const [isAdmin, setIsAdmin] = useState(false);
    const [loading, setLoading] = useState(true);

    const checkAdmin = async () => {
        try {
            const res = await fetch('/api/admin/me');
            const data = await res.json();
            setIsAdmin(!!data.isAdmin);
        } catch {
            setIsAdmin(false);
        }
    };

    useEffect(() => {
        const loadAuth = async () => {
            setLoading(true);
            try {
                const res = await fetch('/api/auth/me');
                if (res.ok) {
                    const data = await res.json();
                    setUser(data.user);
                    if (data.user) {
                        await checkAdmin();
                    }
                } else {
                    setUser(null);
                }
            } catch {
                setUser(null);
            } finally {
                setLoading(false);
            }
        };

        loadAuth();
    }, []);

    return (
        <AuthContext.Provider value={{ user, isAdmin, loading, checkAdmin }}>
            {children}
        </AuthContext.Provider>
    );
}

export const useAuth = () => useContext(AuthContext);
