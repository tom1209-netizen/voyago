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

        const preferFaiss = (CONFIG.VECTOR_DB || "faiss") === "faiss";
        let info;

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

        const { kind, store } = info;

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
    })();

    return repoPromise;
}
