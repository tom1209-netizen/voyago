import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { getEmbeddings } from "./embeddings.js";
import { log } from "../util/logger.js";
import { CONFIG } from "../config.js";
import { Document } from "@langchain/core/documents";
import { RecursiveCharacterTextSplitter } from "@langchain/textsplitters";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const STORE_DIR = path.join(__dirname, "../store");
const DATA_DIR = path.join(__dirname, "../data");
const CHROMA_DB_PATH = path.join(__dirname, "../vector_db/chroma_db");
const EMBEDDED_COMBINED_PATH = path.join(__dirname, "../vector_db/embedded_combined.json");
const EMBEDDED_TOURS_PATH = path.join(__dirname, "../vector_db/embedded_tours.json");
const COLLECTION_NAME = "tours";

function ensureDirs() {
    if (!fs.existsSync(STORE_DIR)) fs.mkdirSync(STORE_DIR, { recursive: true });
    if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
}

function listFilesRecursive(dir) {
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    const files = entries.flatMap((ent) => {
        const p = path.resolve(dir, ent.name);
        return ent.isDirectory() ? listFilesRecursive(p) : [p];
    });
    return files.filter((f) => f.endsWith(".md") || f.endsWith(".txt"));
}

async function loadRawDocs() {
    ensureDirs();
    
    // Check if we have the tours.json file in the vector_db directory
    const toursJsonPath = path.join(__dirname, "../vector_db/tours.json");
    if (fs.existsSync(toursJsonPath)) {
        log.info("Loading tours data from tours.json");
        const toursData = JSON.parse(fs.readFileSync(toursJsonPath, "utf-8"));
        
        return toursData.map((tour, idx) => {
            const content = `${tour.tour_name || ''}. ${tour.description || ''}. ${tour.other || ''}`;
            return new Document({
                pageContent: content,
                metadata: {
                    source: `tour_${idx}`,
                    title: tour.tour_name || `Tour ${idx}`,
                    url: tour.url || "",
                    departure_point: tour.departure_point || "",
                    departure_date: tour.departure_date || "",
                    price: tour.price || "",
                    pricing_policy: tour.pricing_policy || "",
                    promotion_policy: tour.promotion_policy || "",
                    cancellation_policy: tour.cancellation_policy || ""
                },
            });
        });
    }
    
    // Fallback to original text file behavior
    const existing = listFilesRecursive(DATA_DIR);
    if (existing.length === 0) {
        fs.writeFileSync(
            path.join(DATA_DIR, "Getting-Started.txt"),
            "This is your internal knowledge base.\n\n- Add .md or .txt files into server/src/data/.\n- The index is built on server startup and persisted.\n- No user uploads are allowed at runtime."
        );
    }
    const files = listFilesRecursive(DATA_DIR);
    return files.map(
        (file) =>
            new Document({
                pageContent: fs.readFileSync(file, "utf-8"),
                metadata: {
                    source: path.relative(DATA_DIR, file).replace(/\\/g, "/"),
                    title: path.basename(file),
                },
            })
    );
}

async function loadAndSplitDocs() {
    const raw = await loadRawDocs();
    const splitter = new RecursiveCharacterTextSplitter({
        chunkSize: 800,
        chunkOverlap: 120,
    });
    const chunks = await splitter.splitDocuments(raw);

    // Annotate chunks with per-source indices and a stable chunkId.
    const bySource = new Map();
    for (const d of chunks) {
        const source = d.metadata?.source || d.metadata?.title || "unknown";
        if (!bySource.has(source)) bySource.set(source, []);
        bySource.get(source).push(d);
    }
    for (const [source, docs] of bySource.entries()) {
        const count = docs.length;
        docs.forEach((doc, idx) => {
            doc.metadata = {
                ...doc.metadata,
                chunkIndex: idx,
                chunkCount: count,
                chunkId: `${source}::${idx}`,
            };
        });
    }

    return chunks;
}

function dirHasFiles(dir) {
    try {
        return fs.existsSync(dir) && fs.readdirSync(dir).length > 0;
    } catch {
        return false;
    }
}

