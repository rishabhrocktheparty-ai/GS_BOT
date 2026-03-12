# 🛒 REE — WhatsApp Shopping Companion

**GRIH SANSAR DEPARTMENTAL STORE**  
*"Think Before You Blink."*

REE is an intelligent WhatsApp shopping companion that helps customers order groceries, get recipe ideas, and shop smarter from their neighbourhood store.

---

## Architecture

```
index.js                    → Express server + entry point
src/
  ai/
    systemPrompt.js         → REE's personality & rules
    chat.js                 → OpenRouter API + chat memory + rate limiting
  whatsapp/
    index.js                → Baileys connection + message handler
    authState.js            → Supabase session persistence
  utils/
    env.js                  → Environment variable validation
    logger.js               → Logging utility
```

## Tech Stack

| Component | Technology |
|-----------|-----------|
| WhatsApp | Baileys (multi-device) |
| AI | OpenRouter → Gemini 2.0 Flash Lite (free tier) |
| Session Storage | Supabase (PostgreSQL) |
| Hosting | Render (free tier) |

## Setup

### 1. Supabase Table
Create this table in your Supabase project:

```sql
CREATE TABLE baileys_session (
  id TEXT PRIMARY KEY,
  data TEXT NOT NULL
);
```

### 2. Environment Variables
Copy `.env.example` to `.env` and fill in your values:

```bash
cp .env.example .env
```

### 3. Install & Run

```bash
npm install
npm start
```

### 4. Scan QR
Open `http://localhost:10000` in your browser and scan the QR code with WhatsApp.

## Deploy to Render

1. Push to GitHub
2. Create a new **Web Service** on Render
3. Set **Build Command**: `npm install`
4. Set **Start Command**: `npm start`
5. Add all environment variables from `.env.example`
6. Deploy!

## Features

- **Text ordering**: Type a grocery list in natural language
- **Photo lists**: Send a photo (graceful fallback if vision not available)
- **Voice notes**: Send voice messages (graceful fallback)
- **Reorder**: Say "Repeat my last order"
- **Smart suggestions**: Complementary items (bread → butter)
- **Recipe ideas**: Quick 5-minute Indian snack recipes
- **Savings messaging**: Shows how much you saved vs delivery apps
- **Admin notifications**: Orders forwarded to owner WhatsApp group
- **Rate limiting**: Prevents spam/abuse
- **Auto-reconnect**: Handles disconnections gracefully

## Admin Commands

| Command | What it does |
|---------|-------------|
| `!getid` | Shows the current chat/group JID |
| `!reset` | Clears conversation history for the user |

---

*"Think Before You Blink."*
