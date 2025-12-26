import { internalMutation, internalQuery, mutation, query } from "./_generated/server";
import { v } from "convex/values";

// Get AI chat for a specific date
export const getAIChatByDate = query({
    args: { date: v.string() },
    handler: async (ctx, args) => {
        const userId = (await ctx.auth.getUserIdentity())?.subject;
        if (!userId) {
            return null;
        }

        const chat = await ctx.db
            .query("aiChats")
            .withIndex("by_user_and_date", (q) =>
                q.eq("userId", userId).eq("date", args.date),
            )
            .first();

        return chat;
    },
});

// Internal query to get chat by ID (for actions)
export const getAIChatInternal = internalQuery({
    args: { chatId: v.id("aiChats") },
    handler: async (ctx, args) => {
        return await ctx.db.get(args.chatId);
    },
});

// Get or create AI chat for a specific date
export const getOrCreateAIChat = mutation({
    args: { date: v.string() },
    handler: async (ctx, args) => {
        const userId = (await ctx.auth.getUserIdentity())?.subject;
        if (!userId) {
            throw new Error("Not authenticated");
        }

        const existingChat = await ctx.db
            .query("aiChats")
            .withIndex("by_user_and_date", (q) =>
                q.eq("userId", userId).eq("date", args.date),
            )
            .first();

        if (existingChat) {
            return existingChat._id;
        }

        const chatId = await ctx.db.insert("aiChats", {
            userId,
            date: args.date,
            messages: [],
            lastMessageAt: Date.now(),
        });

        return chatId;
    },
});

// Add a user message with attachments
export const addUserMessageWithAttachments = mutation({
    args: {
        chatId: v.id("aiChats"),
        content: v.string(),
        attachments: v.optional(
            v.array(
                v.object({
                    type: v.union(v.literal("image"), v.literal("link")),
                    storageId: v.optional(v.id("_storage")),
                    url: v.optional(v.string()),
                    scrapedContent: v.optional(v.string()),
                    title: v.optional(v.string()),
                }),
            ),
        ),
    },
    handler: async (ctx, args) => {
        const userId = (await ctx.auth.getUserIdentity())?.subject;
        if (!userId) {
            throw new Error("Not authenticated");
        }

        const chat = await ctx.db.get(args.chatId);
        if (!chat || chat.userId !== userId) {
            throw new Error("Chat not found or unauthorized");
        }

        const newMessage = {
            role: "user" as const,
            content: args.content,
            timestamp: Date.now(),
            attachments: args.attachments,
        };

        await ctx.db.patch(args.chatId, {
            messages: [...chat.messages, newMessage],
            lastMessageAt: Date.now(),
            // Append content for search
            searchableContent:
                (chat.searchableContent || "") + " " + newMessage.content,
        });
    },
});

// Add an assistant message (internal mutation called by action)
export const addAssistantMessage = internalMutation({
    args: {
        chatId: v.id("aiChats"),
        content: v.string(),
    },
    handler: async (ctx, args) => {
        const chat = await ctx.db.get(args.chatId);
        if (!chat) {
            throw new Error("Chat not found");
        }

        const newMessage = {
            role: "assistant" as const,
            content: args.content,
            timestamp: Date.now(),
        };

        await ctx.db.patch(args.chatId, {
            messages: [...chat.messages, newMessage],
            lastMessageAt: Date.now(),
            // Append content for search
            searchableContent:
                (chat.searchableContent || "") + " " + newMessage.content,
        });
    },
});

// Clear chat history
export const clearChat = mutation({
    args: { chatId: v.id("aiChats") },
    handler: async (ctx, args) => {
        const userId = (await ctx.auth.getUserIdentity())?.subject;
        if (!userId) {
            throw new Error("Not authenticated");
        }

        const chat = await ctx.db.get(args.chatId);
        if (!chat || chat.userId !== userId) {
            throw new Error("Chat not found or unauthorized");
        }

        await ctx.db.patch(args.chatId, {
            messages: [],
            searchableContent: "",
        });
    },
});

// Generate upload URL for images
export const generateUploadUrl = mutation({
    args: {},
    handler: async (ctx) => {
        const userId = (await ctx.auth.getUserIdentity())?.subject;
        if (!userId) {
            throw new Error("Not authenticated");
        }

        return await ctx.storage.generateUploadUrl();
    },
});