async function createCustomChromaStore(embeddings) {
    // First check if we have combined pre-embedded data (tours + policies)
    if (fs.existsSync(EMBEDDED_COMBINED_PATH)) {
        log.info("Using pre-embedded combined data from embedded_combined.json");
        return createEmbeddedCombinedStore(embeddings);
    }
    
    // Fallback to tours-only data
    if (fs.existsSync(EMBEDDED_TOURS_PATH)) {
        log.info("Using pre-embedded tours data from embedded_tours.json");
        return createEmbeddedToursStore(embeddings);
    }
    
    // Final fallback to SQLite-based ChromaDB
    log.info("Using SQLite-based ChromaDB");
    return createSQLiteChromaStore(embeddings);
}

async function createEmbeddedToursStore(embeddings) {
    try {
        log.info("Loading pre-embedded tours data...");
        const embeddedData = JSON.parse(fs.readFileSync(EMBEDDED_TOURS_PATH, "utf-8"));
        log.info(`Loaded ${embeddedData.length} embedded documents`);

        // Calculate cosine similarity
        function cosineSimilarity(vecA, vecB) {
            const dotProduct = vecA.reduce((sum, a, i) => sum + a * vecB[i], 0);
            const magnitudeA = Math.sqrt(vecA.reduce((sum, a) => sum + a * a, 0));
            const magnitudeB = Math.sqrt(vecB.reduce((sum, b) => sum + b * b, 0));
            return dotProduct / (magnitudeA * magnitudeB);
        }

        return {
            kind: "embedded_tours",
            async search(query, k) {
                try {
                    log.info(`Searching embedded tours data for: "${query}"`);
                    
                    // Get query embedding
                    const queryEmbedding = await embeddings.embedQuery(query);
                    
                    const results = [];
                    
                    for (const item of embeddedData) {
                        try {
                            // Calculate similarity
                            const similarity = cosineSimilarity(queryEmbedding, item.embedding);
                            
                            // Create Document object
                            const document = new Document({
                                pageContent: item.document,
                                metadata: {
                                    source: item.id,
                                    url: item.metadata.url,
                                    departure_point: item.metadata.departure_point,
                                    departure_date: item.metadata.departure_date,
                                    price: item.metadata.price,
                                    pricing_policy: item.metadata.pricing_policy,
                                    promotion_policy: item.metadata.promotion_policy,
                                    cancellation_policy: item.metadata.cancellation_policy
                                }
                            });

                            // Enhanced scoring with policy awareness
                            const queryLower = query.toLowerCase();
                            const contentLower = (item.document || "").toLowerCase();
                            
                            // Get all text fields for comprehensive search
                            const allText = [
                                item.document || "",
                                item.metadata.pricing_policy || "",
                                item.metadata.promotion_policy || "",
                                item.metadata.cancellation_policy || ""
                            ].join(" ").toLowerCase();
                            
                            let score = similarity; // Start with cosine similarity
                            
                            // Policy-specific scoring boost
                            if (queryLower.includes("chính sách") || queryLower.includes("policy")) {
                                // Highest priority: documents that actually contain "chính sách" 
                                if (allText.includes("chính sách")) {
                                    score += 0.4; // High boost for exact phrase match
                                } else {
                                    // Medium priority: documents with substantial policy content
                                    let policyContentScore = 0;
                                    if (item.metadata.pricing_policy && item.metadata.pricing_policy.length > 100) {
                                        policyContentScore += 0.2;
                                    }
                                    if (item.metadata.cancellation_policy && item.metadata.cancellation_policy.length > 100) {
                                        policyContentScore += 0.2;
                                    }
                                    if (item.metadata.promotion_policy && item.metadata.promotion_policy.trim().length > 20) {
                                        policyContentScore += 0.1;
                                    }
                                    score += policyContentScore;
                                }
                            }
                            
                            // Normalize score to max 1.0
                            score = Math.min(score, 1.0);
                            
                            results.push({ doc: document, score });
                        } catch (err) {
                            log.warn("Error processing document:", err.message);
                        }
                    }
                    
                    // Sort by score and return top k
                    const topResults = results
                        .sort((a, b) => b.score - a.score)
                        .slice(0, k);
                    
                    log.info(`Found ${topResults.length} results. Top score: ${topResults[0]?.score.toFixed(3) || 'N/A'}`);
                    
                    return topResults;
                    
                } catch (error) {
                    log.error("Error searching embedded tours data:", error.message);
                    return [];
                }
            },
            listSources() {
                return [{
                    source: "tours",
                    title: "Tours Database (Embedded)",
                    chunks: embeddedData.length
                }];
            },
        };
    } catch (error) {
        log.error("Failed to load embedded tours data:", error.message);
        throw error;
    }
}

