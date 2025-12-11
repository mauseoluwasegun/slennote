import { action } from "./_generated/server";
import { v } from "convex/values";

export const transcribeAudio = action({
    args: {
        audioData: v.string(), // Base64 encoded audio
        apiKey: v.string(),
    },
    handler: async (ctx, args) => {
        const { audioData, apiKey } = args;

        if (!apiKey) {
            throw new Error("Gemini API key is missing");
        }

        const generateContent = async (model: string) => {
            console.log(`🤖 Attempting transcription with model: ${model}`);
            const response = await fetch(
                `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`,
                {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                        contents: [{
                            parts: [
                                { text: "Transcribe the spoken words in this audio clearly and accurately. Only return the transcription, no commentary or additional text." },
                                { inline_data: { mime_type: "audio/webm", data: audioData } },
                            ],
                        }],
                        generationConfig: {
                            temperature: 0.1,
                            maxOutputTokens: 2048,
                            topP: 0.95,
                        },
                    }),
                }
            );

            if (!response.ok) {
                if (response.status === 404) {
                    console.log(`⚠️ Model ${model} not found (404)`);
                    return null; // Model not found, try next
                }
                const errorText = await response.text();
                console.error(`❌ Gemini API error (${model}): ${response.status} - ${errorText}`);
                throw new Error(`Gemini API error (${model}): ${response.status} - ${errorText}`);
            }

            const data = await response.json();
            console.log(`✅ Model ${model} responded successfully`);
            return data;
        };

        try {
            console.log(`📊 Audio data size: ${audioData.length} characters (base64)`);

            // Try Flash first (fastest)
            let data = await generateContent("gemini-1.5-flash-001");

            // Fallback to Pro if Flash not found
            if (!data) {
                console.log("⚠️ Gemini 1.5 Flash not found, falling back to Pro...");
                data = await generateContent("gemini-1.5-pro");
            }

            // Fallback to generic Flash alias
            if (!data) {
                console.log("⚠️ Gemini 1.5 Pro not found, falling back to generic Flash...");
                data = await generateContent("gemini-1.5-flash");
            }

            if (!data) {
                throw new Error("❌ All Gemini models failed (404). Please check your API key and region availability.");
            }

            const text = data.candidates?.[0]?.content?.parts?.[0]?.text;

            if (!text) {
                console.log("⚠️ No text in response, returning empty transcript");
                return { transcript: "" };
            }

            console.log(`✅ Transcription successful, text length: ${text.length} characters`);
            console.log(`📝 Transcript: "${text.trim()}"`);
            return { transcript: text.trim() };
        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : String(error);
            console.error("❌ Detailed transcription error:", {
                message: errorMessage,
                error: error,
                stack: error instanceof Error ? error.stack : undefined
            });
            throw new Error(`Transcription failed: ${errorMessage}`);
        }
    },
});


