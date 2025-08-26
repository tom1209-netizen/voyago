import { GoogleGenerativeAI } from "@google/generative-ai";
import { CONFIG } from "../config.js";
import { log } from "../util/logger.js";

let modelInstance = null;

export function getGeminiModel() {
    if (!CONFIG.GEMINI_API_KEY) return null;
    if (modelInstance) return modelInstance;
    const genAI = new GoogleGenerativeAI(CONFIG.GEMINI_API_KEY);
    modelInstance = genAI.getGenerativeModel({ model: CONFIG.GEMINI_MODEL });
    log.info("Gemini model:", CONFIG.GEMINI_MODEL);
    return modelInstance;
}

export async function generateWithContext({
    query,
    contexts,
    temperature = CONFIG.TEMPERATURE,
}) {
    const model = getGeminiModel();
    if (!model) {
        return {
            error: "GEMINI_API_KEY missing. Please set it in the server environment.",
            text: null,
        };
    }

    const tourPrompt = `Tôi là chuyên gia tư vấn du lịch Saigontourist. Dưới đây là thông tin về các tour có sẵn:

${contexts.map((source, index) => 
  `TOUR ${index + 1}: ${source.title}
${source.text}
Nguồn: ${source.source}
---
`).join('')}

Câu hỏi khách hàng: "${query}"

PHÂN TÍCH VÀ TRẢ LỜI:
- Hãy xem xét kỹ các tour ở trên
- Tìm tour phù hợp với yêu cầu "${query}"
- Nếu có tour phù hợp, hãy giới thiệu chi tiết:
  * Tên tour
  * Thời gian (số ngày)
  * Lịch trình chi tiết theo ngày
  * Điểm tham quan nổi bật
  * Link đặt tour
- Viết bằng tiếng Việt, thân thiện và chuyên nghiệp

LƯU Ý: "Sa Pa" và "Sapa" là cùng một địa điểm. "3 ngày" có nghĩa là tour 3N2D.`;

    const contextBlocks = contexts
        .map((c, i) => `[[${i + 1}]] Source: ${c.title}\nContent:\n${c.text}`)
        .join("\n\n---\n\n");

    const result = await model.generateContent(tourPrompt);

    const text = result.response.text();
    return { text };
}
