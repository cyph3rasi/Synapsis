'use client';

import Link from 'next/link';
import { ArrowLeftIcon } from '@/components/Icons';
import { Rocket } from 'lucide-react';

export default function GuidePage() {
    return (
        <div style={{ maxWidth: '700px', margin: '0 auto', padding: '24px 16px 64px' }}>
            <header style={{
                display: 'flex',
                alignItems: 'center',
                gap: '16px',
                marginBottom: '32px',
            }}>
                <Link href="/" style={{ color: 'var(--foreground)' }}>
                    <ArrowLeftIcon />
                </Link>
                <div>
                    <h1 style={{ fontSize: '24px', fontWeight: 700 }}>Synapsis Guide</h1>
                    <p style={{ color: 'var(--foreground-tertiary)', fontSize: '14px' }}>
                        Understanding the federated social network
                    </p>
                </div>
            </header>

            {/* Table of Contents */}
            <nav className="card" style={{ marginBottom: '32px', padding: '16px' }}>
                <div style={{ fontWeight: 600, marginBottom: '12px' }}>Contents</div>
                <ul style={{ listStyle: 'none', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                    <li><a href="#what-is-fediverse" style={{ color: 'var(--foreground-secondary)' }}>1. What is the Fediverse?</a></li>
                    <li><a href="#how-synapsis-is-different" style={{ color: 'var(--foreground-secondary)' }}>2. How Synapsis is Different</a></li>
                    <li><a href="#following-remote-users" style={{ color: 'var(--foreground-secondary)' }}>3. Following Users on Other Servers</a></li>
                    <li><a href="#how-others-follow-you" style={{ color: 'var(--foreground-secondary)' }}>4. How Others Follow You</a></li>
                    <li><a href="#portable-identity" style={{ color: 'var(--foreground-secondary)' }}>5. Portable Identity & Account Migration</a></li>
                </ul>
            </nav>

            {/* Section 1 */}
            <section id="what-is-fediverse" style={{ marginBottom: '40px' }}>
                <h2 style={{ fontSize: '20px', fontWeight: 600, marginBottom: '16px', paddingTop: '8px', borderTop: '1px solid var(--border)' }}>
                    1. What is the Fediverse?
                </h2>
                <p style={{ color: 'var(--foreground-secondary)', lineHeight: 1.7, marginBottom: '16px' }}>
                    The <strong style={{ color: 'var(--foreground)' }}>Fediverse</strong> (federated universe) is a network of interconnected social platforms that can talk to each other. Unlike centralized platforms like Twitter or Facebook, the Fediverse is made up of thousands of independent servers (called "instances" or "nodes") that share a common protocol.
                </p>
                <p style={{ color: 'var(--foreground-secondary)', lineHeight: 1.7, marginBottom: '16px' }}>
                    Think of it like email: you can send an email from Gmail to Outlook because they speak the same language. Similarly, you can follow someone on a Mastodon server from your Synapsis account because they both speak <strong style={{ color: 'var(--foreground)' }}>ActivityPub</strong>.
                </p>
                <div className="card" style={{ background: 'var(--background-tertiary)', padding: '16px' }}>
                    <div style={{ fontSize: '13px', color: 'var(--foreground-tertiary)', marginBottom: '8px' }}>Key Terms</div>
                    <ul style={{ listStyle: 'disc', paddingLeft: '20px', color: 'var(--foreground-secondary)', lineHeight: 1.7 }}>
                        <li><strong style={{ color: 'var(--foreground)' }}>Node / Instance:</strong> An independent server running social software (like this Synapsis node).</li>
                        <li><strong style={{ color: 'var(--foreground)' }}>ActivityPub:</strong> The protocol that allows different servers to communicate.</li>
                        <li><strong style={{ color: 'var(--foreground)' }}>Handle:</strong> Your username, including your server (e.g., <code>@alice@mynode.com</code>).</li>
                    </ul>
                </div>
            </section>

            {/* Section 2 */}
            <section id="how-synapsis-is-different" style={{ marginBottom: '40px' }}>
                <h2 style={{ fontSize: '20px', fontWeight: 600, marginBottom: '16px', paddingTop: '8px', borderTop: '1px solid var(--border)' }}>
                    2. How Synapsis is Different
                </h2>
                <p style={{ color: 'var(--foreground-secondary)', lineHeight: 1.7, marginBottom: '16px' }}>
                    While Synapsis uses ActivityPub like Mastodon, it introduces a key difference: <strong style={{ color: 'var(--foreground)' }}>Decentralized Identifiers (DIDs)</strong>.
                </p>

                <h3 style={{ fontSize: '16px', fontWeight: 600, marginBottom: '12px', color: 'var(--foreground)' }}>
                    The Problem with Traditional Federation
                </h3>
                <p style={{ color: 'var(--foreground-secondary)', lineHeight: 1.7, marginBottom: '16px' }}>
                    On Mastodon, your identity is <code>@username@server.com</code>. If your server shuts down, or you want to move to a different one, you effectively lose your identity. Your followers have to re-follow your new account, and your post history doesn't come with you.
                </p>

                <h3 style={{ fontSize: '16px', fontWeight: 600, marginBottom: '12px', color: 'var(--foreground)' }}>
                    The Synapsis Approach: DIDs
                </h3>
                <p style={{ color: 'var(--foreground-secondary)', lineHeight: 1.7, marginBottom: '16px' }}>
                    When you create an account on Synapsis, you're assigned a unique <strong style={{ color: 'var(--foreground)' }}>DID (Decentralized Identifier)</strong> — a cryptographic ID like <code>did:key:z6Mk...</code>. This DID is your true identity. Your human-readable handle (<code>@alice</code>) is simply a friendly pointer to that DID.
                </p>
                <div className="card" style={{ background: 'var(--background-tertiary)', padding: '16px', marginBottom: '16px' }}>
                    <div style={{ fontSize: '13px', color: 'var(--foreground-tertiary)', marginBottom: '8px' }}>What this means for you</div>
                    <ul style={{ listStyle: 'disc', paddingLeft: '20px', color: 'var(--foreground-secondary)', lineHeight: 1.7 }}>
                        <li><strong style={{ color: 'var(--foreground)' }}>You own your identity.</strong> Your DID is generated from a cryptographic key pair that only you control.</li>
                        <li><strong style={{ color: 'var(--foreground)' }}>Authenticity.</strong> Every post you make is cryptographically signed, proving it came from you.</li>
                    </ul>
                </div>
            </section>

            {/* Section 3 */}
            <section id="following-remote-users" style={{ marginBottom: '40px' }}>
                <h2 style={{ fontSize: '20px', fontWeight: 600, marginBottom: '16px', paddingTop: '8px', borderTop: '1px solid var(--border)' }}>
                    3. Following Users on Other Servers
                </h2>

                <h3 style={{ fontSize: '16px', fontWeight: 600, marginBottom: '12px', color: 'var(--foreground)' }}>
                    Following Someone on Another Synapsis Node
                </h3>
                <p style={{ color: 'var(--foreground-secondary)', lineHeight: 1.7, marginBottom: '16px' }}>
                    To follow a user on a different Synapsis node, use the <Link href="/explore" style={{ color: 'var(--accent)' }}>Explore / Search</Link> feature. Enter their full handle in the format:
                </p>
                <div className="card" style={{ background: 'var(--background)', padding: '12px 16px', fontFamily: 'monospace', marginBottom: '16px' }}>
                    @username@other-node.com
                </div>
                <p style={{ color: 'var(--foreground-secondary)', lineHeight: 1.7, marginBottom: '16px' }}>
                    Synapsis uses <strong style={{ color: 'var(--foreground)' }}>WebFinger</strong> to discover the user's profile on the remote server, then sends a Follow request via ActivityPub.
                </p>

                <h3 style={{ fontSize: '16px', fontWeight: 600, marginBottom: '12px', color: 'var(--foreground)' }}>
                    Following Someone on Mastodon (or other Fediverse platforms)
                </h3>
                <p style={{ color: 'var(--foreground-secondary)', lineHeight: 1.7, marginBottom: '16px' }}>
                    The process is identical! Enter their full handle:
                </p>
                <div className="card" style={{ background: 'var(--background)', padding: '12px 16px', fontFamily: 'monospace', marginBottom: '16px' }}>
                    @user@mastodon.social
                </div>
                <p style={{ color: 'var(--foreground-secondary)', lineHeight: 1.7 }}>
                    Because ActivityPub is an open standard, Synapsis can communicate with Mastodon, Pleroma, Misskey, and other compatible platforms.
                </p>
            </section>

            {/* Section 4 */}
            <section id="how-others-follow-you" style={{ marginBottom: '40px' }}>
                <h2 style={{ fontSize: '20px', fontWeight: 600, marginBottom: '16px', paddingTop: '8px', borderTop: '1px solid var(--border)' }}>
                    4. How Others Follow You
                </h2>
                <p style={{ color: 'var(--foreground-secondary)', lineHeight: 1.7, marginBottom: '16px' }}>
                    To let someone on another server follow you, share your <strong style={{ color: 'var(--foreground)' }}>full handle</strong>. It includes your username and this node's domain:
                </p>
                <div className="card" style={{ background: 'var(--background)', padding: '12px 16px', fontFamily: 'monospace', marginBottom: '16px' }}>
                    @your-username@{typeof window !== 'undefined' ? window.location.host : 'this-node.com'}
                </div>
                <p style={{ color: 'var(--foreground-secondary)', lineHeight: 1.7, marginBottom: '16px' }}>
                    When they search for your handle on their platform (Mastodon, another Synapsis node, etc.), their server will use WebFinger to find your profile and send a Follow request.
                </p>
                <p style={{ color: 'var(--foreground-secondary)', lineHeight: 1.7 }}>
                    You can find your full handle on your <Link href="/" style={{ color: 'var(--accent)' }}>Profile page</Link>.
                </p>
            </section>

            {/* Section 5 */}
            <section id="portable-identity" style={{ marginBottom: '40px' }}>
                <h2 style={{ fontSize: '20px', fontWeight: 600, marginBottom: '16px', paddingTop: '8px', borderTop: '1px solid var(--border)' }}>
                    5. Portable Identity & Account Migration
                </h2>
                <p style={{ color: 'var(--foreground-secondary)', lineHeight: 1.7, marginBottom: '16px' }}>
                    Synapsis offers true <strong style={{ color: 'var(--foreground)' }}>account portability</strong> powered by DIDs. You can migrate your entire account — identity, posts, and media — to another Synapsis node.
                </p>

                <h3 style={{ fontSize: '16px', fontWeight: 600, marginBottom: '12px', color: 'var(--foreground)' }}>
                    What Gets Migrated
                </h3>
                <ul style={{ listStyle: 'disc', paddingLeft: '20px', color: 'var(--foreground-secondary)', lineHeight: 1.7, marginBottom: '16px' }}>
                    <li><strong style={{ color: 'var(--foreground)' }}>Your DID & Keys:</strong> Your cryptographic identity stays exactly the same</li>
                    <li><strong style={{ color: 'var(--foreground)' }}>Posts & Media:</strong> Your entire post history and uploaded media</li>
                    <li><strong style={{ color: 'var(--foreground)' }}>Following List:</strong> Who you follow</li>
                    <li><strong style={{ color: 'var(--foreground)' }}>Synapsis Followers:</strong> Automatically migrated (they recognize your DID)</li>
                    <li><strong style={{ color: 'var(--foreground)' }}>Fediverse Followers:</strong> Notified of your move (they can re-follow)</li>
                </ul>

                <h3 style={{ fontSize: '16px', fontWeight: 600, marginBottom: '12px', color: 'var(--foreground)' }}>
                    How to Migrate
                </h3>
                <ol style={{ paddingLeft: '20px', color: 'var(--foreground-secondary)', lineHeight: 1.7, marginBottom: '16px' }}>
                    <li style={{ marginBottom: '8px' }}>Go to <Link href="/settings/migration" style={{ color: 'var(--accent)' }}>Settings → Account Migration</Link></li>
                    <li style={{ marginBottom: '8px' }}>Click <strong>Export Account</strong> and enter your password</li>
                    <li style={{ marginBottom: '8px' }}>Download your export file (keep it safe!)</li>
                    <li style={{ marginBottom: '8px' }}>On the new node, go to Settings → Account Migration → Import</li>
                    <li style={{ marginBottom: '8px' }}>Upload your export file and choose a handle</li>
                </ol>

                <div className="card" style={{ background: 'var(--accent-muted)', padding: '16px', borderLeft: '3px solid var(--accent)' }}>
                    <div style={{ fontWeight: 600, marginBottom: '8px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <Rocket size={18} /> The Synapsis Advantage
                    </div>
                    <p style={{ color: 'var(--foreground-secondary)', lineHeight: 1.7, margin: 0 }}>
                        Unlike Mastodon where followers must manually re-follow you, <strong>Synapsis followers are automatically migrated</strong> because they follow your DID, not just a server-specific account. This is true account portability.
                    </p>
                </div>
            </section>

            <footer style={{ paddingTop: '24px', borderTop: '1px solid var(--border)', color: 'var(--foreground-tertiary)', fontSize: '13px' }}>
                <p>Have questions? Reach out to the node administrator or contribute to Synapsis on GitHub.</p>
            </footer>
        </div>
    );
}
