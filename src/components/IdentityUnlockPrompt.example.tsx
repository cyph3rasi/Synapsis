/**
 * Example Usage of IdentityUnlockPrompt Component
 * 
 * This file demonstrates how to use the IdentityUnlockPrompt modal component
 * in your application.
 */

'use client';

import { useState } from 'react';
import { useAuth } from '@/lib/contexts/AuthContext';
import { IdentityUnlockPrompt } from './IdentityUnlockPrompt';

export function ExampleUsage() {
    const { isIdentityUnlocked } = useAuth();
    const [showUnlockPrompt, setShowUnlockPrompt] = useState(false);

    // Example 1: Show unlock prompt when user tries to perform an action
    const handleLikePost = async () => {
        if (!isIdentityUnlocked) {
            setShowUnlockPrompt(true);
            return;
        }

        // Proceed with the action (e.g., like the post)
        console.log('Liking post...');
    };

    // Example 2: Handle successful unlock
    const handleUnlock = () => {
        console.log('Identity unlocked successfully!');
        setShowUnlockPrompt(false);
        
        // Optionally retry the action that triggered the prompt
        // For example, if user tried to like a post, like it now
    };

    // Example 3: Handle cancel
    const handleCancel = () => {
        console.log('User cancelled unlock');
        setShowUnlockPrompt(false);
    };

    return (
        <div>
            {/* Your UI components */}
            <button onClick={handleLikePost}>
                Like Post
            </button>

            {/* Show unlock prompt when needed */}
            {showUnlockPrompt && (
                <IdentityUnlockPrompt
                    onUnlock={handleUnlock}
                    onCancel={handleCancel}
                />
            )}
        </div>
    );
}

/**
 * Example 2: Using the component without callbacks
 * 
 * The component can be used without callbacks if you just want
 * to unlock the identity without any additional actions.
 */
export function SimpleExample() {
    const [showUnlockPrompt, setShowUnlockPrompt] = useState(false);

    return (
        <div>
            <button onClick={() => setShowUnlockPrompt(true)}>
                Unlock Identity
            </button>

            {showUnlockPrompt && (
                <IdentityUnlockPrompt
                    onCancel={() => setShowUnlockPrompt(false)}
                />
            )}
        </div>
    );
}

/**
 * Example 3: Integration with action buttons
 * 
 * This example shows how to integrate the unlock prompt with
 * action buttons that require a signed action.
 */
export function ActionButtonExample() {
    const { isIdentityUnlocked } = useAuth();
    const [showUnlockPrompt, setShowUnlockPrompt] = useState(false);
    const [pendingAction, setPendingAction] = useState<(() => void) | null>(null);

    const requireUnlock = (action: () => void) => {
        if (!isIdentityUnlocked) {
            setPendingAction(() => action);
            setShowUnlockPrompt(true);
            return;
        }
        action();
    };

    const handleUnlock = () => {
        setShowUnlockPrompt(false);
        
        // Execute the pending action after unlock
        if (pendingAction) {
            pendingAction();
            setPendingAction(null);
        }
    };

    const handleCancel = () => {
        setShowUnlockPrompt(false);
        setPendingAction(null);
    };

    return (
        <div>
            <button onClick={() => requireUnlock(() => console.log('Like'))}>
                Like
            </button>
            <button onClick={() => requireUnlock(() => console.log('Follow'))}>
                Follow
            </button>
            <button onClick={() => requireUnlock(() => console.log('Post'))}>
                Post
            </button>

            {showUnlockPrompt && (
                <IdentityUnlockPrompt
                    onUnlock={handleUnlock}
                    onCancel={handleCancel}
                />
            )}
        </div>
    );
}
