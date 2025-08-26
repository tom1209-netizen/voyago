import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function extractToursFromChroma() {
    try {
        const sqlite3 = await import("sqlite3");
        const { Database } = sqlite3.default;
        
        const dbPath = path.join(__dirname, "../vector_db/chroma_db/chroma.sqlite3");
        const outputPath = path.join(__dirname, "../vector_db/tours.json");
        
        console.log("Connecting to Chroma database...");
        
        return new Promise((resolve, reject) => {
            const db = new Database(dbPath, sqlite3.default.OPEN_READONLY, (err) => {
                if (err) {
                    reject(new Error(`Failed to open database: ${err.message}`));
                    return;
                }

                // Get collection ID for tours
                db.get("SELECT id FROM collections WHERE name = 'tours'", [], (err, collection) => {
                    if (err) {
                        reject(new Error(`Failed to get collection: ${err.message}`));
                        return;
                    }

                    if (!collection) {
                        reject(new Error("Tours collection not found"));
                        return;
                    }

                    console.log("Found tours collection:", collection.id);

                    // Extract all tour data
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
                            reject(new Error(`Failed to query data: ${err.message}`));
                            return;
                        }

                        console.log(`Found ${rows.length} tour records`);

                        // Transform data to match the expected format
                        const tours = rows.map((row, idx) => {
                            // Extract tour name from document (usually the first part before the first period)
                            let tourName = "";
                            let description = row.document || "";
                            
                            if (description) {
                                const parts = description.split('. ');
                                if (parts.length > 0) {
                                    tourName = parts[0];
                                    description = parts.slice(1).join('. ');
                                }
                            }

                            return {
                                tour_name: tourName,
                                description: description,
                                other: "", // Could be used for additional info
                                url: row.url || "",
                                departure_point: row.departure_point || "",
                                departure_date: row.departure_date || "",
                                price: row.price || "",
                                pricing_policy: row.pricing_policy || "",
                                promotion_policy: row.promotion_policy || "",
                                cancellation_policy: row.cancellation_policy || ""
                            };
                        });

                        // Write to JSON file
                        fs.writeFileSync(outputPath, JSON.stringify(tours, null, 2), 'utf-8');
                        console.log(`✅ Extracted ${tours.length} tours to ${outputPath}`);

                        db.close();
                        resolve(tours);
                    });
                });
            });
        });

    } catch (error) {
        console.error("Error extracting tours:", error.message);
        throw error;
    }
}

// Run if called directly
if (import.meta.url === `file://${process.argv[1]}`) {
    extractToursFromChroma()
        .then((tours) => {
            console.log("Extraction completed successfully");
            console.log(`Sample tour:`, tours[0]);
        })
        .catch((error) => {
            console.error("Extraction failed:", error);
            process.exit(1);
        });
}

export { extractToursFromChroma };
