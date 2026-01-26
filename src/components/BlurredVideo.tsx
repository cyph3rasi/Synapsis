'use client';

import { useRef, useEffect, useState } from 'react';

interface BlurredVideoProps {
    src: string;
    onClick?: (e: React.MouseEvent<HTMLVideoElement>) => void;
}

export default function BlurredVideo({ src, onClick }: BlurredVideoProps) {
    const containerRef = useRef<HTMLDivElement>(null);
    const mainVideoRef = useRef<HTMLVideoElement>(null);
    const bgVideoRef = useRef<HTMLVideoElement>(null);
    const [isLoaded, setIsLoaded] = useState(false);

    useEffect(() => {
        const mainVideo = mainVideoRef.current;
        const bgVideo = bgVideoRef.current;
        
        if (mainVideo && bgVideo) {
            // Sync playback between main and background videos
            const syncTime = () => {
                if (Math.abs(mainVideo.currentTime - bgVideo.currentTime) > 0.1) {
                    bgVideo.currentTime = mainVideo.currentTime;
                }
            };
            
            const handlePlay = () => bgVideo.play().catch(() => {});
            const handlePause = () => bgVideo.pause();
            const handleLoaded = () => setIsLoaded(true);
            
            mainVideo.addEventListener('seeked', syncTime);
            mainVideo.addEventListener('play', handlePlay);
            mainVideo.addEventListener('pause', handlePause);
            mainVideo.addEventListener('loadeddata', handleLoaded);
            
            return () => {
                mainVideo.removeEventListener('seeked', syncTime);
                mainVideo.removeEventListener('play', handlePlay);
                mainVideo.removeEventListener('pause', handlePause);
                mainVideo.removeEventListener('loadeddata', handleLoaded);
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
                style={{ opacity: isLoaded ? 1 : 0 }}
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
