import { Router } from "express";
import { retrieve } from "../rag/retriever.js";
import { generateWithContext } from "../llm/gemini.js";
import { CONFIG } from "../config.js";
import { log } from "../util/logger.js";

const router = Router();

router.post("/", async (req, res) => {
    try {
        const { message, options } = req.body || {};
        if (!message || typeof message !== "string") {
            return res.status(400).json({ error: "message is required" });
        }
        const k = Number(options?.retrievalK || CONFIG.RETRIEVAL_K);
        const threshold = Number(options?.scoreThreshold ?? CONFIG.SCORE_THRESHOLD);
        const temperature = Number(options?.temperature ?? CONFIG.TEMPERATURE);

        const hits = await retrieve(message, k, threshold);
        log.info(`Retrieved ${hits.length}/${k} sources for query (threshold: ${threshold})`);
        // Apply fixed threshold counting
        const { text, error } = await generateWithContext({
            query: message,
            contexts: hits,
            temperature,
        });

        if (error) return res.status(400).json({ error });

        res.json({
            reply: text,
            sources: hits.map((h, i) => ({
                id: i + 1,
                title: h.title,
                source: h.source,
                text: h.text, // include exact chunk text
                score: h.score,
                chunkIndex: h.chunkIndex, // optional metadata
                chunkCount: h.chunkCount,
                chunkId: h.chunkId,
            })),
        });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: err.message || "Internal error" });
    }
});

export default router;
