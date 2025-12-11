import { action } from "./_generated/server";
import { v } from "convex/values";

export const breakdownTodoWithAI = action({
    args: {
        todoContent: v.string(),
    },
    handler: async (ctx, args) => {
        const apiKey = process.env.VITE_GEMINI_API_KEY;

        if (!apiKey) {
            throw new Error("Gemini API key not configured");
        }

        const prompt = `You are a task breakdown assistant. Break down the following task into 3-6 specific, actionable subtasks.

Task: ${args.todoContent}

Rules:
- Each subtask should be concrete and actionable
- Keep subtasks brief (max 60 characters)
- Return ONLY a JSON array of strings
- No explanations, just the array
- Example format: ["First step", "Second step", "Third step"]

Subtasks:`;

        try {
            const response = await fetch(
                `https://generativelanguage.googleapis.com/v1beta/models/gemini-pro:generateContent?key=${apiKey}`,
                {
                    method: "POST",
                    headers: {
                        "Content-Type": "application/json",
                    },
                    body: JSON.stringify({
                        contents: [{
                            parts: [{
                                text: prompt
                            }]
                        }],
                        generationConfig: {
                            temperature: 0.7,
                            maxOutputTokens: 500,
                        },
                    }),
                }
            );

            if (!response.ok) {
                throw new Error(`Gemini API error: ${response.status}`);
            }

            const data = await response.json();
            const text = data.candidates?.[0]?.content?.parts?.[0]?.text;

            if (!text) {
                throw new Error("No response from Gemini");
            }

            // Extract JSON array from response
            const jsonMatch = text.match(/\[[\s\S]*\]/);
            if (!jsonMatch) {
                throw new Error("Could not parse subtasks from response");
            }

            const subtasks = JSON.parse(jsonMatch[0]);

            if (!Array.isArray(subtasks) || subtasks.length === 0) {
                throw new Error("Invalid subtasks format");
            }

            return { subtasks: subtasks.filter(s => typeof s === "string" && s.trim()) };
        } catch (error) {
            console.error("Error calling Gemini API:", error);
            throw new Error("Failed to generate subtasks. Please try again.");
        }
    },
});
