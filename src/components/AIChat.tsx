import React, { useState, useRef, useEffect } from "react";
import { useQuery, useMutation, useAction } from "convex/react";
import { api } from "../../convex/_generated/api";
import { Id } from "../../convex/_generated/dataModel";
import { Send, Image as ImageIcon, Link as LinkIcon, Paperclip, X, Plus, Bot, User, Loader2, Sparkles } from "lucide-react";
import { AIAttachmentPreview } from "./AIAttachmentPreview";
import { useUser } from "@clerk/clerk-react";
import ReactMarkdown from "react-markdown";

interface Attachment {
    type: "image" | "link";
    file?: File;
    previewUrl?: string; // Local preview
    url?: string;
    title?: string;
    storageId?: string;
}

export function AIChat() {
    const { user } = useUser();
    const [input, setInput] = useState("");
    const [isLoading, setIsLoading] = useState(false);
    const [selectedModel, setSelectedModel] = useState<"claude" | "grok">("grok"); // Changed default to grok
    const [attachments, setAttachments] = useState<Attachment[]>([]);
    const [showLinkInput, setShowLinkInput] = useState(false);
    const [linkUrl, setLinkUrl] = useState("");

    const fileInputRef = useRef<HTMLInputElement>(null);
    const messagesEndRef = useRef<HTMLDivElement>(null);
    const [chatId, setChatId] = useState<Id<"aiChats"> | null>(null);

    // Queries & Mutations
    // Queries & Mutations
    const chats = useQuery(api.aiChats.getChats);
    const messages = useQuery(api.aiChats.getMessages, chatId ? { chatId } : "skip");
    const createChat = useMutation(api.aiChats.createChat);
    const sendMessage = useMutation(api.aiChats.sendMessage);
    const generateUploadUrl = useMutation(api.aiChats.generateUploadUrl);
    const scrapeLink = useAction(api.aiLinkScraper.scrapeLink);
    // Action for AI response
    const generateAIResponse = useAction(api.aiChatActions.generateResponse);

    // Auto-scroll to bottom
    useEffect(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
    }, [messages, isLoading]);

    // Load most recent chat on mount
    useEffect(() => {
        if (!chatId && chats && chats.length > 0) {
            setChatId(chats[0]._id);
        }
    }, [chats, chatId]);

    const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const files = e.target.files;
        if (!files) return;

        // Check limits: max 3 images, max 3MB each
        const currentImages = attachments.filter(a => a.type === "image").length;
        if (currentImages + files.length > 3) {
            alert("Maximum 3 images allowed.");
            return;
        }

        const newAttachments: Attachment[] = [];
        for (let i = 0; i < files.length; i++) {
            const file = files[i];
            if (file.size > 3 * 1024 * 1024) {
                alert(`File ${file.name} exceeds 3MB limit.`);
                continue;
            }
            newAttachments.push({
                type: "image",
                file,
                previewUrl: URL.createObjectURL(file),
            });
        }
        setAttachments([...attachments, ...newAttachments]);
        // Reset input
        if (fileInputRef.current) fileInputRef.current.value = "";
    };

    const handleAddLink = async () => {
        if (!linkUrl) return;

        // Auto-detect if it's a valid URL
        try {
            new URL(linkUrl);
        } catch {
            alert("Please enter a valid URL");
            return;
        }

        setIsLoading(true);
        try {
            const scrapedData = await scrapeLink({ url: linkUrl });
            setAttachments([...attachments, {
                type: "link",
                url: linkUrl,
                title: scrapedData.title,
                // We'll store scraped content in the message, not display in preview fully
            }]);
            setLinkUrl("");
            setShowLinkInput(false);
        } catch (err) {
            console.error("Failed to scrape link:", err);
            // Add anyway without metadata
            setAttachments([...attachments, { type: "link", url: linkUrl }]);
        } finally {
            setIsLoading(false);
        }
    };

    const handleSend = async () => {
        if ((!input.trim() && attachments.length === 0) || isLoading) return;

        const currentAttachments = [...attachments];
        const currentInput = input;

        // Clear UI immediately
        setInput("");
        setAttachments([]);
        setIsLoading(true);

        try {
            let currentChatId = chatId;

            // Create chat if doesn't exist
            if (!currentChatId) {
                currentChatId = await createChat({ message: currentInput || "New Chat" });
                setChatId(currentChatId);
            }

            // Upload images first
            const processedAttachments: any[] = [];

            for (const attachment of currentAttachments) {
                if (attachment.type === "image" && attachment.file) {
                    // Get upload URL
                    const postUrl = await generateUploadUrl();

                    // Upload file
                    const result = await fetch(postUrl, {
                        method: "POST",
                        headers: { "Content-Type": attachment.file.type },
                        body: attachment.file,
                    });
                    const { storageId } = await result.json();

                    processedAttachments.push({
                        type: "image",
                        storageId,
                    });
                } else if (attachment.type === "link") {
                    // Re-scrape or use cached metadata? 
                    // Ideally we pass the data we already scraped.
                    // For now, let's look up scraping? 
                    // We already scraped in handleAddLink and seemingly didn't store the content.
                    // Let's rely on the AI backend to re-scrape or pass it here.
                    // Simple approach: Pass URL, backend handles context.
                    processedAttachments.push({
                        type: "link",
                        url: attachment.url,
                        title: attachment.title,
                    });
                }
            }

            // Send User Message
            await sendMessage({
                chatId: currentChatId!,
                role: "user",
                content: currentInput,
                attachments: processedAttachments, // We need to update schema to accept this exact structure if strict
            });

            // Trigger AI Response
            generateAIResponse({
                chatId: currentChatId!,
                model: selectedModel,
            }).catch(err => console.error("AI Generation failed:", err));

        } catch (err) {
            console.error("Failed to send message:", err);
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <div className="ai-chat-container">
            {/* Header */}
            <div className="ai-chat-header">
                <div className="ai-chat-title">
                    <Sparkles className="ai-icon-sparkle" size={18} />
                    <span>AI Assistant</span>
                </div>
                <div className="ai-model-selector">
                    <select
                        value={selectedModel}
                        onChange={(e) => setSelectedModel(e.target.value as "claude" | "grok")}
                        className="ai-model-select"
                    >
                        <option value="grok">Groq (Llama 3.3 70B)</option>
                        <option value="claude">Claude 3.5 Sonnet</option>
                    </select>
                </div>
            </div>

            {/* Messages */}
            <div className="ai-messages-area">
                {!chatId && (
                    <div className="ai-empty-state">
                        <Bot size={48} />
                        <h3>How can I help you today?</h3>
                        <p>Ask me anything, upload images, or share links.</p>
                    </div>
                )}

                {messages?.map((msg, index) => (
                    <div key={`${msg.timestamp}-${index}`} className={`ai-message ${msg.role}`}>
                        <div className="ai-message-avatar">
                            {msg.role === "user" ? (
                                user?.imageUrl ? <img src={user.imageUrl} alt="User" /> : <User size={16} />
                            ) : (
                                <Bot size={16} />
                            )}
                        </div>
                        <div className="ai-message-content">
                            {/* Attachments Display */}
                            {msg.attachments && msg.attachments.length > 0 && (
                                <div className="ai-message-attachments">
                                    {msg.attachments.map((att, idx) => (
                                        <AIAttachmentPreview
                                            key={idx}
                                            attachment={att as Attachment}
                                            readonly
                                        />
                                    ))}
                                </div>
                            )}

                            <div className="markdown-body">
                                <ReactMarkdown>{msg.content}</ReactMarkdown>
                            </div>
                        </div>
                    </div>
                ))}
                {isLoading && (
                    <div className="ai-message assistant loading">
                        <div className="ai-message-avatar"><Bot size={16} /></div>
                        <div className="ai-message-content">
                            <Loader2 className="animate-spin" size={16} /> Thinking...
                        </div>
                    </div>
                )}
                <div ref={messagesEndRef} />
            </div>

            {/* Input Area */}
            <div className="ai-input-area">
                {/* Attachment Previews */}
                {attachments.length > 0 && (
                    <div className="ai-input-attachments">
                        {attachments.map((att, idx) => (
                            <AIAttachmentPreview
                                key={idx}
                                attachment={att}
                                onRemove={() => setAttachments(attachments.filter((_, i) => i !== idx))}
                            />
                        ))}
                    </div>
                )}

                {/* Link Input Modal/Popover */}
                {showLinkInput && (
                    <div className="ai-link-input-popover">
                        <input
                            type="text"
                            placeholder="Paste URL here..."
                            value={linkUrl}
                            onChange={(e) => setLinkUrl(e.target.value)}
                            autoFocus
                            onKeyDown={(e) => e.key === "Enter" && handleAddLink()}
                        />
                        <button
                            onClick={handleAddLink}
                            disabled={isLoading}
                            style={{
                                padding: "4px 12px",
                                borderRadius: "4px",
                                border: "none",
                                background: "var(--accent)",
                                color: "white",
                                cursor: "pointer",
                                fontSize: "13px"
                            }}
                        >
                            Add
                        </button>
                        <button
                            onClick={() => setShowLinkInput(false)}
                            style={{
                                background: "transparent",
                                border: "none",
                                color: "var(--text-secondary)",
                                cursor: "pointer",
                                padding: "4px"
                            }}
                        >
                            <X size={14} />
                        </button>
                    </div>
                )}

                {/* Toolbar */}
                <div className="ai-input-toolbar">
                    <input
                        type="file"
                        accept="image/*"
                        multiple
                        ref={fileInputRef}
                        className="hidden"
                        onChange={handleImageUpload}
                        style={{ display: 'none' }}
                    />
                    <button
                        className="ai-toolbar-btn"
                        onClick={() => fileInputRef.current?.click()}
                        title="Upload Image"
                    >
                        <ImageIcon size={18} />
                    </button>
                    <button
                        className="ai-toolbar-btn"
                        onClick={() => setShowLinkInput(!showLinkInput)}
                        title="Add Link"
                    >
                        <LinkIcon size={18} />
                    </button>
                </div>

                {/* Text Input */}
                <div className="ai-input-wrapper">
                    <textarea
                        value={input}
                        onChange={(e) => setInput(e.target.value)}
                        placeholder="Type a message..."
                        onKeyDown={(e) => {
                            if (e.key === "Enter" && !e.shiftKey) {
                                e.preventDefault();
                                handleSend();
                            }
                        }}
                        rows={1}
                        className="ai-textarea"
                    />
                    <button
                        className="ai-send-btn"
                        onClick={handleSend}
                        disabled={(!input.trim() && attachments.length === 0) || isLoading}
                    >
                        <Send size={18} />
                    </button>
                </div>
            </div>
        </div>
    );
}
