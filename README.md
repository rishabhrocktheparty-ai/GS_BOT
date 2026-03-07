# REE — WhatsApp Shopping Companion
## GRIH SANSAR DEPARTMENTAL STORE
### *"Think Before You Blink"*

---

## Complete System Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                        CUSTOMER                                  │
│              WhatsApp (Text / Voice / Photo)                     │
└───────────────────────┬─────────────────────────────────────────┘
                        │
                        ▼
┌─────────────────────────────────────────────────────────────────┐
│                 WhatsApp Business API                            │
│           (Meta Cloud API / BSP Webhook)                         │
│    GET /webhook  →  Verification                                 │
│    POST /webhook →  Incoming Messages                            │
└───────────────────────┬─────────────────────────────────────────┘
                        │
                        ▼
┌─────────────────────────────────────────────────────────────────┐
│                   REE MIDDLEWARE (Node.js + Express)              │
│                                                                   │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────────────┐   │
│  │  Intent       │  │  Message     │  │  Order Management    │   │
│  │  Detection    │  │  Router      │  │  System              │   │
│  └──────┬───────┘  └──────┬───────┘  └──────────┬───────────┘   │
│         │                  │                      │               │
│         ▼                  ▼                      ▼               │
│  ┌──────────────────────────────────────────────────────────┐    │
│  │              GEMINI AI ENGINE                             │    │
│  │  • Text NLP (grocery list parsing)                        │    │
│  │  • Image OCR (handwritten list recognition)               │    │
│  │  • Audio STT (voice message transcription)                │    │
│  │  • Smart Suggestions (product affinity)                   │    │
│  │  • Recipe Generation                                      │    │
│  │  • Reminder Generation                                    │    │
│  └──────────────────────────────────────────────────────────┘    │
│                                                                   │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────────────┐   │
│  │  Customer    │  │  Inventory   │  │  Scheduler           │   │
│  │  Memory      │  │  Manager     │  │  (Cron Jobs)         │   │
│  │  Engine      │  │  + Excel     │  │  • Reminders         │   │
│  │              │  │  Upload      │  │  • Stock Alerts       │   │
│  └──────┬───────┘  └──────┬───────┘  │  • Savings Reports   │   │
│         │                  │          └──────────────────────┘   │
│         ▼                  ▼                                     │
│  ┌──────────────────────────────────────────────────────────┐    │
│  │              SQLite DATABASE                              │    │
│  │  • customers    • orders       • order_items              │    │
│  │  • inventory    • conversations • product_affinities      │    │
│  │  • festival_combos  • reminders_log                       │    │
│  └──────────────────────────────────────────────────────────┘    │
└─────────────────────────────────────────────────────────────────┘
```

---

## Project Files

```
ree-bot/
├── app.js                          # Main Express server
├── package.json                    # Dependencies
├── .env.example                    # Environment variables template
│
├── config/
│   └── config.js                   # All configuration
│
├── database/
│   └── db.js                       # SQLite schema + all queries
│
├── server/
│   ├── gemini-service.js           # Gemini AI (NLP, Vision, Audio, Recipes)
│   └── scheduler.js                # Cron jobs (reminders, alerts)
│
├── whatsapp/
│   └── whatsapp-service.js         # WhatsApp Business API integration
│
└── templates/
    └── inventory_template.xlsx     # Excel upload template
```

---

## Setup Instructions

### 1. Install Dependencies

```bash
cd ree-bot
npm install
```

### 2. Configure Environment

```bash
cp .env.example .env
# Edit .env with your credentials
```

### 3. WhatsApp Business API Setup

1. Go to [Meta Developer Portal](https://developers.facebook.com)
2. Create a new App → Select "Business" type
3. Add WhatsApp product to your app
4. In WhatsApp → API Setup:
   - Get your **Phone Number ID**
   - Generate a **Permanent Access Token**
   - Set your **Webhook URL**: `https://yourdomain.com/webhook`
   - Set **Verify Token**: `ree_grihsansar_2026`
   - Subscribe to: `messages`, `message_deliveries`, `message_reads`

5. Add these to your `.env`:
```
WHATSAPP_PHONE_NUMBER_ID=your_id
WHATSAPP_ACCESS_TOKEN=your_token
WHATSAPP_VERIFY_TOKEN=ree_grihsansar_2026
```

### 4. Gemini API Setup

