import { Router } from "express";
import { listSources } from "../rag/retriever.js";

const router = Router();

router.get("/", async (_req, res) => {
    try {
        const items = await listSources();
        res.json({ items });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

export default router;
