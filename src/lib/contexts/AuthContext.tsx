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
    unlockIdentity: (password: string, explicitUser?: User) => Promise<void>;
    login: (user: User) => void;
    logout: () => Promise<void>;
    showUnlockPrompt: boolean;
    setShowUnlockPrompt: (show: boolean, onSuccess?: () => void) => void;
    signUserAction: (action: string, data: any) => Promise<any>;
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
    login: () => { },
    logout: async () => { },
    showUnlockPrompt: false,
    setShowUnlockPrompt: () => { },
    signUserAction: async () => Promise.reject('Not initialized'),
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
        signUserAction,
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

    const [showUnlockPrompt, _setShowUnlockPrompt] = useState(false);
    const [onUnlockCallback, setOnUnlockCallback] = useState<(() => void) | null>(null);

    const setShowUnlockPrompt = (show: boolean, onSuccess?: () => void) => {
        _setShowUnlockPrompt(show);
        if (show && onSuccess) {
            setOnUnlockCallback(() => onSuccess);
        } else if (!show) {
            // If hiding without success (cancel), clear callback ??? 
            // Actually unlockIdentity handles success case. 
            // If explicit hide (cancel), we should probably clear it.
            // But unlockIdentity calls setShowUnlockPrompt(false) on success too.
            // So we handle callback execution in unlockIdentity, 
            // and clearing in unlockIdentity OR here if it wasn't executed?

            // Let's rely on unlockIdentity to execute and clear.
            // If just closing dialog (cancel), we clear it.
            // But we don't know if this call is from cancel or success?
            // unlockIdentity calls this.
        }
    };

    // Clear callback on close if it wasn't executed? 
    // It's safer to clear it when closing prompt to avoid stale callbacks.
    // But unlockIdentity calls setShowUnlockPrompt(false) AFTER executing.
    // So:

    /**
     * Unlock the user's identity with their password
     */
    const unlockIdentity = async (password: string, explicitUser?: User) => {
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

        // Execute queued callback if exists
        if (onUnlockCallback) {
            try {
                onUnlockCallback();
            } catch (e) {
                console.error('Error executing unlock callback:', e);
            }
            setOnUnlockCallback(null);
        }

        setShowUnlockPrompt(false); // Close prompt on success
    };

    /**
     * Manually set the user state (called after successful login)
     */
    const login = (userData: User) => {
        setUser(userData);
        // We re-check admin status just in case
        checkAdmin();
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
            setShowUnlockPrompt(false);
            setOnUnlockCallback(null);

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
            login,
            logout,
            showUnlockPrompt,
            setShowUnlockPrompt,
            signUserAction,
        }}>
            {children}
        </AuthContext.Provider>
    );
}

export const useAuth = () => useContext(AuthContext);