1. Go to [Google AI Studio](https://aistudio.google.com)
2. Create an API key
3. Add to `.env`:
```
GEMINI_API_KEY=your_key
```

### 5. Start Server

```bash
# Development
npm run dev

# Production
npm start
```

### 6. Deploy (Recommended: Railway / Render / DigitalOcean)

```bash
# Using Railway
railway login
railway init
railway up

# Using Render: Connect GitHub repo, set environment variables
```

---

## API Endpoints

### WhatsApp Webhook
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/webhook` | Meta webhook verification |
| POST | `/webhook` | Incoming WhatsApp messages |

### Customer Management
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/customers` | List all customers |
| GET | `/api/customers/:phone` | Customer details + stats |

### Order Management
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/orders` | List orders (filter by status) |
| GET | `/api/orders/:id` | Order details |
| PATCH | `/api/orders/:id/status` | Update order status |

### Inventory Management
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/inventory` | List inventory |
| POST | `/api/inventory` | Add single item |
| PUT | `/api/inventory/:id` | Update item |
| DELETE | `/api/inventory/:id` | Soft-delete item |
| POST | `/api/inventory/upload` | **Upload Excel/CSV** |
| GET | `/api/inventory/template` | **Download Excel template** |

### Proactive Messaging
| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/reminders/check` | Trigger pantry reminders |
| POST | `/api/broadcast/festival` | Send festival broadcast |

### Analytics
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/analytics/dashboard` | Dashboard stats |
| GET | `/api/analytics/savings` | Total savings data |

### Chat API (Web Frontend)
| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/chat` | Send message to REE |
| POST | `/api/chat/image` | Send image for OCR |

---

## Excel Inventory Upload

### Template Format

| Column | Required | Description |
|--------|----------|-------------|
| name | ✅ Yes | Product name |
| category | No | staples, dairy, spices, snacks, beverages, cleaning, fresh_produce, personal_care |
| variant | No | Size/weight (e.g., "5 kg", "1 L") |
| price | ✅ Yes | Store selling price (₹) |
| mrp | No | Maximum retail price |
| stock | No | Available quantity (default: 100) |
| unit | No | kg, g, L, ml, pcs |
| brand | No | Brand name |
| barcode | No | EAN/SKU code |
| quick_commerce_price | No | Competitor price for savings display |

### Upload via API
```bash
curl -X POST https://yourdomain.com/api/inventory/upload \
  -F "file=@inventory.xlsx"
```

### Download Template
```bash
curl -o template.xlsx https://yourdomain.com/api/inventory/template
```

### Flexible Column Mapping
The system accepts alternative column names:
- `item_name`, `product_name`, `product` → maps to `name`
- `cost`, `rate` → maps to `price`
- `qty`, `available` → maps to `stock`
- `sku`, `ean` → maps to `barcode`
- `competitor_price`, `online_price` → maps to `quick_commerce_price`

---

## Database Schema

### Tables

**customers** — Customer profiles, preferences, order cycles
**orders** — Order records with totals and savings
**order_items** — Individual line items per order
**inventory** — Product catalog with pricing
**conversations** — Full chat history
**product_affinities** — Complementary item pairs (pre-seeded)
**festival_combos** — Festival bundle offers
**reminders_log** — Outbound reminder tracking

---

## Automated Tasks (Cron Jobs)

| Schedule | Task | Description |
|----------|------|-------------|
| Daily 10 AM | Pantry Reminders | Checks order cycles, sends reorder nudges |
| Sunday 11 AM | Savings Report | Weekly savings summary to regulars |
| Daily 8 AM | Stock Alert | Low-stock items alert to admin |

---

## Message Flow

```
Customer sends "I need atta 5kg, milk, and eggs"
        │
        ▼
WhatsApp Business API → POST /webhook
        │
        ▼
Intent Detection: ORDER
        │
        ▼
Gemini AI parses list → matches inventory
        │
        ▼
REE responds with priced basket:
  🛒 Your Basket:
  • Aashirvaad Atta 5 kg — ₹375
  • Amul Toned Milk 1 L — ₹62
  • Farm Eggs 12 pcs — ₹84
  💰 Total: ₹521 | 🚚 Free Delivery
        │
        ▼
Smart Suggestion (max 2):
  "Since you're getting atta, want Amul Ghee (₹580)?"
        │
        ▼
Customer confirms → Order saved to DB
        │
        ▼
Savings Display:
  "You saved ₹110 vs quick-commerce apps!"
```

---

*GRIH SANSAR DEPARTMENTAL STORE*
*Powered by REE — Your Shopping Companion*
*"Think Before You Blink."*