async function createEmbeddedCombinedStore(embeddings) {
    try {
        log.info("Loading pre-embedded combined data...");
        const embeddedData = JSON.parse(fs.readFileSync(EMBEDDED_COMBINED_PATH, "utf-8"));
        log.info(`Loaded ${embeddedData.length} embedded documents`);

        // Count tours and policies
        const tours = embeddedData.filter(item => item.metadata.type === "tour");
        const policies = embeddedData.filter(item => item.metadata.type === "policy");
        log.info(`Data breakdown: ${tours.length} tours, ${policies.length} policies`);

        // Calculate cosine similarity
        function cosineSimilarity(vecA, vecB) {
            const dotProduct = vecA.reduce((sum, a, i) => sum + a * vecB[i], 0);
            const magnitudeA = Math.sqrt(vecA.reduce((sum, a) => sum + a * a, 0));
            const magnitudeB = Math.sqrt(vecB.reduce((sum, b) => sum + b * b, 0));
            return dotProduct / (magnitudeA * magnitudeB);
        }

        return {
            kind: "embedded_combined",
            async search(query, k) {
                try {
                    log.info(`Searching embedded combined data for: "${query}"`);
                    
                    // Get query embedding
                    const queryEmbedding = await embeddings.embedQuery(query);
                    
                    const results = [];
                    const queryLower = query.toLowerCase();
                    
                    for (const item of embeddedData) {
                        try {
                            // Calculate similarity
                            const similarity = cosineSimilarity(queryEmbedding, item.embedding);
                            
                            // Create Document object with appropriate metadata based on type
                            let document;
                            if (item.metadata.type === "tour") {
                                document = new Document({
                                    pageContent: item.document,
                                    metadata: {
                                        source: item.id,
                                        title: item.metadata.title,
                                        url: item.metadata.url,
                                        departure_point: item.metadata.departure_point,
                                        departure_date: item.metadata.departure_date,
                                        price: item.metadata.price,
                                        pricing_policy: item.metadata.pricing_policy,
                                        promotion_policy: item.metadata.promotion_policy,
                                        cancellation_policy: item.metadata.cancellation_policy,
                                        type: "tour"
                                    }
                                });
                            } else if (item.metadata.type === "policy") {
                                document = new Document({
                                    pageContent: item.document,
                                    metadata: {
                                        source: item.id,
                                        title: item.metadata.title,
                                        url: item.metadata.url,
                                        policy_category: item.metadata.policy_category,
                                        description: item.metadata.description,
                                        type: "policy"
                                    }
                                });
                            }
                            
                            // Enhanced scoring system
                            let score = similarity; // Base score from embedding similarity
                            
                            // Policy-specific boosting
                            if (queryLower.includes("chính sách") || queryLower.includes("policy")) {
                                if (item.metadata.type === "policy") {
                                    // Boost policy documents for policy queries
                                    score += 0.3;
                                    
                                    // Extra boost if document contains "chính sách"
                                    if (item.document.toLowerCase().includes("chính sách")) {
                                        score += 0.2;
                                    }
                                }
                            } else {
                                // For non-policy queries, slightly prefer tour documents
                                if (item.metadata.type === "tour") {
                                    score += 0.1;
                                }
                            }
                            
                            // Normalize score to max 1.0
                            score = Math.min(score, 1.0);
                            
                            results.push({ doc: document, score });
                        } catch (err) {
                            log.warn("Error processing document:", err.message);
                        }
                    }
                    
                    // Sort by score and return top k
                    const topResults = results
                        .sort((a, b) => b.score - a.score)
                        .slice(0, k);
                    
                    log.info(`Found ${topResults.length} results. Top score: ${topResults[0]?.score.toFixed(3) || 'N/A'}`);
                    
                    return topResults;
                    
                } catch (error) {
                    log.error("Error searching embedded combined data:", error.message);
                    return [];
                }
            },
            listSources() {
                const tours = embeddedData.filter(item => item.metadata.type === "tour");
                const policies = embeddedData.filter(item => item.metadata.type === "policy");
                
                return [
                    {
                        source: "tours",
                        title: "Tours Database (Embedded)",
                        chunks: tours.length
                    },
                    {
                        source: "policies", 
                        title: "Travel Policies (Embedded)",
                        chunks: policies.length
                    }
                ];
            },
        };
    } catch (error) {
        log.error("Failed to load embedded combined data:", error.message);
        throw error;
    }
}

