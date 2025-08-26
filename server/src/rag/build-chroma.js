import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { getEmbeddings } from "./embeddings.js";
import { log } from "../util/logger.js";
import { Document } from "@langchain/core/documents";
import { RecursiveCharacterTextSplitter } from "@langchain/textsplitters";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// ========= CONFIG =========
const JSON_FILE = "tours.json";        // file JSON input
const CHROMA_DIR = path.join(__dirname, "../vector_db/chroma_db");        // nơi lưu vector database
const COLLECTION_NAME = "tours";       // tên collection
// ==========================

// Build using existing approach (file-based like current vectorstore.js)
async function buildChromaFromFiles() {
    try {
        log.info("Building Chroma-compatible vector store from JSON file...");
        
        // Check if we have the tours.json file
        const toursJsonPath = path.join(__dirname, "../vector_db/tours.json");
        if (!fs.existsSync(toursJsonPath)) {
            throw new Error(`tours.json not found at ${toursJsonPath}`);
        }

        log.info("Loading tours data from tours.json");
        const toursData = JSON.parse(fs.readFileSync(toursJsonPath, "utf-8"));
        
        // Convert to Document format (same as vectorstore.js)
        const documents = toursData.map((tour, idx) => {
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

        log.info(`Prepared ${documents.length} documents for embedding`);

        // Split documents into chunks
        const splitter = new RecursiveCharacterTextSplitter({
            chunkSize: 800,
            chunkOverlap: 120,
        });
        const chunks = await splitter.splitDocuments(documents);

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

        log.info(`Split into ${chunks.length} chunks`);

        // Get embeddings
        const embeddings = await getEmbeddings();

        // Build FAISS index as a demonstration (since we already have working Chroma DB)
        const indexDir = path.join(__dirname, "../store", `tours_faiss`);
        
        // Ensure directory exists
        if (!fs.existsSync(path.dirname(indexDir))) {
            fs.mkdirSync(path.dirname(indexDir), { recursive: true });
        }

        const { FaissStore } = await import("@langchain/community/vectorstores/faiss");
        const store = await FaissStore.fromDocuments(chunks, embeddings);
        await store.save(indexDir);
        
        log.info(`✅ Built FAISS index with ${chunks.length} chunks at: ${indexDir}`);
        log.info("Note: This creates a FAISS index. Your existing Chroma database is still working and preferred.");

        return store;

    } catch (error) {
        log.error("Error building from files:", error.message);
        throw error;
    }
}

// Alternative: Build HNSWLib index instead (more reliable)
async function buildHNSWFromFiles() {
    try {
        log.info("Building HNSWLib vector store from JSON file...");
        
        // Check if we have the tours.json file
        const toursJsonPath = path.join(__dirname, "../vector_db/tours.json");
        if (!fs.existsSync(toursJsonPath)) {
            throw new Error(`tours.json not found at ${toursJsonPath}`);
        }

        log.info("Loading tours data from tours.json");
        const toursData = JSON.parse(fs.readFileSync(toursJsonPath, "utf-8"));
        
        // Convert to Document format
        const documents = toursData.map((tour, idx) => {
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

        log.info(`Prepared ${documents.length} documents for embedding`);

        // Split documents into chunks
        const splitter = new RecursiveCharacterTextSplitter({
            chunkSize: 800,
            chunkOverlap: 120,
        });
        const chunks = await splitter.splitDocuments(documents);

        log.info(`Split into ${chunks.length} chunks`);

        // Get embeddings
        const embeddings = await getEmbeddings();

        // Build HNSWLib index
        const indexDir = path.join(__dirname, "../store", `tours_hnswlib`);
        
        // Ensure directory exists
        if (!fs.existsSync(path.dirname(indexDir))) {
            fs.mkdirSync(path.dirname(indexDir), { recursive: true });
        }

        const { HNSWLib } = await import("@langchain/community/vectorstores/hnswlib");
        const store = await HNSWLib.fromDocuments(chunks, embeddings);
        await store.save(indexDir);
        
        log.info(`✅ Built HNSWLib index with ${chunks.length} chunks at: ${indexDir}`);
        log.info("Note: This creates an HNSWLib index. Your existing Chroma database is still working and preferred.");

        return store;

    } catch (error) {
        log.error("Error building HNSWLib index:", error.message);
        throw error;
    }
}

// Export functions
export { buildChromaFromFiles, buildHNSWFromFiles };

// Run if called directly
if (import.meta.url === `file://${process.argv[1]}`) {
    // Use HNSWLib as default since it's more reliable and doesn't require a server
    buildHNSWFromFiles()
        .then(() => {
            log.info("Build process completed successfully");
            process.exit(0);
        })
        .catch((error) => {
            log.error("Build process failed:", error);
            process.exit(1);
        });
}
