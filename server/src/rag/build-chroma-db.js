import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { getEmbeddings } from "./embeddings.js";
import { log } from "../util/logger.js";
import { ChromaClient } from "chromadb";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// ========= CONFIG =========
const TOURS_JSON_FILE = "tours.json";
const POLICY_JSON_FILE = "travel_policy.json";
const CHROMA_DIR = path.join(__dirname, "../vector_db/chroma_db");
const COLLECTION_NAME = "combined_data";
// ==========================

async function buildChromaDB() {
    try {
        log.info("Building ChromaDB with Google embeddings for tours and policies...");
        
        // Load tours data
        const toursJsonPath = path.join(__dirname, "../vector_db/tours.json");
        if (!fs.existsSync(toursJsonPath)) {
            throw new Error(`tours.json not found at ${toursJsonPath}`);
        }

        // Load policies data
        const policiesJsonPath = path.join(__dirname, "../vector_db/travel_policy.json");
        if (!fs.existsSync(policiesJsonPath)) {
            throw new Error(`travel_policy.json not found at ${policiesJsonPath}`);
        }

        log.info(`Loading tours data from ${TOURS_JSON_FILE}`);
        const toursData = JSON.parse(fs.readFileSync(toursJsonPath, "utf-8"));
        
        log.info(`Loading policies data from ${POLICY_JSON_FILE}`);
        const policiesData = JSON.parse(fs.readFileSync(policiesJsonPath, "utf-8"))
            .filter(policy => policy.title && policy.title.trim() !== ""); // Filter out empty entries
        
        log.info(`Loaded ${toursData.length} tours and ${policiesData.length} policies`);

        // Initialize embeddings
        const embeddings = await getEmbeddings();

        const embeddedData = [];
        
        // Process tours
        for (let idx = 0; idx < toursData.length; idx++) {
            const tour = toursData[idx];
            
            // Create document text for tours
            const docText = `${tour.tour_name || ''}. ${tour.description || ''}. ${tour.other || ''}`;
            
            // Generate embedding
            const embedding = await embeddings.embedQuery(docText);
            
            embeddedData.push({
                id: tour.url || `tour_id_${idx}`,
                document: docText,
                embedding: embedding,
                metadata: {
                    type: "tour",
                    url: tour.url || "",
                    title: tour.tour_name || `Tour ${idx}`,
                    departure_point: tour.departure_point || "",
                    departure_date: tour.departure_date || "",
                    price: tour.price || "",
                    pricing_policy: tour.pricing_policy || "",
                    promotion_policy: tour.promotion_policy || "",
                    cancellation_policy: tour.cancellation_policy || ""
                }
            });

            if ((idx + 1) % 10 === 0) {
                log.info(`Processed ${idx + 1}/${toursData.length} tours...`);
            }
        }

        // Process policies
        for (let idx = 0; idx < policiesData.length; idx++) {
            const policy = policiesData[idx];
            
            // Create document text for policies
            const docText = `${policy.title || ''}. ${policy.description || ''}`;
            
            // Generate embedding
            const embedding = await embeddings.embedQuery(docText);
            
            embeddedData.push({
                id: policy.url || `policy_id_${idx}`,
                document: docText,
                embedding: embedding,
                metadata: {
                    type: "policy",
                    url: policy.url || "",
                    title: policy.title || `Policy ${idx}`,
                    policy_category: policy.title || "",
                    description: policy.description || ""
                }
            });

            if ((idx + 1) % 5 === 0) {
                log.info(`Processed ${idx + 1}/${policiesData.length} policies...`);
            }
        }

        // Save embedded data to JSON for vectorstore.js to use
        const embeddedDataPath = path.join(__dirname, "../vector_db/embedded_combined.json");
        fs.writeFileSync(embeddedDataPath, JSON.stringify(embeddedData, null, 2));
        
        log.info(`✅ Saved embedded data to: ${embeddedDataPath}`);
        log.info(`Total records processed: ${embeddedData.length} (${toursData.length} tours + ${policiesData.length} policies)`);
        
        return embeddedData;

    } catch (error) {
        log.error("Error building ChromaDB:", error.message);
        throw error;
    }
}

// Export function
export { buildChromaDB };

// Run if called directly
if (import.meta.url === `file://${process.argv[1]}`) {
    buildChromaDB()
        .then(() => {
            log.info("ChromaDB build process completed successfully");
            process.exit(0);
        })
        .catch((error) => {
            log.error("ChromaDB build process failed:", error);
            process.exit(1);
        });
}
