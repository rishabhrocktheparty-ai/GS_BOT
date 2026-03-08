// ═══════════════════════════════════════════════════════════════════
// REE Bot Configuration
// ═══════════════════════════════════════════════════════════════════

module.exports = {
  // ─── WhatsApp Business API ─────────────────────────────────────
  // Get these from Meta Developer Portal → WhatsApp → API Setup
  WHATSAPP_API_VERSION: "v21.0",
  WHATSAPP_PHONE_NUMBER_ID: process.env.WHATSAPP_PHONE_NUMBER_ID || "YOUR_PHONE_NUMBER_ID",
  WHATSAPP_ACCESS_TOKEN: process.env.WHATSAPP_ACCESS_TOKEN || "YOUR_ACCESS_TOKEN",
  WHATSAPP_VERIFY_TOKEN: process.env.WHATSAPP_VERIFY_TOKEN || "ree_grihsansar_2026",
  WHATSAPP_BUSINESS_ID: process.env.WHATSAPP_BUSINESS_ID || "YOUR_BUSINESS_ID",

  // ─── Groq AI (OpenAI-compatible) ────────────────────────────────────────
  // NOTE: Store your API key in a local `.env` file (or your hosting platform's secret store).
  // Never commit real API keys to version control.
  GROQ_API_KEY: process.env.GROQ_API_KEY || "YOUR_GROQ_API_KEY",

  // ─── Database ──────────────────────────────────────────────────
  DB_PATH: process.env.DB_PATH || "./database/ree_store.db",

  // ─── Store Info ────────────────────────────────────────────────
  STORE_NAME: "GRIH SANSAR DEPARTMENTAL STORE",
  STORE_TAGLINE: "Think Before You Blink.",
  STORE_PHONE: process.env.STORE_PHONE || "+91XXXXXXXXXX",
  STORE_ADDRESS: process.env.STORE_ADDRESS || "Your Neighbourhood Store",
  STORE_HOURS: "8:00 AM – 10:00 PM",
  FREE_DELIVERY_THRESHOLD: 500,
  DELIVERY_CHARGE: 30,

  // ─── Business Rules ────────────────────────────────────────────
  MAX_SUGGESTIONS_PER_ORDER: 2,
  MAX_PROACTIVE_MESSAGES_PER_WEEK: 2,
  PAUSE_OUTREACH_AFTER_IGNORES: 2,
  PAUSE_OUTREACH_DAYS: 14,
  SAVINGS_MARKUP_PERCENTAGE: 18, // avg % more expensive on quick-commerce

  // ─── Server ────────────────────────────────────────────────────
  PORT: process.env.PORT || 3000,
  NODE_ENV: process.env.NODE_ENV || "development",
};
