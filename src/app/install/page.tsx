'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';

export const dynamic = 'force-dynamic';

type EnvStatus = {
    required: Record<string, boolean>;
    optional: Record<string, boolean>;
};

type InstallStatus = {
    env: EnvStatus;
    db: {
        connected: boolean;
        schemaReady: boolean;
        usersCount: number;
    };
};

const requiredLabels: Record<string, string> = {
    DATABASE_URL: 'Database connection string',
    AUTH_SECRET: 'Auth cookie secret',
    NEXT_PUBLIC_NODE_DOMAIN: 'Public node domain',
    NEXT_PUBLIC_NODE_NAME: 'Node display name',
    ADMIN_EMAILS: 'Admin emails list',
};

const optionalLabels: Record<string, string> = {};

const StepCard = ({
    title,
    description,
    status,
    children,
}: {
    title: string;
    description?: string;
    status?: { label: string; tone: 'ok' | 'warn' };
    children: React.ReactNode;
}) => (
    <div className="install-card">
        <div className="install-card-header">
            <div>
                <div className="install-card-title">{title}</div>
                {description && <div className="install-card-desc">{description}</div>}
            </div>
            {status && (
                <div className={`install-step-status ${status.tone}`}>
                    {status.label}
                </div>
            )}
        </div>
        {children}
    </div>
);

