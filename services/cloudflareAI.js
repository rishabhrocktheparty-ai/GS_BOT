// services/cloudflareAI.js
// Cloudflare Workers AI REST API client for REE Bot

const CLOUDFLARE_ACCOUNT_ID = process.env.CLOUDFLARE_ACCOUNT_ID;
const CLOUDFLARE_AI_TOKEN = process.env.CLOUDFLARE_AI_TOKEN;

const BASE_URL = `https://api.cloudflare.com/client/v4/accounts/${CLOUDFLARE_ACCOUNT_ID}/ai/run`;

// Use global fetch if available (Node 18+). Otherwise fall back to node-fetch.
let fetchFn = global.fetch;
if (!fetchFn) {
  try {
    // eslint-disable-next-line global-require
    fetchFn = require("node-fetch");
  } catch (err) {
    // Leave fetchFn undefined; the code will throw if used without a fetch implementation.
  }
}

function isConfigured() {
  return Boolean(
    CLOUDFLARE_ACCOUNT_ID && CLOUDFLARE_ACCOUNT_ID.trim() && !CLOUDFLARE_ACCOUNT_ID.startsWith("YOUR_") &&
      CLOUDFLARE_AI_TOKEN && CLOUDFLARE_AI_TOKEN.trim() && !CLOUDFLARE_AI_TOKEN.startsWith("YOUR_")
  );
}

/**
 * Generic function to call any Cloudflare Workers AI model
 */
