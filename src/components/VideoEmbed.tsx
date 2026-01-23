'use client';

interface VideoEmbedProps {
    url: string;
}

export function VideoEmbed({ url }: VideoEmbedProps) {
    const getYouTubeId = (url: string) => {
        const regExp = /^.*(youtu.be\/|v\/|u\/\w\/|embed\/|watch\?v=|\&v=)([^#\&\?]*).*/;
        const match = url.match(regExp);
        return (match && match[2].length === 11) ? match[2] : null;
    };

    const getVimeoId = (url: string) => {
        const regExp = /(?:www\.|player\.)?vimeo.com\/(?:channels\/(?:\w+\/)?|groups\/(?:[^\/]*)\/videos\/|album\/(?:\d+)\/video\/|video\/|)(\d+)(?:$|\/|\?)/;
        const match = url.match(regExp);
        return match ? match[1] : null;
    };

    const youtubeId = getYouTubeId(url);
    const vimeoId = getVimeoId(url);

    if (youtubeId) {
        return (
            <div className="video-embed-container">
                <iframe
                    src={`https://www.youtube.com/embed/${youtubeId}`}
                    title="YouTube video player"
                    frameBorder="0"
                    allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
                    allowFullScreen
                ></iframe>
            </div>
        );
    }

    if (vimeoId) {
        return (
            <div className="video-embed-container">
                <iframe
                    src={`https://player.vimeo.com/video/${vimeoId}`}
                    title="Vimeo video player"
                    frameBorder="0"
                    allow="autoplay; fullscreen; picture-in-picture"
                    allowFullScreen
                ></iframe>
            </div>
        );
    }

    return null;
}
