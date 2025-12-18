import { GoogleGenAI, Type } from "@google/genai";
import { DocumentSegment, ModelType } from "../types";

const getSystemInstruction = (minConfidence: number) => `
You are an expert document processing AI. Your job is to analyze scanned delivery packets.
Each packet contains multiple distinct deliveries. A single delivery might span multiple pages.
Your goal is to identify the start and end page of each distinct document.

CRITICAL RULES FOR PAGE ASSIGNMENT:
1. TOTAL COVERAGE: Every single page from the first to the last must be assigned to a document. No page can be skipped.
2. NO ORPHANS: There is no such thing as an "empty" page. All pages belong to a delivery.
3. CONTINUATION: If a page contains no delivery info (header, invoice #), or looks like a list/terms/continuation, IT MUST BE GROUPED with the PREVIOUS delivery. It is the next sheet of the previous document.
4. START TRIGGER: A new segment only begins when a clear, NEW Delivery ID/Invoice #/Order # appears.
5. DOUBLE-CHECK IDENTIFIERS (CRITICAL): carefully double-check Delivery IDs and Invoice Numbers.
   - Use BOTH the provided image and the extracted text layer (if available) to verify numbers.
   - Look for visually similar characters like '6' vs '8', '1' vs 'I' vs 'l', '0' vs 'O'. 
   - If the extracted text layer says "123456" and the image looks like "123458", prioritize the TEXT LAYER if it seems coherent, but flag for review if they heavily conflict.

CONFIDENCE & REVIEW PROTOCOL:
- You must output a confidence score (0.0 to 1.0) for every segment.
- CRITICAL: If your calculated confidence for a segment is lower than ${minConfidence}, you MUST set "needsReview" to true.
- If you are unsure about the Delivery ID, Customer Name, or where a document ends, set "needsReview" to true regardless of the score.
- Provide a short "reviewReason" explaining what is ambiguous.

DATA EXTRACTION RULES:
1. Extract the Delivery ID, Customer Name (Ship To), Customer ID, and Date from the FIRST page of the segment.
2. STRICT OCR RULE: Do not fix spellings. Extract EXACTLY as it appears.
3. If a Customer ID is present (e.g., "#8971"), extract it into the separate field.
4. Return a strictly structured JSON response.
`;

export const analyzeDocumentImages = async (
  data: { images: string[], texts: string[] },
  minConfidence: number = 0.8,
  modelType: ModelType = 'flash'
): Promise<DocumentSegment[]> => {
  if (!process.env.API_KEY) {
    throw new Error("API Key is missing.");
  }

  // Map settings to actual model names
  // Using gemini-3-pro-preview for 'pro' tasks as per guidelines for complex text
  const MODEL_NAME = modelType === 'pro' ? 'gemini-3-pro-preview' : 'gemini-2.5-flash';

  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });

  // Prepare the content parts
  const parts: any[] = [];
  const totalPages = data.images.length;
  
  for (let i = 0; i < totalPages; i++) {
     const pageNum = i + 1;
     
     // 1. Add Text Layer Context (if available)
     // This helps significantly with "6 vs 8" errors if the PDF has a digital origin or embedded OCR
     if (data.texts[i] && data.texts[i].trim().length > 5) {
         parts.push({
             text: `[Page ${pageNum} Embedded Text Layer - Use this for high-accuracy character reading]:\n${data.texts[i]}`
         });
     }

     // 2. Add Visual Context
     // Always needed for layout understanding (where does a document start/end?)
     parts.push({
        text: `[Page ${pageNum} Visual Scan]:`
     });
     parts.push({
      inlineData: {
        mimeType: 'image/png', // Changed to PNG for lossless quality
        data: data.images[i]
      }
    });
  }

  // Add the final prompt
  parts.push({
    text: `Analyze these ${totalPages} pages. Identify the start and end page for each distinct delivery document. 
    CRITICAL: The result must cover pages 1 to ${totalPages} continuously. 
    If a page has no header, append it to the previous document. 
    Flag any ambiguous text or IDs for review.`
  });

  try {
    const response = await ai.models.generateContent({
      model: MODEL_NAME,
      contents: {
          role: 'user',
          parts: parts
      },
      config: {
        systemInstruction: getSystemInstruction(minConfidence),
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            segments: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  startPage: { type: Type.INTEGER, description: "The starting page number (1-based index) of this document." },
                  endPage: { type: Type.INTEGER, description: "The ending page number (1-based index) of this document." },
                  deliveryId: { type: Type.STRING, description: "The unique identifier found on the document (e.g. INV-1001)." },
                  customerName: { type: Type.STRING, description: "Name of the customer. Do not autocorrect spelling." },
                  customerId: { type: Type.STRING, description: "The customer ID number if visible (e.g. #8971)." },
                  deliveryDate: { type: Type.STRING, description: "Date of delivery or invoice (YYYY-MM-DD)." },
                  confidence: { type: Type.NUMBER, description: "Confidence score between 0.0 and 1.0" },
                  needsReview: { type: Type.BOOLEAN, description: "Set to true if text is ambiguous or document boundary is unclear." },
                  reviewReason: { type: Type.STRING, description: "Short explanation of why review is needed." }
                },
                required: ["startPage", "endPage", "deliveryId", "customerName", "deliveryDate", "confidence"]
              }
            }
          }
        }
      }
    });

    if (!response.text) {
      throw new Error("No response text from AI");
    }

    let text = response.text;
    
    // Cleanup: Remove markdown code blocks if present
    if (text.startsWith('```json')) {
        text = text.replace(/^```json\s*/, '').replace(/\s*```$/, '');
    } else if (text.startsWith('```')) {
        text = text.replace(/^```\s*/, '').replace(/\s*```$/, '');
    }

    // Sanitize response: find the first { and last } to robustly extract JSON
    const startIndex = text.indexOf('{');
    const endIndex = text.lastIndexOf('}');
    
    if (startIndex === -1 || endIndex === -1) {
       console.warn("AI returned no JSON structure, assuming 0 documents found.", text);
       return [];
    }

    const jsonStr = text.substring(startIndex, endIndex + 1);
    
    try {
        const parsed = JSON.parse(jsonStr);
        if (!parsed || typeof parsed !== 'object') {
            return [];
        }
        return Array.isArray(parsed.segments) ? parsed.segments : [];
    } catch (parseError) {
        console.warn("Failed to parse JSON response:", parseError);
        return [];
    }

  } catch (e: any) {
    console.error("Gemini Analysis Failed:", e);
    throw new Error(e.message || "AI Analysis Failed");
  }
};