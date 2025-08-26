import { log } from "../util/logger.js";
import { CONFIG } from "../config.js";
import { GoogleGenerativeAIEmbeddings } from "@langchain/google-genai";
import { HuggingFaceTransformersEmbeddings } from "@langchain/community/embeddings/huggingface_transformers";

let embeddings = null;
let provider = "google";

export async function getEmbeddings() {
    if (embeddings) return embeddings;

    // First check for Vietnamese embeddings model - try to use the same model as Python
    // if (process.env.USE_VIETNAMESE_EMBEDDINGS === "true") {
    //     try {
    //         log.info(
    //             "Embeddings provider: Vietnamese document embedding (dangvantuan/vietnamese-document-embedding)"
    //         );
    //         provider = "vietnamese";
    //         embeddings = new HuggingFaceTransformersEmbeddings({
    //             model: "dangvantuan/vietnamese-document-embedding",
    //             stripNewLines: true,
    //         });
    //         return embeddings;
    //     } catch (error) {
    //         log.warn("Failed to load Vietnamese embeddings model:", error.message);
    //         log.warn("Falling back to other embedding providers...");
    //     }
    // }

    if (process.env.GEMINI_API_KEY) {
        log.info(
            "Embeddings provider: Google Generative AI (",
            CONFIG.GOOGLE_EMBEDDINGS_MODEL,
            ")"
        );
        embeddings = new GoogleGenerativeAIEmbeddings({
            apiKey: process.env.GEMINI_API_KEY,
            model: CONFIG.GOOGLE_EMBEDDINGS_MODEL,
        });
        provider = "google";
        return embeddings;
    }

    // Fallback: local, open-source, no network.
    log.warn(
        "GEMINI_API_KEY missing. Falling back to local BGE-small embeddings (Xenova). Generation will require an API key."
    );
    provider = "bge-small";
    embeddings = new HuggingFaceTransformersEmbeddings({
        model: "Xenova/bge-small-en-v1.5",
        // normalize for cosine sim
        stripNewLines: true,
    });
    return embeddings;
}

export function getEmbeddingsProvider() {
    return provider;
}
