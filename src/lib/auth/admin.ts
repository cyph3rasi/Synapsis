import { requireAuth } from '@/lib/auth';
import { users } from '@/db';

type User = typeof users.$inferSelect;

const normalizeList = (value?: string | null) =>
    (value || '')
        .split(',')
        .map((item) => item.trim().toLowerCase())
        .filter(Boolean);

const adminEmails = normalizeList(process.env.ADMIN_EMAILS);

export const isAdminUser = (user: User | null | undefined) => {
    if (!user) return false;
    if (user.email && adminEmails.length > 0 && adminEmails.includes(user.email.toLowerCase())) {
        return true;
    }
    return false;
};

export async function requireAdmin(): Promise<User> {
    const user = await requireAuth();
    if (!isAdminUser(user)) {
        throw new Error('Admin required');
    }
    return user;
}
