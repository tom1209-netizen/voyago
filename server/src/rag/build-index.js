import { getVectorRepo } from "./vectorstore.js";

(async () => {
    const repo = await getVectorRepo();
    console.log("Index ready (", repo.kind, ")");
})();
