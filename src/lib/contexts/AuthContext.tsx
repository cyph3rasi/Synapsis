'use client';

import { createContext, useContext, useEffect, useState, useCallback } from 'react';
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
    isRestoring: boolean;  // True while checking persistence
    did: string | null;
    handle: string | null;
    checkAdmin: () => Promise<void>;
    unlockIdentity: (password: string, explicitUser?: User) => Promise<void>;
    login: (user: User) => void;
    logout: () => Promise<void>;
    lockIdentity: () => Promise<void>;  // New: manual lock
    signUserAction: (action: string, data: any) => Promise<any>;
    requiresUnlock: boolean;  // True if user has encrypted key but not unlocked
    showUnlockPrompt: boolean;
    setShowUnlockPrompt: (show: boolean) => void;
}

const AuthContext = createContext<AuthContextType>({
    user: null,
    isAdmin: false,
    loading: true,
    isIdentityUnlocked: false,
    isRestoring: false,
    did: null,
    handle: null,
    checkAdmin: async () => { },
    unlockIdentity: async () => { },
    login: () => { },
    logout: async () => { },
    lockIdentity: async () => { },
    signUserAction: async () => Promise.reject('Not initialized'),
    requiresUnlock: false,
    showUnlockPrompt: false,
    setShowUnlockPrompt: () => { },
});

export function AuthProvider({ children }: { children: React.ReactNode }) {
    const [user, setUser] = useState<User | null>(null);
    const [isAdmin, setIsAdmin] = useState(false);
    const [loading, setLoading] = useState(true);
    const [showUnlockPrompt, setShowUnlockPrompt] = useState(false);

    // Integrate useUserIdentity hook with persistence
    const {
        identity,
        isUnlocked,
        isRestoring,
        initializeIdentity,
        unlockIdentity: unlockIdentityHook,
        lockIdentity: lockIdentityHook,
        clearIdentity,
        signUserAction,
    } = useUserIdentity();

    const checkAdmin = useCallback(async () => {
        try {
            const res = await fetch('/api/admin/me');
            const data = await res.json();
            setIsAdmin(!!data.isAdmin);
        } catch {
            setIsAdmin(false);
        }
    }, []);

    /**
     * Unlock the user's identity with their password
     * Persists the key for auto-unlock on refresh
     */
    const unlockIdentity = useCallback(async (password: string, explicitUser?: User) => {
        const targetUser = explicitUser || user;

        if (!targetUser?.privateKeyEncrypted) {
            throw new Error('No encrypted private key available');
        }

        await unlockIdentityHook(
            targetUser.privateKeyEncrypted,
            password,
            targetUser.did,
            targetUser.handle,
            targetUser.publicKey
        );

        setShowUnlockPrompt(false); // Close prompt on success
    }, [user, unlockIdentityHook]);

    /**
     * Manually lock the identity (user wants to secure their session)
     */
    const lockIdentity = useCallback(async () => {
        await lockIdentityHook();
    }, [lockIdentityHook]);

    /**
     * Manually set the user state (called after successful login)
     */
    const login = useCallback((userData: User) => {
        setUser(userData);
        checkAdmin();
        
        // Initialize identity - will try to auto-restore if possible
        if (userData.did && userData.publicKey) {
            initializeIdentity({
                did: userData.did,
                handle: userData.handle,
                publicKey: userData.publicKey,
                privateKeyEncrypted: userData.privateKeyEncrypted,
            });
        }
    }, [checkAdmin, initializeIdentity]);

    /**
     * Logout the user and clear their identity
     */
    const logout = useCallback(async () => {
        try {
            await fetch('/api/auth/logout', { method: 'POST' });
            await clearIdentity();
            setShowUnlockPrompt(false);
            setUser(null);
            setIsAdmin(false);
        } catch (error) {
            console.error('[Auth] Logout failed:', error);
            throw error;
        }
    }, [clearIdentity]);

    // Load auth state on mount
    useEffect(() => {
        const loadAuth = async () => {
            setLoading(true);
            try {
                const res = await fetch('/api/auth/me');
                if (res.ok) {
                    const data = await res.json();
                    setUser(data.user);

                    // Initialize identity - will auto-restore if persisted
                    if (data.user?.did && data.user?.publicKey) {
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
                    await clearIdentity();
                }
            } catch {
                setUser(null);
                await clearIdentity();
            } finally {
                setLoading(false);
            }
        };

        loadAuth();
    }, [checkAdmin, initializeIdentity, clearIdentity]);

    // Determine if unlock is required (has encrypted key but not unlocked)
    const requiresUnlock = !!user?.privateKeyEncrypted && !isUnlocked && !isRestoring;

    return (
        <AuthContext.Provider value={{
            user,
            isAdmin,
            loading,
            isIdentityUnlocked: isUnlocked,
            isRestoring,
            did: identity?.did || null,
            handle: identity?.handle || null,
            checkAdmin,
            unlockIdentity,
            login,
            logout,
            lockIdentity,
            signUserAction,
            requiresUnlock,
            showUnlockPrompt,
            setShowUnlockPrompt,
        }}>
            {children}
        </AuthContext.Provider>
    );
}

export const useAuth = () => useContext(AuthContext);