async function createSQLiteChromaStore(embeddings) {
    try {
        const sqlite3 = await import("sqlite3");
        const { Database } = sqlite3.default;
        
        const dbPath = path.join(CHROMA_DB_PATH, "chroma.sqlite3");
        
        if (!fs.existsSync(dbPath)) {
            throw new Error(`Chroma database not found at ${dbPath}`);
        }

        log.info("Loading Chroma database from:", dbPath);

        return new Promise((resolve, reject) => {
            const db = new Database(dbPath, sqlite3.default.OPEN_READONLY, (err) => {
                if (err) {
                    reject(new Error(`Failed to open Chroma database: ${err.message}`));
                    return;
                }

                // Check if tours collection exists
                db.get("SELECT id, dimension FROM collections WHERE name = ?", [COLLECTION_NAME], (err, collection) => {
                    if (err) {
                        reject(new Error(`Failed to query collections: ${err.message}`));
                        return;
                    }

                    if (!collection) {
                        reject(new Error(`Collection '${COLLECTION_NAME}' not found in Chroma database`));
                        return;
                    }

                    log.info(`Found Chroma collection '${COLLECTION_NAME}' with dimension:`, collection.dimension);

                    // Get all documents from the collection
                    const getAllDocs = () => {
                        return new Promise((resolveQuery, rejectQuery) => {
                            db.all(`
                                SELECT 
                                    e.embedding_id, 
                                    em_doc.string_value as document,
                                    em_url.string_value as url,
                                    em_dep_point.string_value as departure_point,
                                    em_dep_date.string_value as departure_date,
                                    em_price.string_value as price,
                                    em_pricing.string_value as pricing_policy,
                                    em_promo.string_value as promotion_policy,
                                    em_cancel.string_value as cancellation_policy
                                FROM embeddings e
                                LEFT JOIN embedding_metadata em_doc ON e.id = em_doc.id AND em_doc.key = 'chroma:document'
                                LEFT JOIN embedding_metadata em_url ON e.id = em_url.id AND em_url.key = 'url'
                                LEFT JOIN embedding_metadata em_dep_point ON e.id = em_dep_point.id AND em_dep_point.key = 'departure_point'
                                LEFT JOIN embedding_metadata em_dep_date ON e.id = em_dep_date.id AND em_dep_date.key = 'departure_date'
                                LEFT JOIN embedding_metadata em_price ON e.id = em_price.id AND em_price.key = 'price'
                                LEFT JOIN embedding_metadata em_pricing ON e.id = em_pricing.id AND em_pricing.key = 'pricing_policy'
                                LEFT JOIN embedding_metadata em_promo ON e.id = em_promo.id AND em_promo.key = 'promotion_policy'
                                LEFT JOIN embedding_metadata em_cancel ON e.id = em_cancel.id AND em_cancel.key = 'cancellation_policy'
                                WHERE e.segment_id IN (
                                    SELECT id FROM segments WHERE collection = ?
                                )
                                AND em_doc.string_value IS NOT NULL
                            `, [collection.id], (err, rows) => {
                                if (err) {
                                    rejectQuery(err);
                                    return;
                                }
                                resolveQuery(rows || []);
                            });
                        });
                    };

                    resolve({
                        kind: "chroma",
                        db,
                        collection,
                        embeddings,
                        getAllDocs
                    });
                });
            });
        });
    } catch (error) {
        log.error("Failed to load Chroma database:", error.message);
        throw error;
    }
}

