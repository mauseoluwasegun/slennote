"use node";
import { v } from "convex/values";
import { action } from "./_generated/server";

export const scrapeLink = action({
    args: { url: v.string() },
    handler: async (ctx, args) => {
        const firecrawlKey = process.env.FIRECRAWL_API_KEY;

        // If no Firecrawl key, try basic metadata extraction
        if (!firecrawlKey) {
            console.log("⚠️ No FIRECRAWL_API_KEY found, falling back to basic metadata extraction");
            return await basicMetadataExtraction(args.url);
        }

        try {
            console.log(`🕷️ Scraping ${args.url} with Firecrawl...`);
            const response = await fetch("https://api.firecrawl.dev/v0/scrape", {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    "Authorization": `Bearer ${firecrawlKey}`
                },
                body: JSON.stringify({
                    url: args.url,
                    pageOptions: {
                        onlyMainContent: true
                    }
                })
            });

            if (!response.ok) {
                throw new Error(`Firecrawl API error: ${response.status}`);
            }

            const data = await response.json();

            if (!data.success) {
                throw new Error(data.error || "Unknown Firecrawl error");
            }

            return {
                title: data.data.metadata?.title || data.data.metadata?.ogTitle || "Untitled",
                content: data.data.markdown || data.data.content || "",
                favicon: data.data.metadata?.favicon || data.data.metadata?.ogImage,
                success: true
            };

        } catch (error) {
            console.error("❌ Firecrawl scraping failed:", error);
            // Fallback to basic extraction on error
            return await basicMetadataExtraction(args.url);
        }
    },
});

async function basicMetadataExtraction(url: string) {
    try {
        const response = await fetch(url, {
            headers: {
                "User-Agent": "Mozilla/5.0 (compatible; AI-Chat-Bot/1.0)"
            }
        });

        const html = await response.text();

        // Simple regex extraction for title and description
        const titleMatch = html.match(/<title>(.*?)<\/title>/i) || html.match(/<meta property="og:title" content="(.*?)"/i);
        const descMatch = html.match(/<meta name="description" content="(.*?)"/i) || html.match(/<meta property="og:description" content="(.*?)"/i);
        const faviconMatch = html.match(/<link rel="icon" href="(.*?)"/i) || html.match(/<link rel="shortcut icon" href="(.*?)"/i);

        return {
            title: titleMatch ? titleMatch[1] : url,
            content: descMatch ? descMatch[1] : "No content preview available.",
            favicon: faviconMatch ? new URL(faviconMatch[1], url).toString() : undefined,
            success: true
        };
    } catch (error) {
        console.error("Basic extraction failed:", error);
        return {
            title: url,
            content: "Could not scrape link content.",
            success: false
        };
    }
}
