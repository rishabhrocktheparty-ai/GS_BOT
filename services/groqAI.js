// services/groqAI.js
// Groq API client for REE Bot — GRIH SANSAR

const GROQ_API_KEY = process.env.GROQ_API_KEY;
const GROQ_URL = "https://api.groq.com/openai/v1/chat/completions";
const GROQ_AUDIO_URL = "https://api.groq.com/openai/v1/audio/transcriptions";

/**
 * Call Groq chat completion API
 */
async function chatCompletion(systemPrompt, userMessage, maxTokens = 1024) {
  try {
    const response = await fetch(GROQ_URL, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${GROQ_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "llama-3.1-8b-instant",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userMessage },
        ],
        max_tokens: maxTokens,
        temperature: 0.3,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`🚨 Groq API error (${response.status}):`, errorText);
      return null;
    }

    const data = await response.json();
    const text = data.choices?.[0]?.message?.content;
    console.log("✅ Groq API call succeeded");
    return text || null;

  } catch (error) {
    console.error("🚨 Groq API error:", error.message);
    return null;
  }
}

/**
 * Parse grocery order from text
 */
async function parseGroceryOrder(message) {
  const systemPrompt = `You are REE, a shopping assistant for GRIH SANSAR, an Indian neighbourhood grocery store.
Extract grocery items and quantities from the customer's message.

Understand Hindi grocery terms: atta (wheat flour), dal (lentils), paneer (cottage cheese), haldi (turmeric), besan (gram flour), poha (flattened rice), jeera (cumin), dhaniya (coriander), mirch (chilli), ghee, dahi (curd), chawal (rice).
Handle abbreviations and shorthand. If no quantity specified, assume 1 unit.

Respond ONLY with valid JSON, no markdown, no extra text:
{"items": [{"name": "item", "quantity": "amount with unit"}], "message_understood": true}

If you cannot understand: {"items": [], "message_understood": false}`;

  const text = await chatCompletion(systemPrompt, message);
  if (!text) return null;

  try {
    const clean = text.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();
    return JSON.parse(clean);
  } catch (e) {
    console.error("JSON parse error:", e.message, "Raw:", text);
    return null;
  }
}

/**
 * Transcribe voice message using Groq Whisper
 */
