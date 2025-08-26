import { getVectorRepo } from "./vectorstore.js";
import { CONFIG } from "../config.js";

export async function retrieve(query, k = CONFIG.RETRIEVAL_K) {
    const repo = await getVectorRepo();
    const results = await repo.search(query, k);
    
    // Normalize into {text, source, title, score, chunkIndex?, chunkCount?, chunkId?}
    return results.map((r) => {
        let text = r.doc.pageContent;
        
        // For policy-related queries, enhance the text with policy information
        // const queryLower = query.toLowerCase();
        // if (queryLower.includes("chính sách") || queryLower.includes("policy")) {
        //     const policyInfo = [];
            
        //     if (r.doc.metadata?.pricing_policy) {
        //         policyInfo.push(`Chính sách giá: ${r.doc.metadata.pricing_policy}`);
        //     }
        //     if (r.doc.metadata?.promotion_policy) {
        //         policyInfo.push(`Chính sách khuyến mãi: ${r.doc.metadata.promotion_policy}`);
        //     }
        //     if (r.doc.metadata?.cancellation_policy) {
        //         policyInfo.push(`Chính sách hủy tour: ${r.doc.metadata.cancellation_policy}`);
        //     }
            
        //     if (policyInfo.length > 0) {
        //         text = `${text}\n\n--- Thông tin chính sách ---\n${policyInfo.join('\n\n')}`;
        //     }
        // }
        
        return {
            text,
            source: r.doc.metadata?.source || r.doc.metadata?.title || "unknown",
            title: r.doc.metadata?.title || r.doc.metadata?.source || "unknown",
            score: r.score,
            // added metadata for precise citation when available
            chunkIndex: r.doc.metadata?.chunkIndex ?? null,
            chunkCount: r.doc.metadata?.chunkCount ?? null,
            chunkId: r.doc.metadata?.chunkId ?? null,
            // Add policy metadata
            url: r.doc.metadata?.url,
            price: r.doc.metadata?.price,
            pricing_policy: r.doc.metadata?.pricing_policy,
            promotion_policy: r.doc.metadata?.promotion_policy,
            cancellation_policy: r.doc.metadata?.cancellation_policy,
        };
    });
}

export async function listSources() {
    const repo = await getVectorRepo();
    return repo.listSources();
}
