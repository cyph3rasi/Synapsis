'use client';

import { createContext, useContext, useEffect, useState } from 'react';
import { useUserIdentity } from '@/lib/hooks/useUserIdentity';

export interface User {
    id: string;
    handle: string;
    displayName: string;
    avatarUrl?: string;
    did?: string;
    publicKey?: string;
    privateKeyEncrypted?: string;
}

interface AuthContextType {
    user: User | null;
    isAdmin: boolean;
    loading: boolean;
    isIdentityUnlocked: boolean;
    did: string | null;
    handle: string | null;
    checkAdmin: () => Promise<void>;
    unlockIdentity: (password: string) => Promise<void>;
    logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType>({
    user: null,
    isAdmin: false,
    loading: true,
    isIdentityUnlocked: false,
    did: null,
    handle: null,
    checkAdmin: async () => { },
    unlockIdentity: async () => { },
    logout: async () => { },
});

export function AuthProvider({ children }: { children: React.ReactNode }) {
    const [user, setUser] = useState<User | null>(null);
    const [isAdmin, setIsAdmin] = useState(false);
    const [loading, setLoading] = useState(true);
    
    // Integrate useUserIdentity hook
    const {
        identity,
        isUnlocked,
        initializeIdentity,
        unlockIdentity: unlockIdentityHook,
        clearIdentity,
    } = useUserIdentity();

    const checkAdmin = async () => {
        try {
            const res = await fetch('/api/admin/me');
            const data = await res.json();
            setIsAdmin(!!data.isAdmin);
        } catch {
            setIsAdmin(false);
        }
    };

    /**
     * Unlock the user's identity with their password
     */
    const unlockIdentity = async (password: string) => {
        if (!user?.privateKeyEncrypted) {
            throw new Error('No encrypted private key available');
        }
        
        await unlockIdentityHook(user.privateKeyEncrypted, password);
    };

    /**
     * Logout the user and clear their identity
     */
    const logout = async () => {
        try {
            // Call the logout API endpoint
            await fetch('/api/auth/logout', { method: 'POST' });
            
            // Clear the user's identity (private key from localStorage)
            clearIdentity();
            
            // Clear the user state
            setUser(null);
            setIsAdmin(false);
        } catch (error) {
            console.error('[Auth] Logout failed:', error);
            throw error;
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
                    
                    // Initialize identity if we have the required data
                    if (data.user?.did && data.user?.publicKey && data.user?.privateKeyEncrypted) {
                        await initializeIdentity({
                            did: data.user.did,
                            handle: data.user.handle,
                            publicKey: data.user.publicKey,
                            privateKeyEncrypted: data.user.privateKeyEncrypted,
                        });
                    }
                    
                    if (data.user) {
                        await checkAdmin();
                    }
                } else {
                    setUser(null);
                    clearIdentity();
                }
            } catch {
                setUser(null);
                clearIdentity();
            } finally {
                setLoading(false);
            }
        };

        loadAuth();
    }, []);

    return (
        <AuthContext.Provider value={{ 
            user, 
            isAdmin, 
            loading, 
            isIdentityUnlocked: isUnlocked,
            did: identity?.did || null,
            handle: identity?.handle || null,
            checkAdmin,
            unlockIdentity,
            logout,
        }}>
            {children}
        </AuthContext.Provider>
    );
}

export const useAuth = () => useContext(AuthContext);