async function createOrLoadFaiss(embeddings) {
    const indexDir = path.join(STORE_DIR, `${CONFIG.INDEX_NAME}_faiss`);
    const { FaissStore } = await import(
        "@langchain/community/vectorstores/faiss"
    );

    if (dirHasFiles(indexDir)) {
        const store = await FaissStore.load(indexDir, embeddings);
        log.info("Loaded FAISS index:", indexDir);
        return { kind: "faiss", store };
    }

    const docs = await loadAndSplitDocs();
    const store = await FaissStore.fromDocuments(docs, embeddings);
    await store.save(indexDir);
    log.info("Built FAISS index:", indexDir, "docs:", docs.length);
    return { kind: "faiss", store };
}

async function createOrLoadHnsw(embeddings) {
    const indexDir = path.join(STORE_DIR, `${CONFIG.INDEX_NAME}_hnswlib`);
    const { HNSWLib } = await import(
        "@langchain/community/vectorstores/hnswlib"
    );

    if (dirHasFiles(indexDir)) {
        const store = await HNSWLib.load(indexDir, embeddings);
        log.info("Loaded HNSWLib index:", indexDir);
        return { kind: "hnswlib", store };
    }

    const docs = await loadAndSplitDocs();
    const store = await HNSWLib.fromDocuments(docs, embeddings);
    await store.save(indexDir);
    log.info("Built HNSWLib index:", indexDir, "docs:", docs.length);
    return { kind: "hnswlib", store };
}

function extractAllDocs(store) {
    const ds = store?.docstore;
    const map = ds?._docs || ds?.docs;
    if (!map) return [];
    if (map instanceof Map) return Array.from(map.values());
    if (typeof map === "object") return Object.values(map);
    return [];
}

let repoPromise = null;

