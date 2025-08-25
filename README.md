# Voyage

A minimal, RAG chatbot using Google Gemini for generation and LangChain for retrieval.

## Stack

- Frontend: React (Vite) + Ant Design (light theme), mobile-first.
- Backend: Node.js (Express), LangChain retrieval, Gemini via `@google/generative-ai`.
- Vector DB: FAISS (preferred) with HNSWLib fallback.
- Embeddings: Google Generative AI embeddings (primary) with local `Xenova/bge-small-en-v1.5` fallback (no network).

## Repository Layout

- client/ — React UI (Vite)
- server/ — Express API, RAG pipeline, vector index persistence
  - src/data/ — your internal `.md`/`.txt` sources
  - src/store/ — generated vector indexes (gitignored)
  - src/rag/ — embeddings, vectorstore, retriever
  - src/llm/ — Gemini wrapper and RAG prompt
  - src/routes/ — API routes

## Requirements

- Node.js 18+ (recommended LTS)
- npm 9+ (or compatible)

## Quick Start

```bash
# 1) Install deps (monorepo)
npm i

# 2) Dev (client at 5173, server at 8080)
npm run dev

# 3) Prod build (builds server index then client)
npm run build
npm start
```

Open:

- Dev: <http://localhost:5173>
- Prod: <http://localhost:8080>

## Environment

Server reads environment from server/.env (and process env):

- PORT: server port (default 8080)
- GEMINI_API_KEY: required for text generation and Google embeddings
- GEMINI_MODEL: default gemini-1.5-flash
- GOOGLE_EMBEDDINGS_MODEL: default text-embedding-004
- VECTOR_DB: faiss (default) | hnswlib
- INDEX_NAME: index name/prefix (default internal_knowledge)
- RETRIEVAL_K: top-k chunks to retrieve (default 4)
- MAX_INPUT_CHARS: input size limit (default 12000)
- TEMPERATURE: generation temperature (default 0.2)

Notes:

- Do not commit secrets. `.gitignore` excludes env files by default.
- When `GEMINI_API_KEY` is missing, the server falls back to local BGE-small embeddings (no network). Generation still requires a key.

## Data and Indexing

- Place `.md` or `.txt` files in server/src/data/.
- On first run, if empty, a Getting-Started file is seeded.
- The server builds a vector index and persists it under server/src/store/:
    - FAISS path: server/src/store/<INDEX_NAME>\_faiss/
    - HNSWLib path: server/src/store/<INDEX_NAME>\_hnswlib/
- Rebuild index:
    ```bash
    npm -w server run reindex
    ```

Vector DB backends:

- FAISS (default): tries to load existing index, else builds and saves.
- HNSWLib (fallback): used automatically if FAISS fails/absent.

## How It Works (RAG Pipeline)

1. Load and chunk documents

- server/src/rag/vectorstore.js loads files from server/src/data/
- Splits into ~800-char chunks with 120-char overlap
- Annotates metadata: source, title, chunkIndex, chunkCount, chunkId

2. Embed and persist

- Embeddings: Google Generative AI (primary) or Xenova BGE-small fallback
- Vector store persisted to server/src/store/

3. Retrieve and generate

- Query -> similarity search (top-k)
- Gemini prompted to answer using only retrieved chunks, with inline citations like [1], [2]

## API

Base: http://localhost:8080

- POST /api/chat
    Request:

    ```json
    {
        "message": "What is indexed here?",
        "options": { "temperature": 0.2, "retrievalK": 4 }
    }
    ```

    Response:

    ```json
    {
        "reply": "This is your internal knowledge base... [1]",
        "sources": [
            {
                "text": "chunk content...",
                "source": "Getting-Started.txt",
                "title": "Getting-Started.txt",
                "score": 0.12,
                "chunkIndex": 0,
                "chunkCount": 1,
                "chunkId": "Getting-Started.txt::0"
            }
        ]
    }
    ```

- GET /api/sources
    Response:
    ```json
    {
        "items": [
            {
                "source": "Getting-Started.txt",
                "title": "Getting-Started.txt",
                "chunks": 1
            }
        ]
    }
    ```

## Client UX

- Chat with multi-conversation sidebar (create, switch, rename).
- Citations in assistant messages are clickable; a modal shows the chunk and metadata.
- Settings page controls temperature and retrievalK (stored in localStorage).

## Scripts

Root:

- dev: run client and server concurrently
- build: build server index, then client
- start: start server (serves client build)

Server (npm -w server run <script>):

- dev: nodemon src/index.js
- start: node src/index.js
- build: build vector index only
- reindex: clear store and rebuild

Client:

- dev, build, preview (standard Vite)

## Production

- Build once, then run server:
    ```bash
    npm run build
    npm start
    ```
- Express serves the built client from client/dist/.
- Set production env vars and NODE_ENV=production on the server.

## Troubleshooting

- FAISS unavailable:
  - The server logs a warning and falls back to HNSWLib automatically.
- Missing GEMINI_API_KEY:
  - Embeddings fall back to local BGE-small; generation endpoints return an error until a key is provided.
- No data indexed:
  - Ensure files exist under server/src/data/ and re-run `npm -w server run reindex`.

## Notes

- The index is internal. No upload endpoints are exposed.
- Answers are constrained to retrieved context and cite sources inline.
- Generated vector stores are gitignored by default. To commit a store, adjust `.gitignore` and include a `.gitkeep` if desired.
