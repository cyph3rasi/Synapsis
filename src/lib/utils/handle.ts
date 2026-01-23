export const NODE_DOMAIN = process.env.NEXT_PUBLIC_NODE_DOMAIN || 'localhost:3000';

/**
 * Formats a handle into its full federated form: @user@domain
 * If the handle already contains a domain (e.g. user@other.com), it returns it as @user@other.com
 * If it's a local handle (e.g. user), it appends the local node domain: @user@localnode.com
 */
export function formatFullHandle(handle: string): string {
    if (!handle) return '';

    // Remove leading @ if present for processing
    const cleanHandle = handle.startsWith('@') ? handle.slice(1) : handle;

    // Check if it already has a domain (contains @)
    if (cleanHandle.includes('@')) {
        return `@${cleanHandle}`;
    }

    // Append local node domain
    return `@${cleanHandle}@${NODE_DOMAIN}`;
}