async function transcribeVoice(audioBuffer) {
  try {
    // Groq Whisper uses multipart form data (same as OpenAI)
    const FormData = (await import("form-data")).default;
    const form = new FormData();
    form.append("file", audioBuffer, { filename: "audio.ogg", contentType: "audio/ogg" });
    form.append("model", "whisper-large-v3-turbo");
    form.append("language", "en");

    const response = await fetch(GROQ_AUDIO_URL, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${GROQ_API_KEY}`,
        ...form.getHeaders(),
      },
      body: form,
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`🚨 Groq Whisper error (${response.status}):`, errorText);
      return null;
    }

    const data = await response.json();
    console.log(`🎤 Transcription: "${data.text}"`);
    return { transcription: data.text };

  } catch (error) {
    console.error("🚨 Voice transcription error:", error.message);
    return null;
  }
}

/**
 * Process voice order: transcribe + parse
 */
async function processVoiceOrder(audioBuffer) {
  const transcription = await transcribeVoice(audioBuffer);
  if (!transcription?.transcription) return null;

  const order = await parseGroceryOrder(transcription.transcription);
  if (order) order.transcription = transcription.transcription;
  return order;
}

/**
 * Process image grocery list (text-based fallback since Groq has no vision)
 * Ask the customer to type or voice their list instead
 */
async function processGroceryImage() {
  return {
    fallback: true,
    message:
      "I can see you've sent a photo! 📸 I'm currently better at reading typed or voice messages. Could you type out the items from your list, or send me a voice note? I'll get your basket ready right away!",
  };
}

/**
 * Smart suggestions for complementary items
 */
async function getSmartSuggestions(basketItems) {
  const systemPrompt = `You are REE, a smart shopping assistant for GRIH SANSAR, an Indian grocery store.
Suggest 1-2 complementary items based on the customer's basket.
Think about Indian cooking: bread→butter, rice→dal, tea→biscuits, atta→ghee, tomato→onion+coriander.
Max 2 suggestions. Include price in ₹. Be helpful not pushy.

Respond ONLY with JSON: {"suggestions": [{"item": "name", "reason": "why", "estimated_price": "₹XX"}]}`;

  const text = await chatCompletion(systemPrompt, `Basket: ${JSON.stringify(basketItems)}`);
  if (!text) return { suggestions: [] };

  try {
    const clean = text.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();
    return JSON.parse(clean);
  } catch (e) {
    return { suggestions: [] };
  }
}

/**
 * Quick recipe suggestion
 */
async function getQuickRecipe(context = "") {
  const systemPrompt = `You are REE, a friendly shopping companion for GRIH SANSAR grocery store.
Suggest ONE quick Indian snack recipe (5-10 minutes).
Options: poha, besan chilla, masala toast, bread upma, maggi, egg sandwich, paneer sandwich, masala omelette.
Keep it simple: 4-6 ingredients, 3-5 steps.
Include a warm message promoting home cooking over ordering outside.

Respond ONLY with JSON:
{"recipe_name": "name", "prep_time": "X min", "ingredients": [{"item": "name", "quantity": "amount"}], "steps": ["Step 1", "Step 2"], "home_cooking_message": "friendly message"}`;

  const text = await chatCompletion(systemPrompt, context || "Suggest a quick evening snack");
  if (!text) return null;

  try {
    const clean = text.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();
    return JSON.parse(clean);
  } catch (e) {
    return null;
  }
}

/**
 * Customer reorder analysis
 */
async function analyseReorderTiming(customer) {
  const systemPrompt = `You are REE, a shopping companion for GRIH SANSAR grocery store.
Analyse purchase history. Determine if the customer needs to reorder.
Look for monthly staples (atta, rice, dal, oil) running low.
Generate a warm, natural reminder. Not pushy.

Respond ONLY with JSON:
{"should_remind": true/false, "items_likely_needed": ["item1"], "suggested_message": "warm message", "confidence": "high/medium/low"}`;

  const text = await chatCompletion(
    systemPrompt,
    `Customer: ${customer.name}, Last order: ${customer.lastOrderDate}, History: ${JSON.stringify(customer.orderHistory)}`
  );
  if (!text) return null;

  try {
    const clean = text.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();
    return JSON.parse(clean);
  } catch (e) {
    return null;
  }
}

/**
 * Savings comparison message
 */
async function generateSavingsMessage(basketItems, totalPrice) {
  const systemPrompt = `You are REE, shopping companion for GRIH SANSAR.
Estimate savings vs quick-commerce apps (they charge 15-30% more).
Be realistic, never exaggerate.

Respond ONLY with JSON:
{"estimated_app_price": number, "savings": number, "savings_message": "warm message with relatable comparison"}`;

  const text = await chatCompletion(
    systemPrompt,
    `Items: ${JSON.stringify(basketItems)}, GRIH SANSAR total: ₹${totalPrice}`
  );
  if (!text) return null;

  try {
    const clean = text.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();
    return JSON.parse(clean);
  } catch (e) {
    return null;
  }
}

/**
 * General chat handler
 */
async function handleGeneralChat(message, customerName = "") {
  const systemPrompt = `You are REE, the shopping companion at GRIH SANSAR departmental store.

CRITICAL: Never say "I am an AI" or "I am a chatbot". You are a helpful shopping companion.
Be warm, friendly, slightly witty, helpful. Keep responses to 2-3 sentences.
Use natural English suitable for Indian customers. Light emojis (max 2).
${customerName ? `Customer's name: ${customerName}` : ""}
Guide conversations toward shopping when natural.
Brand tagline: "Think Before You Blink."`;

  return await chatCompletion(systemPrompt, message, 256);
}

/**
 * Verify Groq API works at startup
 */
async function verifyConnection() {
  if (!GROQ_API_KEY) {
    console.error("🚨 GROQ_API_KEY is not set!");
    return false;
  }
  console.log("🔍 GROQ_API_KEY:", GROQ_API_KEY.substring(0, 8) + "...");

  const text = await chatCompletion("Respond with only: OK", "Test");
  if (text) {
    console.log("✅ Groq AI connected:", text.trim());
    return true;
  }
  console.error("🚨 Groq AI verification failed!");
  return false;
}

module.exports = {
  chatCompletion,
  parseGroceryOrder,
  transcribeVoice,
  processVoiceOrder,
  processGroceryImage,
  getSmartSuggestions,
  getQuickRecipe,
  analyseReorderTiming,
  generateSavingsMessage,
  handleGeneralChat,
  verifyConnection,
};
