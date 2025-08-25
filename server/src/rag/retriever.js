import { getVectorRepo } from "./vectorstore.js";
import { CONFIG } from "../config.js";

export async function retrieve(query, k = CONFIG.RETRIEVAL_K) {
    const repo = await getVectorRepo();
    const results = await repo.search(query, k);
    // Normalize into {text, source, title, score, chunkIndex?, chunkCount?, chunkId?}
    return results.map((r) => ({
        text: r.doc.pageContent,
        source: r.doc.metadata?.source || r.doc.metadata?.title || "unknown",
        title: r.doc.metadata?.title || r.doc.metadata?.source || "unknown",
        score: r.score,
        // added metadata for precise citation when available
        chunkIndex: r.doc.metadata?.chunkIndex ?? null,
        chunkCount: r.doc.metadata?.chunkCount ?? null,
        chunkId: r.doc.metadata?.chunkId ?? null,
    }));
}

export async function listSources() {
    const repo = await getVectorRepo();
    return repo.listSources();
}
