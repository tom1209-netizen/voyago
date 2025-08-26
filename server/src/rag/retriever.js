import { getVectorRepo } from "./vectorstore.js";
import { CONFIG } from "../config.js";
import { log } from "../util/logger.js";

export async function retrieve(query, k = CONFIG.RETRIEVAL_K, threshold = CONFIG.SCORE_THRESHOLD) {
    const repo = await getVectorRepo();
    
    // Get more results initially to filter by threshold
    const maxResults = Math.max(k * 2, 10); // Get at least 10 or 2x the requested amount
    const results = await repo.search(query, maxResults);
    
    // Log all result scores for debugging
    log.info(`All result scores: [${results.map(r => r.score.toFixed(3)).join(', ')}]`);
    
    // Count how many results are above threshold before filtering
    const aboveThresholdCount = results.filter(r => r.score >= threshold).length;
    
    // Filter by threshold and limit to k
    const filteredResults = results
        .filter(r => r.score >= threshold)
        .slice(0, k);
    
    log.info(`Found ${results.length} total results, ${aboveThresholdCount} above threshold ${threshold}`);
    
    // If no results meet threshold, return top results anyway (but warn)
    const finalResults = filteredResults.length > 0 ? filteredResults : results.slice(0, Math.min(k, 2));
    
    if (filteredResults.length === 0 && results.length > 0) {
        log.warn(`No results above threshold ${threshold}, returning top ${finalResults.length} results`);
    }
    
    // Normalize into {text, source, title, score, chunkIndex?, chunkCount?, chunkId?}
    return finalResults.map((r) => {
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
