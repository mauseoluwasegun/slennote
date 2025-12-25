"use node";

import { action, internalAction } from "./_generated/server";
import { v } from "convex/values";
import { internal } from "./_generated/api";
import Anthropic from "@anthropic-ai/sdk";
import { groq } from '@ai-sdk/groq';
import { generateText } from 'ai';
import Firecrawl from "@mendable/firecrawl-js";

// Minimal fallback prompt - the full prompts should be stored in env vars for privacy
const DEFAULT_SYSTEM_PROMPT = `You are a helpful writing assistant. Help users write clearly and concisely.`;

export const CLAUDE_PROMPT_STYLE = `
You are an AI assistant integrated into a note-taking application. Your role is to help users capture, organize, and work with their notes effectively.

## Communication Style
- Be concise and focused - users are taking notes, not chatting
- Use clear, direct language without unnecessary pleasantries
- Default to brief responses unless the user asks for elaboration
- Avoid overly formal or robotic language - be natural but professional

## Formatting Guidelines
- Use markdown formatting for clarity (headers, lists, code blocks)
- When suggesting note structures, use clear hierarchies
- Keep paragraphs short (2-3 sentences max)
- Use bullet points for lists of items or quick references
- Use numbered lists only for sequential steps or ranked items

## Response Length
- Default to 2-4 sentences for simple queries
- Expand to 1-2 paragraphs for explanations
- For note generation/editing, match the scope requested
- Always prioritize clarity over brevity when necessary
`;

export const CLAUDE_PROMPT_COMMUNITY = `
## Data Context & Privacy
- You can access and reference the user's notes within this conversation
- Treat all note content as private and confidential
- Never suggest sharing sensitive information externally
- When referencing past notes, be specific about which note you're referring to

## Note Organization Principles
- Help users create clear, scannable note structures
- Suggest appropriate tags and categories based on content
- Recommend connections between related notes when relevant
- Support various note-taking methodologies (Zettelkasten, Cornell, bullet journaling, etc.)

## Collaboration Features
- When users share notes, maintain context about who created what
- Respect collaboration boundaries and permissions
- Help resolve conflicting edits diplomatically
- Suggest ways to merge or reconcile different perspectives

## Search & Discovery
- Help users find notes using natural language queries
- Suggest relevant keywords or tags for better discoverability
- Offer to create index notes or tables of contents when helpful
- Identify patterns or themes across multiple notes
`;

export const CLAUDE_PROMPT_RULES = `
## Core Capabilities
You can:
- Create, edit, and format notes in markdown
- Summarize long notes or meetings
- Extract action items, key points, or todos from notes
- Suggest organizational structures and improvements
- Answer questions about note content
- Generate templates for common note types
- Help with brainstorming and ideation
- Convert between note formats (outline to paragraph, etc.)
- Create study guides or review materials from notes

## Limitations
You cannot:
- Access notes from other users without explicit permission
- Modify notes without user confirmation when changes are substantial
- Recover deleted notes (encourage users to use app's recovery features)
- Access external websites or real-time information
- Execute code or scripts within notes
- Guarantee perfect recall of all conversation history

## Note Modification Protocol
When editing existing notes:
1. Always show what you're changing if the edit is significant
2. Preserve the user's voice and style unless asked to change it
3. Ask before making structural reorganizations
4. Confirm before deleting substantial content
5. For minor fixes (spelling, formatting), just make the change

## Special Commands Recognition
Be prepared to handle user requests like:
- "Summarize this note"
- "Extract todos"
- "Make this more concise"
- "Expand on [topic]"
- "Create an outline"
- "Find all notes about [topic]"
- "Merge these notes"
- "Generate a template for [purpose]"

## Error Handling
When you encounter issues:
- Clearly state what you cannot do and why
- Offer alternative approaches when possible
- If a note is too long or complex, suggest breaking it down
- If context is unclear, ask specific clarifying questions

## Quality Standards
- Maintain consistency in terminology and formatting
- Flag potential errors or inconsistencies in notes
- Suggest improvements proactively but don't be pushy
- Respect the user's organizational preferences
- Adapt to the user's note-taking style over time
`;