// Internal query to get storage URL (for actions)
export const getStorageUrlInternal = internalQuery({
    args: { storageId: v.id("_storage") },
    handler: async (ctx, args) => {
        return await ctx.storage.getUrl(args.storageId);
    },
});

// Public query to get storage URL (for frontend)
export const getStorageUrl = query({
    args: { storageId: v.id("_storage") },
    handler: async (ctx, args) => {
        const userId = (await ctx.auth.getUserIdentity())?.subject;
        if (!userId) {
            throw new Error("Not authenticated");
        }
        return await ctx.storage.getUrl(args.storageId);
    },
});

// Get counts of AI chats by date (for sidebar)
export const getAIChatCounts = query({
    args: {},
    handler: async (ctx) => {
        const userId = (await ctx.auth.getUserIdentity())?.subject;
        if (!userId) {
            return {};
        }

        const chats = await ctx.db
            .query("aiChats")
            .withIndex("by_user", (q) => q.eq("userId", userId))
            .collect();

        const counts: Record<string, number> = {};
        for (const chat of chats) {
            counts[chat.date] = 1;
        }

        return counts;
    },
});

// Get all AI chats for the user (ordered by date desc)
export const getChats = query({
    args: {},
    handler: async (ctx) => {
        const userId = (await ctx.auth.getUserIdentity())?.subject;
        if (!userId) {
            return [];
        }

        const chats = await ctx.db
            .query("aiChats")
            .withIndex("by_user", (q) => q.eq("userId", userId))
            .order("desc")
            .collect();

        return chats;
    },
});

// Get messages for a specific chat
export const getMessages = query({
    args: { chatId: v.id("aiChats") },
    handler: async (ctx, args) => {
        const userId = (await ctx.auth.getUserIdentity())?.subject;
        if (!userId) {
            return [];
        }

        const chat = await ctx.db.get(args.chatId);
        if (!chat || chat.userId !== userId) {
            return [];
        }

        return chat.messages;
    },
});

// Create a new chat (with current date and initial message)
export const createChat = mutation({
    args: {},
    handler: async (ctx) => {
        const userId = (await ctx.auth.getUserIdentity())?.subject;
        if (!userId) {
            throw new Error("Not authenticated");
        }

        const date = new Date().toISOString().split("T")[0]; // YYYY-MM-DD

        // Check if chat already exists for today
        const existingChat = await ctx.db
            .query("aiChats")
            .withIndex("by_user_and_date", (q) =>
                q.eq("userId", userId).eq("date", date),
            )
            .first();

        if (existingChat) {
            return existingChat._id;
        }

        const chatId = await ctx.db.insert("aiChats", {
            userId,
            date,
            messages: [],
            lastMessageAt: Date.now(),
        });

        // We don't add the message here, it will be added by sendMessage
        return chatId;
    },
});

// Send a message (alias/wrapper for addUserMessageWithAttachments)
export const sendMessage = mutation({
    args: {
        chatId: v.id("aiChats"),
        role: v.literal("user"),
        content: v.string(),
        attachments: v.optional(
            v.array(
                v.object({
                    type: v.union(v.literal("image"), v.literal("link")),
                    storageId: v.optional(v.id("_storage")),
                    url: v.optional(v.string()),
                    scrapedContent: v.optional(v.string()),
                    title: v.optional(v.string()),
                }),
            ),
        ),
    },
    handler: async (ctx, args) => {
        const userId = (await ctx.auth.getUserIdentity())?.subject;
        if (!userId) {
            throw new Error("Not authenticated");
        }

        const chat = await ctx.db.get(args.chatId);
        if (!chat || chat.userId !== userId) {
            throw new Error("Chat not found or unauthorized");
        }

        const newMessage = {
            role: args.role,
            content: args.content,
            timestamp: Date.now(),
            attachments: args.attachments,
        };

        await ctx.db.patch(args.chatId, {
            messages: [...chat.messages, newMessage],
            lastMessageAt: Date.now(),
            searchableContent:
                (chat.searchableContent || "") + " " + newMessage.content,
        });
    },
});
