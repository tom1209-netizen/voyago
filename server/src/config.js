import dotenv from "dotenv";
dotenv.config();

export const CONFIG = {
    PORT: process.env.PORT || 8080,
    GEMINI_API_KEY: process.env.GEMINI_API_KEY,
    GEMINI_MODEL: process.env.GEMINI_MODEL || "gemini-1.5-flash",
    GOOGLE_EMBEDDINGS_MODEL:
        process.env.GOOGLE_EMBEDDINGS_MODEL || "text-embedding-004",
    VECTOR_DB: (process.env.VECTOR_DB || "faiss").toLowerCase(), 
    INDEX_NAME: process.env.INDEX_NAME || "internal_knowledge",
    RETRIEVAL_K: Number(process.env.RETRIEVAL_K || 4),
    MAX_INPUT_CHARS: Number(process.env.MAX_INPUT_CHARS || 12000),
    TEMPERATURE: Number(process.env.TEMPERATURE || 0.2),
};
