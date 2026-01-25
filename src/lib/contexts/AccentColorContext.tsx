'use client';

import { createContext, useContext, useEffect, useState, useCallback, ReactNode } from 'react';

interface AccentColorContextType {
    accentColor: string;
    refreshAccentColor: () => void;
}

const AccentColorContext = createContext<AccentColorContextType | null>(null);

function applyAccentColor(color: string) {
    const cleaned = color.trim();
    const normalized = cleaned.startsWith('#') ? cleaned : `#${cleaned}`;
    const hexMatch = /^#([0-9a-fA-F]{6})$/.exec(normalized);
    if (!hexMatch) return;

    const hex = hexMatch[1];
    const r = parseInt(hex.slice(0, 2), 16);
    const g = parseInt(hex.slice(2, 4), 16);
    const b = parseInt(hex.slice(4, 6), 16);

    const mix = (channel: number, target: number, amount: number) =>
        Math.round(channel + (target - channel) * amount);

    const hover = `rgb(${mix(r, 255, 0.12)}, ${mix(g, 255, 0.12)}, ${mix(b, 255, 0.12)})`;
    const muted = `rgba(${r}, ${g}, ${b}, 0.12)`;

    const root = document.documentElement;
    root.style.setProperty('--accent', `#${hex}`);
    root.style.setProperty('--accent-hover', hover);
    root.style.setProperty('--accent-muted', muted);
}

export function AccentColorProvider({ children }: { children: ReactNode }) {
    const [accentColor, setAccentColor] = useState('#00D4AA');

    const refreshAccentColor = useCallback(() => {
        fetch('/api/node', { cache: 'no-store' })
            .then((res) => res.json())
            .then((data) => {
                if (data?.accentColor) {
                    setAccentColor(data.accentColor);
                    applyAccentColor(data.accentColor);
                }
            })
            .catch(() => {});
    }, []);

    useEffect(() => {
        refreshAccentColor();
    }, [refreshAccentColor]);

    return (
        <AccentColorContext.Provider value={{ accentColor, refreshAccentColor }}>
            {children}
        </AccentColorContext.Provider>
    );
}

export function useAccentColor() {
    const context = useContext(AccentColorContext);
    if (!context) {
        throw new Error('useAccentColor must be used within an AccentColorProvider');
    }
    return context;
}
