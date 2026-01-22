'use client';

import { useState, useEffect } from 'react';

export function RightSidebar() {
    const fallbackDescription = process.env.NEXT_PUBLIC_NODE_DESCRIPTION || 'A federated social network node.';
    const [nodeInfo, setNodeInfo] = useState({
        name: process.env.NEXT_PUBLIC_NODE_NAME || 'Synapsis Node',
        description: fallbackDescription,
        longDescription: '',
        rules: '',
        bannerUrl: '',
    });

    useEffect(() => {
        fetch('/api/node', { cache: 'no-store' })
            .then(res => res.json())
            .then(data => {
                setNodeInfo(prev => ({
                    ...prev,
                    ...data,
                    name: data?.name ?? prev.name,
                    description: data?.description ?? prev.description,
                    longDescription: data?.longDescription ?? prev.longDescription,
                    rules: data?.rules ?? prev.rules,
                    bannerUrl: data?.bannerUrl ?? prev.bannerUrl,
                }));
            })
            .catch(() => { });
    }, []);

    return (
        <aside className="aside">
            <div className="card" style={{ position: 'relative', overflow: 'hidden', padding: 0 }}>
                {nodeInfo.bannerUrl && (
                    <>
                        <div style={{
                            position: 'absolute', inset: 0,
                            background: `url(${nodeInfo.bannerUrl}) center/cover no-repeat`,
                            opacity: 0.6
                        }} />
                        <div style={{
                            position: 'absolute', inset: 0,
                            background: 'linear-gradient(to bottom, transparent 0%, var(--background-secondary) 90%)'
                        }} />
                    </>
                )}

                <div style={{ position: 'relative', zIndex: 1, padding: '16px' }}>
                    <h3 style={{ fontWeight: 600, marginBottom: '12px' }}>Welcome to {nodeInfo.name}</h3>
                    <p style={{ color: 'var(--foreground-secondary)', fontSize: '14px', lineHeight: 1.6 }}>
                        {nodeInfo.description}
                    </p>

                    {nodeInfo.longDescription && (
                        <div style={{ marginTop: '16px', fontSize: '13px', color: 'var(--foreground-secondary)', lineHeight: 1.5 }}>
                            {nodeInfo.longDescription.split('\n').map((line, i) => (
                                <p key={i} style={{ marginBottom: '8px' }}>{line}</p>
                            ))}
                        </div>
                    )}

                    {nodeInfo.rules && (
                        <div style={{ marginTop: '16px', paddingTop: '16px', borderTop: '1px solid var(--border-hover)' }}>
                            <h4 style={{ fontSize: '11px', fontWeight: 700, textTransform: 'uppercase', color: 'var(--foreground-tertiary)', marginBottom: '8px', letterSpacing: '0.05em' }}>
                                Node Rules
                            </h4>
                            <div style={{ color: 'var(--foreground-secondary)', fontSize: '13px', lineHeight: 1.5 }}>
                                {nodeInfo.rules.split('\n').map((rule, i) => (
                                    <div key={i} style={{ marginBottom: '4px', display: 'flex', gap: '8px' }}>
                                        <span>•</span>
                                        <span>{rule}</span>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}
                </div>
            </div>

            <div className="card" style={{ marginTop: '16px' }}>
                <h3 style={{ fontWeight: 600, marginBottom: '12px' }}>Network Info</h3>
                <p style={{ color: 'var(--foreground-secondary)', fontSize: '13px' }}>
                    Running Synapsis v0.1.0
                </p>
            </div>
        </aside>
    );
}