export default function InstallPage() {
    const searchParams = useSearchParams();
    const force = searchParams.get('force') === '1';
    const [status, setStatus] = useState<InstallStatus | null>(null);
    const [loading, setLoading] = useState(true);

    const loadStatus = async () => {
        setLoading(true);
        try {
            const res = await fetch('/api/install/status');
            const data = await res.json();
            setStatus(data);
        } catch {
            setStatus(null);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        loadStatus();
    }, []);

    const isInstalled = status?.db.connected && status?.db.schemaReady && status?.db.usersCount > 0;

    if (loading) {
        return (
            <div className="install-shell">
                <div className="install-card">Checking install status...</div>
            </div>
        );
    }

    if (!status) {
        return (
            <div className="install-shell">
                <div className="install-card">
                    <h1>Setup Wizard</h1>
                    <p>We could not load the install status.</p>
                    <button className="btn btn-primary" onClick={loadStatus}>
                        Retry
                    </button>
                </div>
            </div>
        );
    }

    if (isInstalled && !force) {
        return (
            <div className="install-shell">
                <div className="install-card">
                    <h1>Synapsis is already set up</h1>
                    <p>Your database is connected and at least one user exists.</p>
                    <Link href="/" className="btn btn-primary" style={{ marginTop: '12px' }}>
                        Go to home
                    </Link>
                    <Link href="/install?force=1" className="btn btn-ghost" style={{ marginTop: '12px' }}>
                        Re-run setup
                    </Link>
                </div>
            </div>
        );
    }

    const missingRequired = Object.entries(status.env.required).filter(([, ok]) => !ok);
    const missingOptional = Object.entries(status.env.optional).filter(([, ok]) => !ok);
    const envComplete = missingRequired.length === 0;
    const dbComplete = status.db.connected && status.db.schemaReady;
    const adminComplete = status.db.usersCount > 0;
    const completedSteps = [envComplete, dbComplete, adminComplete].filter(Boolean).length;
    const progressPercent = Math.round((completedSteps / 3) * 100);

    return (
        <div className="install-shell">
            <div className="install-hero">
                <div className="install-header">
                    <div>
                        <h1>Synapsis Setup</h1>
                        <p>Follow these steps to complete your installation.</p>
                    </div>
                    <button className="btn btn-ghost" onClick={loadStatus}>
                        Recheck
                    </button>
                </div>
                <div className="install-progress">
                    <div className="install-progress-bar">
                        <div className="install-progress-fill" style={{ width: `${progressPercent}%` }} />
                    </div>
                    <div className="install-progress-meta">
                        <span>{completedSteps} / 3 steps complete</span>
                        <span>{progressPercent}%</span>
                    </div>
                </div>
                <div className="install-summary">
                    <div>
                        <div className="install-summary-title">Environment</div>
                        <div className="install-summary-value">{envComplete ? 'Ready' : 'Needs values'}</div>
                    </div>
                    <div>
                        <div className="install-summary-title">Database</div>
                        <div className="install-summary-value">{dbComplete ? 'Ready' : 'Not ready'}</div>
                    </div>
                    <div>
                        <div className="install-summary-title">Admin</div>
                        <div className="install-summary-value">{adminComplete ? 'Ready' : 'Not created'}</div>
                    </div>
                </div>
            </div>

            <StepCard
                title="1. Environment variables"
                description="Set required values in your deployment environment (.env or platform settings)."
                status={{
                    label: envComplete ? 'Complete' : 'Needs attention',
                    tone: envComplete ? 'ok' : 'warn',
                }}
            >
                <div className="install-grid">
                    {Object.entries(status.env.required).map(([key, ok]) => (
                        <div key={key} className={`install-item ${ok ? 'ok' : 'missing'}`}>
                            <div className="install-item-title">{key}</div>
                            <div className="install-item-desc">{requiredLabels[key]}</div>
                            <div className="install-item-status">{ok ? 'Set' : 'Missing'}</div>
                        </div>
                    ))}
                </div>
                {missingRequired.length > 0 && (
                    <div className="install-hint">
                        Missing required values: {missingRequired.map(([key]) => key).join(', ')}
                    </div>
                )}
                {missingRequired.some(([key]) => key === 'AUTH_SECRET') && (
                    <div className="install-hint" style={{ marginTop: '8px' }}>
                        To generate an AUTH_SECRET, run:
                        <code style={{ display: 'block', padding: '8px', background: 'rgba(0,0,0,0.05)', marginTop: '4px', borderRadius: '4px', fontFamily: 'monospace' }}>
                            openssl rand -base64 33
                        </code>
                    </div>
                )}
                <div className="install-subtitle">Optional</div>
                <div className="install-grid">
                    {Object.entries(status.env.optional).map(([key, ok]) => (
                        <div key={key} className={`install-item ${ok ? 'ok' : 'missing'}`}>
                            <div className="install-item-title">{key}</div>
                            <div className="install-item-desc">{optionalLabels[key]}</div>
                            <div className="install-item-status">{ok ? 'Set' : 'Not set'}</div>
                        </div>
                    ))}
                </div>
                {missingOptional.length > 0 && (
                    <div className="install-hint">
                        Optional values missing: {missingOptional.map(([key]) => key).join(', ')}
                    </div>
                )}
            </StepCard>

            <StepCard
                title="2. Database"
                description="Ensure the database is reachable and the schema is pushed."
                status={{
                    label: dbComplete ? 'Complete' : 'Needs attention',
                    tone: dbComplete ? 'ok' : 'warn',
                }}
            >
                <div className="install-status-row">
                    <span>Database connection</span>
                    <strong>{status.db.connected ? 'Connected' : 'Not connected'}</strong>
                </div>
                <div className="install-status-row">
                    <span>Schema</span>
                    <strong>{status.db.schemaReady ? 'Ready' : 'Missing tables'}</strong>
                </div>
                {!status.db.schemaReady && (
                    <div className="install-hint">
                        Run <code>npm run db:push</code> to create tables.
                    </div>
                )}
            </StepCard>

            <StepCard
                title="3. Create admin account"
                description="Register your first account, then grant admin access."
                status={{
                    label: adminComplete ? 'Complete' : 'Needs attention',
                    tone: adminComplete ? 'ok' : 'warn',
                }}
            >
                <div className="install-status-row">
                    <span>Existing users</span>
                    <strong>{status.db.usersCount}</strong>
                </div>
                <p className="install-body">
                    Register a user via the login page. Then add their email to
                    <code>ADMIN_EMAILS</code> and redeploy.
                </p>
                <Link href="/login" className="btn btn-primary">
                    Go to login / register
                </Link>
            </StepCard>

            <StepCard
                title="4. Launch"
                description="Once you have at least one user and admin access, you are ready."
            >
                <Link href="/" className="btn btn-primary">
                    Go to home
                </Link>
                <Link href="/admin" className="btn btn-ghost">
                    Open moderation dashboard
                </Link>
            </StepCard>
        </div>
    );
}
