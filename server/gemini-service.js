// ═══════════════════════════════════════════════════════════════════
// REE Bot — Gemini AI Service
// Handles: NLP, Image OCR, Audio Transcription, Recipes, Suggestions
// ═══════════════════════════════════════════════════════════════════

const axios = require("axios");
const config = require("../config/config");

const GEMINI_URL = `https://generativelanguage.googleapis.com/v1beta/models/${config.GEMINI_MODEL}:generateContent?key=${config.GEMINI_API_KEY}`;

// ─── System Prompt for REE ───────────────────────────────────────
const SYSTEM_PROMPT = `You are REE — the friendly, warm, and intelligent shopping companion at GRIH SANSAR DEPARTMENTAL STORE. You are NOT an AI, chatbot, or automated system. You are a helpful person from the store who assists customers via WhatsApp.

CRITICAL RULES:
- NEVER say you are an AI, bot, chatbot, virtual assistant, or automated system
- NEVER say "I'm an AI" or "As an AI" or anything similar
- You ARE REE, a shopping companion at GRIH SANSAR
- Be warm, intelligent, polite, slightly witty, helpful, and trustworthy
- Use natural conversational English suitable for Indian customers
- Use light emojis but maintain premium tone (🛒 ✅ 🌟 😊 🌿 💰 📦)
- Never use aggressive selling language
- Always be respectful and never pushy
- End important conversations with: "Think Before You Blink."

BRAND PHILOSOPHY:
- GRIH SANSAR offers better prices than quick commerce apps
- Encourage thoughtful, fresh, home cooking
- "Think Before You Blink" = shop thoughtfully, don't rush to expensive apps
- Show savings compared to quick-commerce (typically 15-25% more expensive)

CAPABILITIES:
1. GROCERY ORDERING: Parse lists, match inventory, build priced baskets
2. SMART SUGGESTIONS: Complementary items (max 2 per order, soft opt-out)
3. RECIPE ENGINE: Quick Indian recipes (poha, besan chilla, masala toast, etc.)
4. BASKET MANAGEMENT: Add, remove, modify items with clear summaries
5. ORDER TRACKING: Friendly delivery updates
6. MONTHLY REMINDERS: Reorder pattern detection
7. FESTIVAL COMBOS: Festive grocery bundles
8. SAVINGS DISPLAY: Compare vs quick-commerce apps
9. IMAGE LISTS: Process handwritten/printed grocery photos
10. VOICE MESSAGES: Process transcribed voice orders

RESPONSE FORMAT:
- Keep responses concise (under 200 words) but warm
- Use bullet points with emojis for basket items
- Always show prices in ₹
- Maximum 2 suggestions per interaction
- Include soft opt-out for suggestions
- For baskets: item — quantity — price, then total
- Free delivery on orders above ₹${config.FREE_DELIVERY_THRESHOLD}

WHEN CUSTOMER GREETS:
Give warm welcome, introduce as REE, show quick options:
🛒 Send grocery list | 🔁 Reorder | 🌟 Deals | 🍳 Recipes | 📦 Track`;


// ═══════════════════════════════════════════════════════════════════
// CORE: Generate Response
// ═══════════════════════════════════════════════════════════════════

async function generateResponse(userMessage, context) {
  const { customerName, orderHistory, conversationHistory, inventory } = context;

  // Build conversation context
  const contextInfo = [];
  if (customerName && customerName !== "Customer") {
    contextInfo.push(`Customer name: ${customerName}`);
  }
  if (orderHistory && orderHistory.length > 0) {
    const lastOrder = orderHistory[0];
    contextInfo.push(`Last order: ${lastOrder.created_at} — Total ₹${lastOrder.total} — Items: ${lastOrder.items}`);
    contextInfo.push(`Total orders: ${orderHistory.length}`);
  }
  if (inventory && inventory.length > 0) {
    const inventorySummary = inventory.slice(0, 100).map(i =>
      `${i.name} (${i.variant}) — ₹${i.price}${i.quick_commerce_price ? ` [QC: ₹${i.quick_commerce_price}]` : ""}`
    ).join("\n");
    contextInfo.push(`STORE INVENTORY:\n${inventorySummary}`);
  }

  const messages = [
    { role: "user", parts: [{ text: SYSTEM_PROMPT }] },
    { role: "model", parts: [{ text: "Understood! I am REE, the friendly shopping companion at GRIH SANSAR. Ready to help! 😊" }] },
  ];

  // Add context
  if (contextInfo.length > 0) {
    messages.push({
      role: "user",
      parts: [{ text: `[CONTEXT]\n${contextInfo.join("\n")}\n[/CONTEXT]` }],
    });
    messages.push({
      role: "model",
      parts: [{ text: "Got it, I have the customer context. Ready for their message." }],
    });
  }

  // Add conversation history
  if (conversationHistory && conversationHistory.length > 0) {
    for (const msg of conversationHistory.slice(-8)) {
      messages.push({
        role: msg.sender === "user" ? "user" : "model",
        parts: [{ text: msg.message }],
      });
    }
  }

  // Add current message
  messages.push({ role: "user", parts: [{ text: userMessage }] });

  try {
    const response = await axios.post(GEMINI_URL, {
      contents: messages,
      generationConfig: {
        temperature: 0.8,
        topP: 0.95,
        topK: 40,
        maxOutputTokens: 1024,
      },
      safetySettings: [
        { category: "HARM_CATEGORY_HARASSMENT", threshold: "BLOCK_NONE" },
        { category: "HARM_CATEGORY_HATE_SPEECH", threshold: "BLOCK_NONE" },
        { category: "HARM_CATEGORY_SEXUALLY_EXPLICIT", threshold: "BLOCK_NONE" },
        { category: "HARM_CATEGORY_DANGEROUS_CONTENT", threshold: "BLOCK_NONE" },
      ],
    });

    return response.data?.candidates?.[0]?.content?.parts?.[0]?.text
      || "I'm having a small hiccup — could you try that again? 😊";
  } catch (error) {
    console.error("❌ Gemini API error:", error.response?.data || error.message);
    return "Oops, a small connection issue on my end. Could you try again? I'm right here! 😊";
  }
}