export async function getVectorRepo() {
    if (repoPromise) return repoPromise;

    repoPromise = (async () => {
        ensureDirs();
        const embeddings = await getEmbeddings();

        // Check if we have a Chroma database available
        let info;
        try {
            info = await createCustomChromaStore(embeddings);
            log.info("Using Chroma vector database");
        } catch (e) {
            log.warn("Chroma unavailable, falling back to FAISS. Reason:", e.message);
            
            const preferFaiss = (CONFIG.VECTOR_DB || "faiss") === "faiss";
            if (preferFaiss) {
                try {
                    info = await createOrLoadFaiss(embeddings);
                } catch (e) {
                    log.warn(
                        "FAISS unavailable, falling back to HNSWLib. Reason:",
                        e.message
                    );
                }
            }
            if (!info) info = await createOrLoadHnsw(embeddings);
        }

        const { kind } = info;

        if (kind === "chroma") {
            const { db, collection, embeddings, getAllDocs } = info;
            
            return {
                kind,
                async search(query, k) {
                    try {
                        // Generate embedding for the query
                        const queryEmbedding = await embeddings.embedQuery(query);
                        
                        // Get all documents and their embeddings for similarity search
                        const docs = await getAllDocs();
                        const results = [];
                        
                        // For each document, calculate similarity (reduced limit for memory efficiency)
                        for (const doc of docs.slice(0, Math.min(50, docs.length))) { // Limit for performance and memory
                            try {
                                // Create document object with all metadata
                                const document = new Document({
                                    pageContent: doc.document || "",
                                    metadata: {
                                        source: "tours",
                                        chunkId: doc.embedding_id,
                                        url: doc.url || "",
                                        departure_point: doc.departure_point || "",
                                        departure_date: doc.departure_date || "",
                                        price: doc.price || "",
                                        pricing_policy: doc.pricing_policy || "",
                                        promotion_policy: doc.promotion_policy || "",
                                        cancellation_policy: doc.cancellation_policy || ""
                                    }
                                });
                                
                                // Enhanced text-based similarity with policy-aware scoring
                                const queryLower = query.toLowerCase();
                                const contentLower = (doc.document || "").toLowerCase();
                                
                                // Get all text fields for comprehensive search
                                const allText = [
                                    doc.document || "",
                                    doc.pricing_policy || "",
                                    doc.promotion_policy || "",
                                    doc.cancellation_policy || ""
                                ].join(" ").toLowerCase();
                                
                                let score = 0.1; // Base score
                                
                                // Policy-specific scoring with much higher standards
                                if (queryLower.includes("chính sách") || queryLower.includes("policy")) {
                                    // Highest priority: documents that actually contain "chính sách" 
                                    if (allText.includes("chính sách")) {
                                        score += 0.9; // Very high boost for exact phrase match
                                    } else {
                                        // Medium priority: documents with substantial policy content but no "chính sách" phrase
                                        let policyContentScore = 0;
                                        if (doc.pricing_policy && doc.pricing_policy.length > 100) {
                                            policyContentScore += 0.3;
                                        }
                                        if (doc.cancellation_policy && doc.cancellation_policy.length > 100) {
                                            policyContentScore += 0.3;
                                        }
                                        if (doc.promotion_policy && doc.promotion_policy.trim().length > 20) {
                                            policyContentScore += 0.2;
                                        }
                                        score += policyContentScore;
                                    }
                                } else {
                                    // For non-policy queries, check for specific keyword matches
                                    const queryTerms = queryLower.split(/\s+/).filter(term => term.length > 2);
                                    let termMatchScore = 0;
                                    
                                    for (const term of queryTerms) {
                                        if (allText.includes(term)) {
                                            termMatchScore += 0.2;
                                        }
                                    }
                                    score += Math.min(termMatchScore, 0.6); // Cap at 0.6
                                }
                                
                                // Bonus for tour-related keywords
                                if (contentLower.includes("tour") || contentLower.includes("du lịch")) {
                                    score += 0.05;
                                }
                                
                                // Normalize score
                                score = Math.min(score, 1.0);
                                
                                results.push({ doc: document, score });
                            } catch (err) {
                                log.warn("Error processing document:", err.message);
                            }
                        }
                        
                        // Sort by score and return top k
                        return results
                            .sort((a, b) => b.score - a.score)
                            .slice(0, k);
                        
                    } catch (error) {
                        log.error("Error searching Chroma collection:", error.message);
                        return [];
                    }
                },
                listSources() {
                    return [{
                        source: "tours",
                        title: "Tours Database (Chroma)",
                        chunks: "Unknown"
                    }];
                },
            };
        } else if (kind === "embedded_combined" || kind === "embedded_tours") {
            // Handle pre-embedded data (both combined and tours-only)
            return info; // info already contains the correct interface (search, listSources)
        } else {
            // Handle FAISS/HNSWLib as before
            const { store } = info;
            
            return {
                kind,
                async search(query, k) {
                    const results = await store.similaritySearchWithScore(query, k);
                    return results.map(([doc, score]) => ({ doc, score }));
                },
                listSources() {
                    const docs = extractAllDocs(store);
                    const by = new Map();
                    for (const d of docs) {
                        const source =
                            d.metadata?.source || d.metadata?.title || "unknown";
                        const title = d.metadata?.title || source;
                        const cur = by.get(source) || { source, title, chunks: 0 };
                        cur.chunks += 1;
                        by.set(source, cur);
                    }
                    return Array.from(by.values()).sort((a, b) =>
                        a.source.localeCompare(b.source)
                    );
                },
            };
        }
    })();

    return repoPromise;
}
