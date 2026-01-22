import { NextResponse } from 'next/server';
import { db, reports, posts, users } from '@/db';
import { requireAdmin } from '@/lib/auth/admin';
import { desc, inArray, eq } from 'drizzle-orm';

export async function GET(request: Request) {
    try {
        await requireAdmin();

        if (!db) {
            return NextResponse.json({ error: 'Database not available' }, { status: 503 });
        }

        const { searchParams } = new URL(request.url);
        const status = searchParams.get('status') || 'open'; // open | resolved | all
        const limit = Math.min(parseInt(searchParams.get('limit') || '25'), 50);

        const reportRows = await db.query.reports.findMany({
            where: status === 'all' ? undefined : eq(reports.status, status),
            orderBy: [desc(reports.createdAt)],
            limit,
            with: {
                reporter: true,
                resolver: true,
            },
        });

        const postIds = reportRows
            .filter((report) => report.targetType === 'post')
            .map((report) => report.targetId);
        const userIds = reportRows
            .filter((report) => report.targetType === 'user')
            .map((report) => report.targetId);

        const postTargetsRaw = postIds.length
            ? await db.query.posts.findMany({
                where: inArray(posts.id, postIds),
                with: { author: true },
            })
            : [];
        const userTargetsRaw = userIds.length
            ? await db.query.users.findMany({
                where: inArray(users.id, userIds),
            })
            : [];

        const postTargets = postTargetsRaw.map((post) => ({
            id: post.id,
            content: post.content,
            createdAt: post.createdAt,
            isRemoved: post.isRemoved,
            author: {
                id: post.author.id,
                handle: post.author.handle,
                displayName: post.author.displayName,
            },
        }));

        const userTargets = userTargetsRaw.map((user) => ({
            id: user.id,
            handle: user.handle,
            displayName: user.displayName,
            isSuspended: user.isSuspended,
            isSilenced: user.isSilenced,
        }));

        const postMap = new Map(postTargets.map((post) => [post.id, post]));
        const userMap = new Map(userTargets.map((user) => [user.id, user]));

        const reportsWithTargets = reportRows.map((report) => ({
            id: report.id,
            targetType: report.targetType,
            targetId: report.targetId,
            reason: report.reason,
            status: report.status,
            createdAt: report.createdAt,
            reporter: report.reporter
                ? { id: report.reporter.id, handle: report.reporter.handle }
                : null,
            resolver: report.resolver
                ? { id: report.resolver.id, handle: report.resolver.handle }
                : null,
            target:
                report.targetType === 'post'
                    ? postMap.get(report.targetId) || null
                    : userMap.get(report.targetId) || null,
        }));

        return NextResponse.json({ reports: reportsWithTargets });
    } catch (error) {
        if (error instanceof Error && error.message === 'Admin required') {
            return NextResponse.json({ error: 'Admin required' }, { status: 403 });
        }
        console.error('Admin reports error:', error);
        return NextResponse.json({ error: 'Failed to fetch reports' }, { status: 500 });
    }
}