// ═══════════════════════════════════════════════════════════════════
// IMAGE PROCESSING — Grocery List OCR
// ═══════════════════════════════════════════════════════════════════

async function processImage(base64Data, mimeType) {
  try {
    const response = await axios.post(GEMINI_URL, {
      contents: [{
        role: "user",
        parts: [
          { inlineData: { mimeType, data: base64Data } },
          {
            text: `You are REE from GRIH SANSAR store. A customer sent a photo of their grocery list.

Please:
1. Read ALL items from the image (handwritten or printed)
2. For each item, identify: item name, quantity if mentioned, any brand preference
3. Return a structured list

If any item is unclear or partially readable, mention it.
Format: Return ONLY the extracted items as a simple comma-separated list.
Example: "2 kg atta, 1 L milk, 500g paneer, eggs 12, tomatoes 1 kg"`,
          },
        ],
      }],
      generationConfig: { temperature: 0.3, maxOutputTokens: 512 },
    });

    return response.data?.candidates?.[0]?.content?.parts?.[0]?.text || "Could not read the image clearly";
  } catch (error) {
    console.error("❌ Image processing error:", error.message);
    return "Could not process the image";
  }
}


// ═══════════════════════════════════════════════════════════════════
// AUDIO PROCESSING — Voice Message Transcription
// ═══════════════════════════════════════════════════════════════════

async function processAudio(base64Data, mimeType) {
  try {
    // Use Gemini's multimodal capabilities for audio
    const response = await axios.post(GEMINI_URL, {
      contents: [{
        role: "user",
        parts: [
          { inlineData: { mimeType, data: base64Data } },
          {
            text: `Transcribe this voice message from a grocery store customer. 
They are likely ordering groceries or asking about products.
Return ONLY the transcribed text, nothing else.
If the audio mentions grocery items, quantities, or brands, transcribe them accurately.
Handle Hindi/English mix (Hinglish) naturally.`,
          },
        ],
      }],
      generationConfig: { temperature: 0.2, maxOutputTokens: 256 },
    });

    return response.data?.candidates?.[0]?.content?.parts?.[0]?.text || "Could not understand the voice message";
  } catch (error) {
    console.error("❌ Audio processing error:", error.message);
    return "Could not process the voice message";
  }
}


// ═══════════════════════════════════════════════════════════════════
// SMART SUGGESTIONS
// ═══════════════════════════════════════════════════════════════════

async function generateSuggestion(orderItems, context) {
  try {
    const response = await axios.post(GEMINI_URL, {
      contents: [
        { role: "user", parts: [{ text: SYSTEM_PROMPT }] },
        { role: "model", parts: [{ text: "Ready!" }] },
        {
          role: "user",
          parts: [{
            text: `The customer just ordered: ${orderItems}

Based on retail product affinity (complementary items), suggest 1-2 additional items they might need.
Rules:
- Maximum 2 suggestions
- Must be relevant to what they ordered
- Include price
- Be warm and natural, not salesy
- Always include an opt-out phrase
- Keep it under 60 words

${context.customerName ? `Customer name: ${context.customerName}` : ""}
${context.orderHistory?.length ? `They have ordered ${context.orderHistory.length} times before.` : "First-time customer."}`,
          }],
        },
      ],
      generationConfig: { temperature: 0.8, maxOutputTokens: 200 },
    });

    const suggestion = response.data?.candidates?.[0]?.content?.parts?.[0]?.text;
    return suggestion || null;
  } catch (error) {
    console.error("❌ Suggestion error:", error.message);
    return null;
  }
}


// ═══════════════════════════════════════════════════════════════════
// RECIPE ENGINE
// ═══════════════════════════════════════════════════════════════════

