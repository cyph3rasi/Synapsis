export interface User {
    id: string;
    handle: string;
    displayName: string;
    avatarUrl?: string | null;
}

export interface MediaItem {
    id: string;
    url: string;
    altText?: string | null;
}

export interface Attachment {
    id: string;
    url: string;
    altText?: string | null;
}

export interface Post {
    id: string;
    content: string;
    createdAt: string;
    likesCount: number;
    repostsCount: number;
    repliesCount: number;
    author: User;
    media?: MediaItem[];
    linkPreviewUrl?: string | null;
    linkPreviewTitle?: string | null;
    linkPreviewDescription?: string | null;
    linkPreviewImage?: string | null;
    replyTo?: {
        author: {
            handle: string;
            displayName: string;
        };
    } | null;
    isLiked?: boolean;
    isReposted?: boolean;
}
