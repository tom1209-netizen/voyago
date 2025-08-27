# Voyago

A minimal, RAG chatbot using Google Gemini for generation and LangChain for retrieval.

## Stack

- Frontend: React (Vite) + Ant Design (light theme), mobile-first.
- Backend: Node.js (Express), LangChain retrieval, Gemini via `@google/generative-ai`.
- Vector DB: ChromaDB (required).
- Embeddings: Google Generative AI embeddings (required).

## Repository Layout

- `client/` — React UI (Vite)
- `server/` — Express API, RAG pipeline, vector index persistence  
  - `src/data/` — your internal `.md`/`.txt` sources  
  - `src/store/` — generated vector indexes (gitignored)  
  - `src/rag/` — embeddings, vectorstore, retriever  
  - `src/llm/` — Gemini wrapper and RAG prompt  
  - `src/routes/` — API routes

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
````

Open:

* Dev: [http://localhost:5173](http://localhost:5173)
* Prod: [http://localhost:8080](http://localhost:8080)

## Environment

Server reads environment from `server/.env` (and `process.env`):

* `PORT`: server port (default `8080`)
* `GEMINI_API_KEY`: **required** for text generation and embeddings
* `GEMINI_MODEL`: default `gemini-1.5-flash`
* `GOOGLE_EMBEDDINGS_MODEL`: default `text-embedding-004`
* `VECTOR_DB`: must be `chroma`
* `INDEX_NAME`: index name/prefix (default `internal_knowledge`)
* `RETRIEVAL_K`: top-k chunks to retrieve (default `4`)
* `MAX_INPUT_CHARS`: input size limit (default `12000`)
* `TEMPERATURE`: generation temperature (default `0.2`)

> **Note:** `GEMINI_API_KEY` is mandatory. Without it, both generation and embedding will fail.

## Data and Indexing

* Place `.md` or `.txt` files in `server/src/data/`.
* On first run, if empty, a `Getting-Started.txt` file is seeded.
* The server builds a vector index and persists it under `server/src/store/`
* To rebuild index:

```bash
npm -w server run reindex
```

## How It Works (RAG Pipeline)

1. **Load and chunk documents**

   * `server/src/rag/vectorstore.js` loads files from `server/src/data/`
   * Splits into \~800-char chunks with 120-char overlap
   * Annotates metadata: `source`, `title`, `chunkIndex`, `chunkCount`, `chunkId`

2. **Embed and persist**

   * Embeddings: Google Generative AI (**required**)
   * Vector store persisted to `server/src/store/` using ChromaDB

3. **Retrieve and generate**

   * User query → similarity search (top-k)
   * Gemini generates a response using only retrieved chunks
   * Responses include inline citations like `[1]`, `[2]`

## API
Base: <http://localhost:8080>


### POST `/api/chat`

**Request:**

```json
{
  "message": "What is indexed here?",
  "options": { "temperature": 0.2, "retrievalK": 4 }
}
```

**Response:**

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

---

### GET `/api/sources`

**Response:**

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

* Multi-conversation chat sidebar (create, switch, rename).
* Citations in assistant messages are clickable; modal shows chunk + metadata.
* Settings page: temperature + retrievalK (persisted in `localStorage`).

## Scripts

### Root

* `dev`: run client and server concurrently
* `build`: build vector index, then client
* `start`: start server (serves built client)
* 
### Server (`npm -w server run <script>`)

* `dev`: start server with `nodemon`
* `start`: start server normally
* `build`: build vector index
* `reindex`: clear store and rebuild index

### Client

* `dev`, `build`, `preview` (standard Vite commands)

## Production

Build once, then run the server:

```bash
npm run build
npm start
```

* Express serves the client build from `client/dist/`.
* Set production env vars + `NODE_ENV=production` on the server.

## Troubleshooting

* **ChromaDB required:**

  * Ensure ChromaDB is properly initialized. No fallback vector DB is supported.

* **Missing `GEMINI_API_KEY`:**

  * Both embedding and generation features will fail without this key.

* **No data indexed:**

  * Ensure files exist under `server/src/data/`, then run:

    ```bash
    npm -w server run reindex
    ```

## Notes

- The index is internal. No upload endpoints are exposed.
- Answers are constrained to retrieved context and cite sources inline.
- Generated vector stores are gitignored by default. To commit a store, adjust `.gitignore` and include a `.gitkeep` if desired.

## Team & Contributions

| Contributor           | Areas               | Highlights / What they did                                                                                                 |
| --------------------- | ------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| @tom1209-netizen      | **Full Stack**      | Implemented chat UI, citations modal, settings page (temperature, retrievalK). Backend for chatting and basic rag pipeline |
| @thuyntt-0526         | **RAG**             | Refine the RAG pipeline to accomondate chromaDB                                                                            |
| @DanLinhHuynh-Niwashi | **PM**              | Make sure our project meet the targetted deadline and write documentation                                                  |
| @ThuDung213           | **Data Crawl**      | Crawl the data from the web                                                                                                |
| @phongviet            | **Data Processing** | Preprocess the data into suitable format                                                                                   |
| @nhatsonle            | **Data Embedding**  | Create indexable embeddings from the cleaned data                                                                          |
