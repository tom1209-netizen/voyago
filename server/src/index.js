import express from "express";
import cors from "cors";
import morgan from "morgan";
import path from "path";
import { fileURLToPath } from "url";
import { CONFIG } from "./config.js";
import { getVectorRepo } from "./rag/vectorstore.js"; 
import chatRoute from "./routes/chat.js";
import sourcesRoute from "./routes/sources.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
app.use(cors());
app.use(express.json({ limit: "1mb" }));
app.use(morgan("dev"));

// API routes
app.use("/api/chat", chatRoute);
app.use("/api/sources", sourcesRoute);

// Serve client build in production
app.use(express.static(path.join(__dirname, "../../client/dist")));
app.get("*", (_req, res) => {
    res.sendFile(path.join(__dirname, "../../client/dist/index.html"));
});

// Boot: ensure vector index exists/loaded
await getVectorRepo();

app.listen(CONFIG.PORT, () => {
    console.log(`Server on http://localhost:${CONFIG.PORT}`);
});