async function runModel(modelId, input, retries = 2) {
  if (!isConfigured()) {
    console.warn("⚠️ Cloudflare Workers AI is not configured. Skipping AI call.");
    return null;
  }

  if (!fetchFn) {
    throw new Error(
      "fetch is not available in this environment. Please run on Node 18+ or install node-fetch."
    );
  }

  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      const response = await fetchFn(`${BASE_URL}/${modelId}`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${CLOUDFLARE_AI_TOKEN}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(input),
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Cloudflare AI error (${response.status}): ${errorText}`);
      }

      const data = await response.json();

      if (!data.success) {
        throw new Error(`Cloudflare AI failed: ${JSON.stringify(data.errors)}`);
      }

      console.log(`✅ Cloudflare AI [${modelId}] succeeded (attempt ${attempt})`);
      return data.result;

    } catch (error) {
      console.error(`⚠️ Cloudflare AI attempt ${attempt} failed:`, error.message);

      if (attempt < retries) {
        const delay = attempt * 2000;
        console.log(`⏳ Retrying in ${delay / 1000}s...`);
        await new Promise((resolve) => setTimeout(resolve, delay));
      }
    }
  }

  console.error(`🚨 Cloudflare AI [${modelId}] all attempts failed`);
  return null;
}

// ============================================================
// 1. TEXT GENERATION — Order parsing, suggestions, recipes
// ============================================================

/**
 * Generate text using Llama 3.1 8B
 * @param {string} systemPrompt - System instructions for the model
 * @param {string} userMessage - The user's message
 * @returns {string|null} - Generated text or null on failure
 */
async function generateText(systemPrompt, userMessage) {
  const result = await runModel("@cf/meta/llama-3.1-8b-instruct", {
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user", content: userMessage },
    ],
    max_tokens: 1024,
    temperature: 0.3, // Low temperature for consistent structured output
  });

  if (result && result.response) {
    return result.response;
  }
  return null;
}

// ============================================================
// 2. PARSE GROCERY ORDER — Natural language to structured items
// ============================================================

/**
 * Parse a typed grocery list into structured items
 * @param {string} message - Customer's grocery message
 * @returns {object|null} - Parsed items or null
 */
async function parseGroceryOrder(message) {
  const systemPrompt = `You are REE, a shopping assistant for GRIH SANSAR, an Indian neighbourhood grocery store.
Your job is to extract grocery items and quantities from the customer's message.

IMPORTANT RULES:
- Understand Hindi grocery terms: atta (wheat flour), dal (lentils), paneer (cottage cheese), haldi (turmeric), besan (gram flour), poha (flattened rice), jeera (cumin), dhaniya (coriander), mirch (chilli), hing (asafoetida), ghee, curd/dahi
- Handle common abbreviations and shorthand
- If no quantity is specified, assume 1 unit
- Parse units correctly: kg, g, litre/L, ml, packets, pieces/pcs, dozen

Respond ONLY with valid JSON, no extra text or markdown:
{
  "items": [
    {"name": "item name", "quantity": "amount with unit"}
  ],
  "message_understood": true
}

If you cannot understand the message, respond:
{"items": [], "message_understood": false}`;

  const text = await generateText(systemPrompt, message);

  if (!text) return null;

  try {
    // Clean any markdown code blocks
    const cleanJson = text.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();
    return JSON.parse(cleanJson);
  } catch (e) {
    console.error("Failed to parse grocery order JSON:", e.message);
    console.error("Raw response:", text);
    return null;
  }
}

// ============================================================
// 3. IMAGE GROCERY LIST — OCR from handwritten/printed list
// ============================================================

/**
 * Process an image of a grocery list
 * @param {Buffer} imageBuffer - Raw image data
 * @param {string} mimeType - Image MIME type (image/jpeg, image/png)
 * @returns {object|null} - Extracted items or null
 */
async function processGroceryImage(imageBuffer, mimeType) {
  const base64Image = imageBuffer.toString("base64");

  const result = await runModel("@cf/meta/llama-3.2-11b-vision-instruct", {
    messages: [
      {
        role: "user",
        content: [
          {
            type: "text",
            text: `You are REE, a shopping assistant for GRIH SANSAR, an Indian grocery store.
This is a photo of a handwritten or printed grocery list from a customer.
Read every item carefully and extract grocery items with quantities.
Handle Hindi/Indian grocery terms (atta, dal, paneer, haldi, etc.).
If any item is unclear or hard to read, note it separately.

Respond ONLY with valid JSON, no extra text:
{
  "items": [{"name": "item", "quantity": "amount"}],
  "unclear_items": ["description of unclear items"],
  "confidence": "high/medium/low"
}`,
          },
          {
            type: "image_url",
            image_url: {
              url: `data:${mimeType};base64,${base64Image}`,
            },
          },
        ],
      },
    ],
    max_tokens: 1024,
    temperature: 0.2,
  });

  if (result && result.response) {
    try {
      const cleanJson = result.response.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();
      return JSON.parse(cleanJson);
    } catch (e) {
      console.error("Failed to parse image OCR JSON:", e.message);

      // Fallback: Try with LLaVA model if Llama Vision fails
      return await processGroceryImageFallback(imageBuffer);
    }
  }

  return null;
}

/**
 * Fallback image processing using LLaVA model
 */
async function processGroceryImageFallback(imageBuffer) {
  try {
    // LLaVA uses a different input format — raw image bytes
    const result = await runModel("@cf/llava-hf/llava-1.5-7b-hf", {
      image: Array.from(new Uint8Array(imageBuffer)),
      prompt: "Read this grocery list image. List every item with quantities. Format: item - quantity, one per line.",
      max_tokens: 512,
    });

    if (result && result.description) {
      // Parse the text response into structured items
      const lines = result.description.split("\n").filter((l) => l.trim());
      const items = lines.map((line) => {
        const parts = line.split(/[-–:]/).map((p) => p.trim());
        return {
          name: parts[0] || line.trim(),
          quantity: parts[1] || "1",
        };
      });
      return { items, unclear_items: [], confidence: "medium" };
    }
  } catch (error) {
    console.error("Fallback image processing failed:", error.message);
  }

  return null;
}

// ============================================================
// 4. VOICE MESSAGE — Speech-to-text transcription
// ============================================================

/**
 * Transcribe a voice message to text
 * @param {Buffer} audioBuffer - Raw audio data (OGG/OPUS from WhatsApp)
 * @returns {object|null} - Transcription result or null
 */
async function transcribeVoice(audioBuffer) {
  const base64Audio = audioBuffer.toString("base64");

  const result = await runModel("@cf/openai/whisper-large-v3-turbo", {
    audio: base64Audio,
    task: "transcribe",
    language: "en",
    vad_filter: true,
  });

  if (result && result.text) {
    console.log(`🎤 Transcription: "${result.text}"`);
    return {
      transcription: result.text,
      language: result.detected_language || "en",
      segments: result.segments || [],
    };
  }

  return null;
}

/**
 * Full voice order processing: transcribe + parse into grocery items
 * @param {Buffer} audioBuffer - Raw audio data
 * @returns {object|null} - Parsed grocery order or null
 */
async function processVoiceOrder(audioBuffer) {
  const transcription = await transcribeVoice(audioBuffer);

  if (!transcription || !transcription.transcription) {
    console.error("Voice transcription failed");
    return null;
  }

  const order = await parseGroceryOrder(transcription.transcription);

  if (order) {
    order.transcription = transcription.transcription;
  }

  return order;
}

// ============================================================
// 5. SMART SUGGESTIONS — Complementary item recommendations
// ============================================================

/**
 * Suggest complementary items based on basket contents
 * @param {Array} basketItems - Items currently in the basket
 * @returns {object|null} - Suggestions or null
 */
async function getSmartSuggestions(basketItems) {
  const systemPrompt = `You are REE, a smart shopping assistant for GRIH SANSAR, an Indian neighbourhood grocery store.
Based on the customer's basket, suggest 1-2 complementary items that naturally pair with their order.

Think about Indian cooking patterns and meal combinations:
- Bread → butter, jam, eggs
- Atta (flour) → ghee, oil, paneer
- Rice → dal, pickle, papad
- Tea/Coffee → milk, sugar, biscuits
- Pasta/Noodles → sauce, cheese, vegetables
- Tomatoes → onion, coriander

RULES:
- Maximum 2 suggestions
- Always include estimated price in ₹
- Keep suggestions relevant and helpful, never pushy
- Include a friendly one-liner reason

Respond ONLY with valid JSON:
{
  "suggestions": [
    {"item": "item name", "reason": "why it pairs well", "estimated_price": "₹XX"}
  ]
}`;

  const userMessage = `Customer's basket: ${JSON.stringify(basketItems)}`;
  const text = await generateText(systemPrompt, userMessage);

  if (!text) return { suggestions: [] };

  try {
    const cleanJson = text.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();
    return JSON.parse(cleanJson);
  } catch (e) {
    console.error("Failed to parse suggestions JSON:", e.message);
    return { suggestions: [] };
  }
}

// ============================================================
// 6. RECIPE ENGINE — Quick Indian snack recipes
// ============================================================

/**
 * Generate a quick snack recipe promoting home cooking
 * @param {string} context - Optional context (time of day, season, etc.)
 * @returns {object|null} - Recipe or null
 */
async function getQuickRecipe(context = "") {
  const systemPrompt = `You are REE, a friendly shopping companion for GRIH SANSAR, an Indian grocery store.
Suggest ONE quick Indian snack recipe that takes 5-10 minutes.

Preferred recipes: poha, besan chilla, tomato masala toast, bread upma, maggi, egg sandwich, paneer sandwich, suji halwa, banana shake, masala omelette, aloo paratha (quick version), bread pakora, curd rice.

RULES:
- Recipe must use common Indian pantry ingredients available at a grocery store
- Keep it simple: 4-6 ingredients max, 3-5 steps max
- Include a warm, friendly message promoting home cooking over ordering from outside
- Tone: encouraging, not preachy

Respond ONLY with valid JSON:
{
  "recipe_name": "name",
  "prep_time": "X minutes",
  "ingredients": [{"item": "ingredient", "quantity": "amount"}],
  "steps": ["Step 1", "Step 2", "Step 3"],
  "home_cooking_message": "A friendly one-liner about fresh home cooking"
}`;

  const userMessage = context || "Suggest a quick evening snack recipe.";
  const text = await generateText(systemPrompt, userMessage);

  if (!text) return null;

  try {
    const cleanJson = text.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();
    return JSON.parse(cleanJson);
  } catch (e) {
    console.error("Failed to parse recipe JSON:", e.message);
    return null;
  }
}

// ============================================================
// 7. CUSTOMER MEMORY — Analyse purchase patterns
// ============================================================

/**
 * Analyse customer purchase history and generate a reorder reminder
 * @param {object} customer - Customer profile with order history
 * @returns {object|null} - Reminder message or null
 */
async function analyseReorderTiming(customer) {
  const systemPrompt = `You are REE, a thoughtful shopping companion for GRIH SANSAR grocery store.
Analyse this customer's purchase history and determine if they might need to reorder any items.

Look for:
- Monthly staples (atta, rice, dal, oil) that may be running low
- Regular purchase cycles (weekly milk, monthly cleaning supplies)
- Items purchased consistently but not recently

Generate a warm, natural reminder message. Not pushy — just helpful.

Respond ONLY with valid JSON:
{
  "should_remind": true/false,
  "items_likely_needed": ["item1", "item2"],
  "suggested_message": "A warm reminder message in REE's voice",
  "days_since_last_order": number,
  "confidence": "high/medium/low"
}`;

  const userMessage = `Customer: ${customer.name}
Purchase history: ${JSON.stringify(customer.orderHistory)}
Last order date: ${customer.lastOrderDate}
Today's date: ${new Date().toISOString().split("T")[0]}`;

  const text = await generateText(systemPrompt, userMessage);

  if (!text) return null;

  try {
    const cleanJson = text.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();
    return JSON.parse(cleanJson);
  } catch (e) {
    console.error("Failed to parse reorder analysis JSON:", e.message);
    return null;
  }
}

// ============================================================
// 8. SAVINGS CALCULATOR — Compare with quick-commerce prices
// ============================================================

/**
 * Generate a savings comparison message
 * @param {Array} basketItems - Items with prices
 * @param {number} totalPrice - GRIH SANSAR total
 * @returns {object|null} - Savings message or null
 */
async function generateSavingsMessage(basketItems, totalPrice) {
  const systemPrompt = `You are REE, a shopping companion for GRIH SANSAR grocery store.
Estimate how much the customer saved compared to typical quick-commerce app prices.

Quick-commerce apps typically charge 15-30% more than neighbourhood stores for groceries.
Use realistic estimates — never exaggerate. Be specific but approximate.

Respond ONLY with valid JSON:
{
  "estimated_app_price": number,
  "savings": number,
  "savings_message": "A warm message about their savings, ending with a relatable comparison like 'That's a coffee date saved!' or 'That's your evening chai covered for a week!'"
}`;

  const userMessage = `Basket items: ${JSON.stringify(basketItems)}
GRIH SANSAR total: ₹${totalPrice}`;

  const text = await generateText(systemPrompt, userMessage);

  if (!text) return null;

  try {
    const cleanJson = text.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();
    return JSON.parse(cleanJson);
  } catch (e) {
    console.error("Failed to parse savings JSON:", e.message);
    return null;
  }
}

// ============================================================
// 9. GENERAL CHAT — Handle non-order conversations
// ============================================================

/**
 * Handle general customer messages that aren't orders
 * @param {string} message - Customer's message
 * @param {string} customerName - Customer's name
 * @returns {string|null} - REE's response or null
 */
async function handleGeneralChat(message, customerName = "") {
  const systemPrompt = `You are REE, the shopping companion at GRIH SANSAR departmental store.

CRITICAL RULES:
- You are NOT an AI, chatbot, or automated system. You are a helpful shopping companion.
- Never say "I am an AI" or "I am a chatbot" or "as an AI"
- Be warm, friendly, slightly witty, and helpful
- Keep responses short (2-3 sentences max)
- Guide conversations back to shopping when natural
- Use light emojis sparingly (1-2 per message max)
- Use natural conversational English suitable for Indian customers
- You can use Hindi words naturally (atta, dal, chai, etc.)
${customerName ? `- The customer's name is ${customerName}` : ""}

You help with: grocery ordering, recipes, deals, delivery tracking, and general store queries.
Brand tagline: \"Think Before You Blink.\"`;

  return await generateText(systemPrompt, message);
}

// ============================================================
// 10. STARTUP HEALTH CHECK
// ============================================================

/**
 * Verify Cloudflare Workers AI is accessible
 * @returns {boolean} - Whether the API is working
 */
async function verifyConnection() {
  try {
    if (!isConfigured()) {
      console.error("🚨 Missing CLOUDFLARE_ACCOUNT_ID or CLOUDFLARE_AI_TOKEN in environment variables!");
      return false;
    }

    const result = await runModel("@cf/meta/llama-3.1-8b-instruct", {
      messages: [{ role: "user", content: "Respond with only: OK" }],
      max_tokens: 10,
    });

    if (result && result.response) {
      console.log(`✅ Cloudflare Workers AI connected: "${result.response.trim()}"`);
      return true;
    }

    console.error("🚨 Cloudflare Workers AI returned empty response");
    return false;

  } catch (error) {
    console.error("🚨 Cloudflare Workers AI verification FAILED:", error.message);
    return false;
  }
}


// ============================================================
// EXPORTS
// ============================================================

module.exports = {
  // Core
  generateText,
  runModel,

  // Order Processing
  parseGroceryOrder,
  processGroceryImage,
  processVoiceOrder,
  transcribeVoice,

  // Intelligence
  getSmartSuggestions,
  getQuickRecipe,
  analyseReorderTiming,
  generateSavingsMessage,

  // General
  handleGeneralChat,
  verifyConnection,
};
