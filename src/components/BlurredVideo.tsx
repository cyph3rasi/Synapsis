'use client';

import { useRef, useEffect } from 'react';

interface BlurredVideoProps {
    src: string;
    onClick?: (e: React.MouseEvent<HTMLVideoElement>) => void;
}

export default function BlurredVideo({ src, onClick }: BlurredVideoProps) {
    const containerRef = useRef<HTMLDivElement>(null);
    const mainVideoRef = useRef<HTMLVideoElement>(null);
    const bgVideoRef = useRef<HTMLVideoElement>(null);

    useEffect(() => {
        // Sync playback between main and background videos
        const mainVideo = mainVideoRef.current;
        const bgVideo = bgVideoRef.current;
        
        if (mainVideo && bgVideo) {
            const syncTime = () => {
                if (Math.abs(mainVideo.currentTime - bgVideo.currentTime) > 0.1) {
                    bgVideo.currentTime = mainVideo.currentTime;
                }
            };
            
            mainVideo.addEventListener('seeked', syncTime);
            mainVideo.addEventListener('play', () => bgVideo.play());
            mainVideo.addEventListener('pause', () => bgVideo.pause());
            
            return () => {
                mainVideo.removeEventListener('seeked', syncTime);
            };
        }
    }, []);

    return (
        <div ref={containerRef} className="blurred-video-container">
            {/* Background blurred video */}
            <video
                ref={bgVideoRef}
                src={src}
                autoPlay
                muted
                loop
                playsInline
                preload="metadata"
                className="blurred-video-bg"
                aria-hidden="true"
            />
            {/* Main video */}
            <video
                ref={mainVideoRef}
                src={src}
                autoPlay
                muted
                loop
                playsInline
                preload="metadata"
                className="blurred-video-main"
                onClick={onClick}
                title="Click to toggle sound"
            />
        </div>
    );
}