async function generateRecipe(preferences, availableIngredients) {
  try {
    const response = await axios.post(GEMINI_URL, {
      contents: [{
        role: "user",
        parts: [{
          text: `You are REE from GRIH SANSAR store. A customer wants a quick recipe idea.
${preferences ? `Their preference: ${preferences}` : "Suggest a quick Indian snack."}
${availableIngredients ? `Available ingredients: ${availableIngredients}` : ""}

Suggest ONE quick recipe (under 10 minutes) that:
- Uses common Indian kitchen ingredients
- Is easy to make at home
- Promotes fresh home cooking over ordering outside food

Format:
🍳 Recipe name
⏱️ Time
📝 Ingredients (with quantities)
👩‍🍳 Quick steps (3-4 steps max)

Then offer: "Want me to add the ingredients to your basket?"
Keep it under 120 words.
Start with: "Feeling hungry? Instead of ordering outside, try this!"`,
        }],
      }],
      generationConfig: { temperature: 0.9, maxOutputTokens: 400 },
    });

    return response.data?.candidates?.[0]?.content?.parts?.[0]?.text || null;
  } catch (error) {
    console.error("❌ Recipe error:", error.message);
    return null;
  }
}


// ═══════════════════════════════════════════════════════════════════
// MONTHLY REMINDER GENERATOR
// ═══════════════════════════════════════════════════════════════════

async function generateReminder(customer, lastOrder) {
  try {
    const daysSince = Math.floor((Date.now() - new Date(lastOrder.created_at).getTime()) / 86400000);
    let orderItems = "their usual items";
    try {
      const items = JSON.parse(lastOrder.items);
      orderItems = items.map(i => `${i.name} ${i.variant || ""}`).join(", ");
    } catch (e) {}

    const response = await axios.post(GEMINI_URL, {
      contents: [{
        role: "user",
        parts: [{
          text: `You are REE from GRIH SANSAR. Generate a warm, natural pantry reminder.

Customer: ${customer.name}
Days since last order: ${daysSince}
Their usual order cycle: ${customer.avg_order_cycle} days
Last order items: ${orderItems}
Total previous orders: ${customer.total_orders}
Total savings with us: ₹${Math.round(customer.total_savings)}

Generate a friendly reminder (under 100 words) that:
- Greets them by name
- Gently mentions their pantry might be running low
- Lists their usual items
- Shows estimated total
- Makes it easy to reorder (just say "Yes")
- Never sounds pushy or automated`,
        }],
      }],
      generationConfig: { temperature: 0.8, maxOutputTokens: 300 },
    });

    return response.data?.candidates?.[0]?.content?.parts?.[0]?.text
      || `Hi ${customer.name}! 😊 It's been about ${daysSince} days since your last order. Shall I set up your usual basket?`;
  } catch (error) {
    console.error("❌ Reminder error:", error.message);
    return `Hi ${customer.name}! 😊 It's been a while since your last order. Shall I set up your usual basket? Just say "Yes"!`;
  }
}


// ═══════════════════════════════════════════════════════════════════
// ORDER DATA EXTRACTION
// ═══════════════════════════════════════════════════════════════════

function extractOrderData(reeResponse) {
  // Check if the response contains order confirmation indicators
  const confirmIndicators = [
    "order confirmed",
    "order placed",
    "confirmed!",
    "all set",
    "on its way",
    "being packed",
  ];

  const hasConfirmation = confirmIndicators.some(
    (indicator) => reeResponse.toLowerCase().includes(indicator)
  );

  if (!hasConfirmation) return null;

  // Extract total from response
  const totalMatch = reeResponse.match(/(?:total|grand total)[:\s]*₹\s*([\d,]+(?:\.\d+)?)/i);
  if (!totalMatch) return null;

  const total = parseFloat(totalMatch[1].replace(/,/g, ""));

  // Extract individual items
  const items = [];
  const itemPattern = /[•\-]\s*(.+?)\s*[—–-]\s*(?:(\d+)\s*(?:kg|g|L|ml|pcs?|packs?))?\s*[—–-]?\s*₹\s*([\d,]+)/gi;
  let match;

  while ((match = itemPattern.exec(reeResponse)) !== null) {
    items.push({
      name: match[1].trim(),
      quantity: match[2] ? parseInt(match[2]) : 1,
      price: parseFloat(match[3].replace(/,/g, "")),
    });
  }

  if (items.length === 0) return null;

  const subtotal = items.reduce((sum, i) => sum + i.price, 0);
  const deliveryCharge = total >= config.FREE_DELIVERY_THRESHOLD ? 0 : config.DELIVERY_CHARGE;
  const savingsVsQC = Math.round(total * config.SAVINGS_MARKUP_PERCENTAGE / 100);

  return {
    items,
    subtotal,
    deliveryCharge,
    discount: 0,
    total,
    savingsVsQC,
  };
}


module.exports = {
  generateResponse,
  processImage,
  processAudio,
  generateSuggestion,
  generateRecipe,
  generateReminder,
  extractOrderData,
};
