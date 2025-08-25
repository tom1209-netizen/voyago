import { GoogleGenerativeAI } from "@google/generative-ai";
import { CONFIG } from "../config.js";
import { log } from "../util/logger.js";

let modelInstance = null;

export function getGeminiModel() {
    if (!CONFIG.GEMINI_API_KEY) return null;
    if (modelInstance) return modelInstance;
    const genAI = new GoogleGenerativeAI(CONFIG.GEMINI_API_KEY);
    modelInstance = genAI.getGenerativeModel({ model: CONFIG.GEMINI_MODEL });
    log.info("Gemini model:", CONFIG.GEMINI_MODEL);
    return modelInstance;
}

export async function generateWithContext({
    query,
    contexts,
    temperature = CONFIG.TEMPERATURE,
}) {
    const model = getGeminiModel();
    if (!model) {
        return {
            error: "GEMINI_API_KEY missing. Please set it in the server environment.",
            text: null,
        };
    }

    const instructions = `You are an internal RAG assistant.\n\n- Answer using ONLY the provided context chunks.\n- If the answer isn't in the context, say you don't know succinctly.\n- When you reference context, add inline source markers like [1], [2].`;

    const contextBlocks = contexts
        .map((c, i) => `[[${i + 1}]] Source: ${c.title}\nContent:\n${c.text}`)
        .join("\n\n---\n\n");

    const prompt = `${instructions}\n\nUser question:\n${query}\n\nContext:\n${contextBlocks}`;

    const result = await model.generateContent({
        contents: [{ role: "user", parts: [{ text: prompt }] }],
        generationConfig: {
            temperature,
            maxOutputTokens: 1024,
        },
    });

    const text = result.response.text();
    return { text };
}
