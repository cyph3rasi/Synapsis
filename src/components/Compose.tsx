'use client';

import { useState, useEffect } from 'react';
import AutoTextarea from '@/components/AutoTextarea';
import { Post, Attachment } from '@/lib/types';
import { VideoEmbed } from '@/components/VideoEmbed';

interface ComposeProps {
    onPost: (content: string, mediaIds: string[], linkPreview?: any, replyToId?: string) => void;
    replyingTo?: Post | null;
    onCancelReply?: () => void;
    placeholder?: string;
    isReply?: boolean;
}

export function Compose({ onPost, replyingTo, onCancelReply, placeholder = "What's happening?", isReply }: ComposeProps) {
    const [content, setContent] = useState('');
    const [isPosting, setIsPosting] = useState(false);
    const [attachments, setAttachments] = useState<Attachment[]>([]);
    const [isUploading, setIsUploading] = useState(false);
    const [uploadError, setUploadError] = useState<string | null>(null);
    const [linkPreview, setLinkPreview] = useState<any>(null);
    const [fetchingPreview, setFetchingPreview] = useState(false);
    const [lastDetectedUrl, setLastDetectedUrl] = useState<string | null>(null);
    const maxLength = 400;
    const remaining = maxLength - content.length;

    // Detect URLs in content
    useEffect(() => {
        const urlRegex = /(?:https?:\/\/)?((?:[a-zA-Z0-9-]+\.)+[a-z]{2,63})\b([-a-zA-Z0-9@:%_\+.~#?&//=]*)/gi;
        const matches = content.match(urlRegex);

        if (matches && matches[0]) {
            const url = matches[0];
            if (url !== lastDetectedUrl) {
                setLastDetectedUrl(url);
                fetchPreview(url);
            }
        } else if (!content.trim()) {
            setLinkPreview(null);
            setLastDetectedUrl(null);
        }
    }, [content, lastDetectedUrl]);

    const fetchPreview = async (url: string) => {
        setFetchingPreview(true);
        try {
            const res = await fetch(`/api/media/preview?url=${encodeURIComponent(url)}`);
            if (res.ok) {
                const data = await res.json();
                setLinkPreview(data);
            }
        } catch (err) {
            console.error('Preview error', err);
        } finally {
            setFetchingPreview(false);
        }
    };

    const handleSubmit = async () => {
        if (!content.trim() || isPosting || isUploading) return;
        setIsPosting(true);
        await onPost(content, attachments.map((item) => item.id).filter(Boolean), linkPreview, replyingTo?.id);
        setContent('');
        setAttachments([]);
        setLinkPreview(null);
        setLastDetectedUrl(null);
        setIsPosting(false);
    };

    const handleMediaSelect = async (event: React.ChangeEvent<HTMLInputElement>) => {
        const files = Array.from(event.target.files || []);
        event.target.value = '';
        if (files.length === 0) return;

        const remainingSlots = Math.max(0, 4 - attachments.length);
        const selectedFiles = files.slice(0, remainingSlots);
        if (selectedFiles.length === 0) return;

        setUploadError(null);
        setIsUploading(true);

        const uploaded: Attachment[] = [];

        for (const file of selectedFiles) {
            try {
                const formData = new FormData();
                formData.append('file', file);
                const res = await fetch('/api/media/upload', {
                    method: 'POST',
                    body: formData,
                });
                const data = await res.json();

                if (!res.ok || !data.media?.id) {
                    throw new Error(data.error || 'Upload failed');
                }

                uploaded.push({
                    id: data.media.id,
                    url: data.media.url || data.url,
                    altText: data.media.altText ?? null,
                });
            } catch (error) {
                console.error('Upload failed', error);
                setUploadError('One or more uploads failed. Try again.');
            }
        }

        setAttachments((prev) => [...prev, ...uploaded].slice(0, 4));
        setIsUploading(false);
    };

    const handleRemoveAttachment = (id: string) => {
        setAttachments((prev) => prev.filter((item) => item.id !== id));
    };

    return (
        <div className={`compose ${isReply ? 'reply-compose' : ''}`}>
            {replyingTo && !isReply && (
                <div className="compose-reply-target">
                    <div className="compose-reply-info">
                        Replying to <span className="compose-reply-handle">@{replyingTo.author.handle}</span>
                    </div>
                    <button type="button" className="compose-reply-cancel" onClick={onCancelReply}>
                        Cancel
                    </button>
                </div>
            )}
            <AutoTextarea
                className="compose-input"
                placeholder={placeholder}
                value={content}
                onChange={(e) => setContent(e.target.value)}
                maxLength={maxLength + 50} // Allow some overflow for better UX
            />
            {attachments.length > 0 && (
                <div className="compose-media-grid">
                    {attachments.map((item) => (
                        <div className="compose-media-item" key={item.id}>
                            <img src={item.url} alt={item.altText || 'Upload preview'} />
                            <button
                                type="button"
                                className="compose-media-remove"
                                onClick={() => handleRemoveAttachment(item.id)}
                            >
                                x
                            </button>
                        </div>
                    ))}
                </div>
            )}

            {linkPreview && (
                <div className="compose-link-preview">
                    <button
                        type="button"
                        className="compose-link-preview-remove"
                        onClick={() => setLinkPreview(null)}
                    >
                        x
                    </button>
                    <VideoEmbed url={linkPreview.url} />
                    {!linkPreview.url.match(/(youtube\.com|youtu\.be|vimeo\.com)/) && (
                        <div className="link-preview-card mini">
                            {linkPreview.image && (
                                <div className="link-preview-image">
                                    <img src={linkPreview.image} alt="" />
                                </div>
                            )}
                            <div className="link-preview-info">
                                <div className="link-preview-title">{linkPreview.title}</div>
                                <div className="link-preview-url">{new URL(linkPreview.url.startsWith('http') ? linkPreview.url : `https://${linkPreview.url}`).hostname}</div>
                            </div>
                        </div>
                    )}
                </div>
            )}

            {uploadError && (
                <div className="compose-media-error">{uploadError}</div>
            )}
            <div className="compose-footer">
                <span className={`compose-counter ${remaining < 50 ? (remaining < 0 ? 'error' : 'warning') : ''}`}>
                    {remaining}
                </span>
                <div className="compose-actions">
                    <label className="btn btn-ghost btn-sm compose-media-button">
                        {isUploading ? 'Uploading...' : 'Add media'}
                        <input
                            type="file"
                            accept="image/*"
                            multiple
                            onChange={handleMediaSelect}
                            disabled={isUploading || attachments.length >= 4}
                            className="compose-media-input"
                        />
                    </label>
                    <button
                        className="btn btn-primary"
                        onClick={handleSubmit}
                        disabled={!content.trim() || remaining < 0 || isPosting || isUploading}
                    >
                        {isPosting ? 'Posting...' : isReply ? 'Reply' : 'Post'}
                    </button>
                </div>
            </div>
        </div>
    );
}