// URL regex pattern for auto-detection
const URL_REGEX = /https?:\/\/[^\s<>"{}|\\^`[\]]+/g;

// Build system prompt from environment variables (split for Convex 8KB limit)
function buildSystemPrompt(): string {
    const part1 = CLAUDE_PROMPT_STYLE || "";
    const part2 = CLAUDE_PROMPT_COMMUNITY || "";
    const part3 = CLAUDE_PROMPT_RULES || "";

    // Combine parts if any exist
    const parts = [part1, part2, part3].filter((p) => p.trim());

    if (parts.length > 0) {
        return parts.join("\n\n---\n\n");
    }

    // Fall back to single env var or default
    return process.env.GROQ_SYSTEM_PROMPT || DEFAULT_SYSTEM_PROMPT;
}

// Scrape URL content using Firecrawl
async function scrapeUrl(
    url: string,
): Promise<{ title: string; content: string } | null> {
    const apiKey = process.env.FIRECRAWL_API_KEY;
    if (!apiKey) {
        console.warn("FIRECRAWL_API_KEY not configured, skipping URL scraping");
        return null;
    }

    try {
        const firecrawl = new Firecrawl({ apiKey });
        const result = await firecrawl.scrape(url, {
            formats: ["markdown"],
        });

        if (result.markdown) {
            // Truncate content to avoid token limits (max 8000 chars)
            const truncatedContent = result.markdown.slice(0, 8000);
            return {
                title: result.metadata?.title || url,
                content: truncatedContent,
            };
        }
        return null;
    } catch (error) {
        console.error("Firecrawl scrape error:", error);
        return null;
    }
}

// Generate AI response supporting both Claude and Groq
export const generateResponse = action({
    args: {
        chatId: v.id("aiChats"),
        userMessage: v.optional(v.string()), // Made optional - will read from chat history if not provided
        model: v.optional(v.union(v.literal("claude"), v.literal("grok"))), // Added model argument
        noteIds: v.optional(v.array(v.id("fullPageNotes"))), // Optional note IDs for context
        attachments: v.optional(
            v.array(
                v.object({
                    type: v.union(v.literal("image"), v.literal("link")),
                    storageId: v.optional(v.id("_storage")),
                    url: v.optional(v.string()),
                }),
            ),
        ),
    },
    returns: v.string(),
    handler: async (ctx, args) => {
        const identity = await ctx.auth.getUserIdentity();
        if (!identity) {
            throw new Error("Not authenticated");
        }

        const model = args.model || "claude"; // Default to Claude
        const systemPrompt = buildSystemPrompt();

        // Get chat history for context
        const chat = await ctx.runQuery(internal.aiChats.getAIChatInternal, {
            chatId: args.chatId,
        });

        if (!chat) {
            throw new Error("Chat not found");
        }

        // If userMessage not provided, use the last message from chat history
        const userMessage = args.userMessage || chat.messages[chat.messages.length - 1]?.content || "";
        if (!userMessage) {
            throw new Error("No user message found");
        }

        // Fetch notes for context if noteIds provided
        let noteContext = "";
        if (args.noteIds && args.noteIds.length > 0) {
            const notes = await ctx.runQuery(internal.fullPageNotes.getNotesByIdsInternal, {
                noteIds: args.noteIds,
                userId: identity.subject,
            });
            if (notes.length > 0) {
                noteContext = "\n\n---\n\n**User's Notes for Reference:**\n\n";
                for (const note of notes) {
                    noteContext += `### ${note.title}\n${note.content}\n\n---\n\n`;
                }
            }
        }

        // Collect URLs to scrape
        const urlsToScrape: string[] = [];
        const imageUrls: string[] = [];

        // Process explicit attachments
        if (args.attachments && args.attachments.length > 0) {
            for (const attachment of args.attachments) {
                if (attachment.type === "link" && attachment.url) {
                    urlsToScrape.push(attachment.url);
                } else if (attachment.type === "image" && attachment.storageId) {
                    // Get image URL from Convex storage
                    const imageUrl = await ctx.runQuery(
                        internal.aiChats.getStorageUrlInternal,
                        {
                            storageId: attachment.storageId,
                        },
                    );
                    if (imageUrl) {
                        imageUrls.push(imageUrl);
                    }
                }
            }
        }

        // Auto-detect URLs in the message (limit to 3)
        const detectedUrls = userMessage.match(URL_REGEX) || [];
        for (const url of detectedUrls.slice(0, 3)) {
            if (!urlsToScrape.includes(url)) {
                urlsToScrape.push(url);
            }
        }

        // Scrape URLs in parallel (max 3)
        const scrapedContents: Array<{
            url: string;
            title: string;
            content: string;
        }> = [];
        const scrapePromises = urlsToScrape.slice(0, 3).map(async (url) => {
            const scraped = await scrapeUrl(url);
            if (scraped) {
                scrapedContents.push({ url, ...scraped });
            }
        });
        await Promise.all(scrapePromises);

        // Build message history (last 20 messages)
        const recentMessages = chat.messages.slice(-20);

        let assistantMessage: string;

        if (model === "grok") {
            // GROQ Implementation
            const apiKey = process.env.GROQ_API_KEY;
            if (!apiKey) throw new Error("GROQ_API_KEY not configured");

            // Build Groq messages
            const groqMessages: Array<{
                role: "user" | "assistant" | "system";
                content: string;
            }> = recentMessages.map((msg: { role: "user" | "assistant"; content: string }) => ({
                role: msg.role as "user" | "assistant",
                content: msg.content,
            }));

            // Build user message content
            let messageContent = noteContext ? noteContext + userMessage : userMessage;
            if (imageUrls.length > 0) {
                messageContent += `\n\n[Note: ${imageUrls.length} image(s) attached but vision processing not available with current model]`;
            }
            if (scrapedContents.length > 0) {
                messageContent += "\n\n---\n\n**Referenced Content:**\n\n";
                for (const scraped of scrapedContents) {
                    messageContent += `### ${scraped.title}\n*Source: ${scraped.url}*\n\n${scraped.content}\n\n---\n\n`;
                }
            }

            groqMessages.push({
                role: "user",
                content: messageContent,
            });

            // Call Groq API
            const result = await generateText({
                model: groq('llama-3.3-70b-versatile'),
                system: systemPrompt,
                messages: groqMessages,
                temperature: 0.7,
            });

            assistantMessage = result.text || "I apologize, but I could not generate a response.";

        } else {
            // CLAUDE Implementation
            const apiKey = process.env.ANTHROPIC_API_KEY;
            if (!apiKey) throw new Error("ANTHROPIC_API_KEY not configured");

            const anthropic = new Anthropic({ apiKey });

            // Build Claude messages
            type ClaudeMessageContent = string | Array<Anthropic.TextBlockParam | Anthropic.ImageBlockParam>;
            const claudeMessages: Array<{
                role: "user" | "assistant";
                content: ClaudeMessageContent;
            }> = recentMessages.map((msg) => ({
                role: msg.role,
                content: msg.content,
            }));

            let messageContent: ClaudeMessageContent;

            if (imageUrls.length > 0 || scrapedContents.length > 0) {
                const contentBlocks: Array<Anthropic.TextBlockParam | Anthropic.ImageBlockParam> = [];

                // Add images first
                for (const imageUrl of imageUrls) {
                    contentBlocks.push({
                        type: "image",
                        source: {
                            type: "url",
                            url: imageUrl,
                        },
                    });
                }

                // Build text content
                let textContent = userMessage;
                if (scrapedContents.length > 0) {
                    textContent += "\n\n---\n\n**Referenced Content:**\n\n";
                    for (const scraped of scrapedContents) {
                        textContent += `### ${scraped.title}\n*Source: ${scraped.url}*\n\n${scraped.content}\n\n---\n\n`;
                    }
                }

                contentBlocks.push({
                    type: "text",
                    text: textContent,
                });
                messageContent = contentBlocks;
            } else {
                messageContent = noteContext ? noteContext + userMessage : userMessage;
            }

            claudeMessages.push({
                role: "user",
                content: messageContent,
            });

            const response = await anthropic.messages.create({
                model: "claude-3-5-sonnet-20240620", // Updated to correct model ID
                max_tokens: 2048,
                system: systemPrompt,
                messages: claudeMessages,
            });

            const textContent = response.content.find((block) => block.type === "text");
            assistantMessage = textContent?.type === "text" ? textContent.text : "I apologize, but I could not generate a response.";
        }

        // Save the assistant message
        await ctx.runMutation(internal.aiChats.addAssistantMessage, {
            chatId: args.chatId,
            content: assistantMessage,
        });

        return assistantMessage;
    },
});

// Internal action to scrape a single URL (for testing/debugging)
export const scrapeUrlAction = internalAction({
    args: {
        url: v.string(),
    },
    returns: v.union(
        v.object({
            title: v.string(),
            content: v.string(),
        }),
        v.null(),
    ),
    handler: async (_ctx, args) => {
        return await scrapeUrl(args.url);
    },
});