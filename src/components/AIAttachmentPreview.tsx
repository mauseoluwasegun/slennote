import { X, ExternalLink, Image as ImageIcon, Link as LinkIcon } from "lucide-react";
import { useQuery } from "convex/react";
import { api } from "../../convex/_generated/api";
import { useState, useEffect } from "react";

interface Attachment {
    type: "image" | "link";
    storageId?: string;
    url?: string;
    title?: string;
    file?: File; // For pending uploads
    previewUrl?: string; // For pending uploads
    favicon?: string;
}

interface AIAttachmentPreviewProps {
    attachment: Attachment;
    onRemove?: () => void;
    readonly?: boolean;
}

export function AIAttachmentPreview({ attachment, onRemove, readonly = false }: AIAttachmentPreviewProps) {
    // Use query to fetch storage URL when there's a storageId
    const storageUrl = useQuery(
        api.aiChats.getStorageUrl,
        attachment.type === "image" && attachment.storageId && !attachment.previewUrl
            ? { storageId: attachment.storageId as any }
            : "skip"
    );
    const [imageUrl, setImageUrl] = useState<string | null>(attachment.previewUrl || null);

    useEffect(() => {
        // Use the query result when available
        if (storageUrl) {
            setImageUrl(storageUrl);
        } else if (attachment.previewUrl) {
            setImageUrl(attachment.previewUrl);
        }
    }, [storageUrl, attachment.previewUrl]);

    if (attachment.type === "image") {
        return (
            <div className={`ai-attachment-preview ai-attachment-image ${readonly ? 'readonly' : ''}`}>
                <div className="ai-image-container">
                    {imageUrl ? (
                        <img src={imageUrl} alt="Attachment" />
                    ) : (
                        <div className="ai-image-placeholder">
                            <ImageIcon size={20} />
                        </div>
                    )}
                </div>
                {!readonly && onRemove && (
                    <button className="ai-remove-attachment" onClick={onRemove}>
                        <X size={14} />
                    </button>
                )}
            </div>
        );
    }

    // Link attachment
    return (
        <div className={`ai-attachment-preview ai-attachment-link ${readonly ? 'readonly' : ''}`}>
            <div className="ai-link-icon">
                {attachment.favicon ? (
                    <img src={attachment.favicon} alt="" onError={(e) => (e.currentTarget.style.display = 'none')} />
                ) : (
                    <LinkIcon size={16} />
                )}
            </div>
            <div className="ai-link-info">
                <div className="ai-link-title">{attachment.title || attachment.url}</div>
                <div className="ai-link-url">{new URL(attachment.url || "").hostname}</div>
            </div>

            {readonly ? (
                <a href={attachment.url} target="_blank" rel="noopener noreferrer" className="ai-link-external">
                    <ExternalLink size={14} />
                </a>
            ) : (
                onRemove && (
                    <button className="ai-remove-attachment" onClick={onRemove}>
                        <X size={14} />
                    </button>
                )
            )}
        </div>
    );
}
