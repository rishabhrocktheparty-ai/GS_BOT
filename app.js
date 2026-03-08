// ═══════════════════════════════════════════════════════════════════
// REE WhatsApp Shopping Companion — Complete Backend Server
// GRIH SANSAR DEPARTMENTAL STORE
// "Think Before You Blink"
// ═══════════════════════════════════════════════════════════════════

// Load environment variables from .env (local development only).
// This lets you keep secrets like API keys out of source control.
require("dotenv").config();

const express = require("express");
const multer = require("multer");
const cors = require("cors");
const path = require("path");
const fs = require("fs");
const XLSX = require("xlsx");
const axios = require("axios");
const crypto = require("crypto");

// ─── Database ────────────────────────────────────────────────────
const db = require("./database/db");

// ─── Config ──────────────────────────────────────────────────────
const config = require("./config/config");

// ─── WhatsApp Service ────────────────────────────────────────────
const whatsapp = require("./whatsapp/whatsapp-service");

// ─── Cloudflare Workers AI Service ────────────────────────────
const cloudflareAI = require("./services/cloudflareAI");

const app = express();
const PORT = process.env.PORT || 8080;
const HOST = "0.0.0.0";

// ─── Global error handling (prevents process exit on unhandled errors) ──
process.on("unhandledRejection", (err) => {
  console.error("Unhandled Rejection:", err);
});
process.on("uncaughtException", (err) => {
  console.error("Uncaught Exception:", err);
});

// ─── Sanity checks for required environment variables ───────────────
function warnIfMissingEnv(name, value) {
  if (!value || typeof value !== "string" || value.trim() === "" || value.startsWith("YOUR_")) {
    console.warn(`⚠️ Missing or placeholder env var: ${name}. Set it in Railway environment settings.`);
  }
}

warnIfMissingEnv("CLOUDFLARE_ACCOUNT_ID", config.CLOUDFLARE_ACCOUNT_ID);
warnIfMissingEnv("CLOUDFLARE_AI_TOKEN", config.CLOUDFLARE_AI_TOKEN);
warnIfMissingEnv("WHATSAPP_ACCESS_TOKEN", config.WHATSAPP_ACCESS_TOKEN);
warnIfMissingEnv("WHATSAPP_PHONE_NUMBER_ID", config.WHATSAPP_PHONE_NUMBER_ID);
warnIfMissingEnv("WHATSAPP_VERIFY_TOKEN", config.WHATSAPP_VERIFY_TOKEN);

// ─── Middleware ──────────────────────────────────────────────────
app.use(cors());
app.use(express.json({ limit: "50mb" }));
app.use(express.urlencoded({ extended: true, limit: "50mb" }));
app.use(express.static("public"));

// ─── File Upload Config ──────────────────────────────────────────
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const dir = path.join(__dirname, "uploads");
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    cb(null, dir);
  },
  filename: (req, file, cb) => {
    cb(null, `${Date.now()}-${file.originalname}`);
  },
});
const upload = multer({
  storage,
  fileFilter: (req, file, cb) => {
    const allowed = [
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "application/vnd.ms-excel",
      "text/csv",
      "image/jpeg",
      "image/png",
      "image/webp",
      "audio/ogg",
      "audio/mpeg",
      "audio/wav",
    ];
    if (allowed.includes(file.mimetype)) cb(null, true);
    else cb(new Error("File type not supported"), false);
  },
  limits: { fileSize: 20 * 1024 * 1024 }, // 20MB
});

// ─── Helpers — Build order data + basket summaries ───────────────────

function parseQuantity(quantity) {
  if (!quantity) return 1;
  const match = String(quantity).match(/([0-9]*\.?[0-9]+)/);
  if (!match) return 1;
  const value = parseFloat(match[1]);
  return Number.isFinite(value) && value > 0 ? value : 1;
}

function buildOrderData(parsedItems) {
  const items = [];
  let subtotal = 0;

  for (const rawItem of parsedItems) {
    const qty = parseQuantity(rawItem.quantity);
    const inventoryItem = db.findInventoryByName(rawItem.name);
    const name = inventoryItem?.name || rawItem.name;
    const variant = inventoryItem?.variant || "";
    const price = inventoryItem?.price || 0;
    const lineTotal = Math.round(price * qty);

    items.push({
      name,
      variant,
      quantity: qty,
      price,
      lineTotal,
    });

    subtotal += lineTotal;
  }

  const deliveryCharge = subtotal >= config.FREE_DELIVERY_THRESHOLD ? 0 : config.DELIVERY_CHARGE;
  const total = Math.round(subtotal + deliveryCharge);
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

function formatBasketSummary(orderData) {
  const lines = orderData.items.map((item) => {
    return `• ${item.name} — ${item.quantity}${item.variant ? ` ${item.variant}` : ""} — ₹${item.lineTotal}`;
  });

  const deliveryLine = orderData.deliveryCharge === 0
    ? "🚚 Free delivery!"
    : `🚚 Delivery: ₹${orderData.deliveryCharge}`;

  return `🛒 Your Basket:\n${lines.join("\n")}\n\n💰 Subtotal: ₹${orderData.subtotal}\n${deliveryLine}\n\n💳 Total: ₹${orderData.total}`;
}

// ═══════════════════════════════════════════════════════════════════
// WHATSAPP WEBHOOK ENDPOINTS
// ═══════════════════════════════════════════════════════════════════

// Root / health check (Railway expects a 200 response on / by default)
app.get("/", (req, res) => {
  res.status(200).json({
    status: "alive",
    service: "REE WhatsApp Bot",
    timestamp: new Date().toISOString(),
  });
});

// Health check endpoint (explicit)
app.get("/health", (req, res) => {
  res.status(200).send("OK");
});

// Webhook Verification (GET) — Required by Meta
app.get("/webhook", (req, res) => {
  const mode = req.query["hub.mode"];
  const token = req.query["hub.verify_token"];
  const challenge = req.query["hub.challenge"];

  if (mode === "subscribe" && token === config.WHATSAPP_VERIFY_TOKEN) {
    console.log("✅ Webhook verified");
    return res.status(200).send(challenge);
  }
  res.sendStatus(403);
});

// Webhook Messages (POST) — Incoming WhatsApp messages
app.post("/webhook", async (req, res) => {
  try {
    res.sendStatus(200); // Acknowledge immediately

    const body = req.body;
    if (!body.object || body.object !== "whatsapp_business_account") return;

    const entries = body.entry || [];
    for (const entry of entries) {
      const changes = entry.changes || [];
      for (const change of changes) {
        if (change.field !== "messages") continue;

        const value = change.value;
        const messages = value.messages || [];
        const contacts = value.contacts || [];

        for (let i = 0; i < messages.length; i++) {
          const message = messages[i];
          const contact = contacts[i] || {};
          const phone = message.from;
          const name = contact.profile?.name || "Customer";

          console.log(`📩 Message from ${name} (${phone}): ${message.type}`);

          // Ensure customer exists in DB
          await db.upsertCustomer(phone, name);

          // Mark as read & show typing
          await whatsapp.markAsRead(message.id);
          await whatsapp.sendTypingIndicator(phone);

          // Determine message payload
          let userText = "";
          let parsedOrder = null;
          let orderContextType = null;

          if (message.type === "text") {
            userText = message.text.body;
            parsedOrder = await cloudflareAI.parseGroceryOrder(userText);
          } else if (message.type === "image") {
            const imageUrl = await whatsapp.getMediaUrl(message.image.id);
            const imageBuffer = await whatsapp.downloadMedia(imageUrl);
            const mimeType = message.image.mime_type || "image/jpeg";
            parsedOrder = await cloudflareAI.processGroceryImage(imageBuffer, mimeType);
            userText = "[Customer sent an image of a grocery list]";
            orderContextType = "image_list";
          } else if (message.type === "audio") {
            const audioUrl = await whatsapp.getMediaUrl(message.audio.id);
            const audioBuffer = await whatsapp.downloadMedia(audioUrl);
            parsedOrder = await cloudflareAI.processVoiceOrder(audioBuffer);
            userText = "[Customer sent a voice message]";
            orderContextType = "voice_order";
          } else if (message.type === "interactive") {
            if (message.interactive.type === "button_reply") {
              userText = message.interactive.button_reply.title;
            } else if (message.interactive.type === "list_reply") {
              userText = message.interactive.list_reply.title;
            }
          } else if (message.type === "location") {
            userText = `[Customer shared their location: ${message.location.latitude}, ${message.location.longitude}]`;
          } else {
            userText = "[Unsupported message type]";
          }

          // Save the user's message
          await db.saveConversation(phone, "user", userText);

          // If we could parse a grocery order, build and store it
          if (parsedOrder && parsedOrder.message_understood && Array.isArray(parsedOrder.items) && parsedOrder.items.length > 0) {
            const orderData = buildOrderData(parsedOrder.items);
            await db.createOrder(phone, orderData);

            const basketText = formatBasketSummary(orderData);
            await whatsapp.sendOrderConfirmation(phone, basketText, orderData.total);
            await db.saveConversation(phone, "ree", basketText);

            // Send a smart suggestion after a brief delay
            if (orderContextType) {
              setTimeout(async () => {
                try {
                  const suggestion = await cloudflareAI.getSmartSuggestions(parsedOrder.items);
                  if (suggestion && suggestion.suggestions && suggestion.suggestions.length) {
                    const suggestionText = suggestion.suggestions
                      .map((s) => `• ${s.item} — ${s.reason} (${s.estimated_price})`)
                      .join("\n");
                    await whatsapp.sendTextMessage(phone, `💡 Suggestion:
${suggestionText}`);
                    await db.saveConversation(phone, "ree", suggestionText);
                  }
                } catch (err) {
                  console.error("❌ Suggestion error (async):", err);
                }
              }, 2000);
            }

            continue; // Move to next message
          }

          // Not an order / could not parse — fallback to general chat
          const reply = await cloudflareAI.handleGeneralChat(userText, name);
          const finalReply = reply || "I'm here to help! You can send me your grocery list anytime. 😊";
          await whatsapp.sendTextMessage(phone, finalReply);
          await db.saveConversation(phone, "ree", finalReply);
        }
      }
    }
  } catch (error) {
    console.error("❌ Webhook error:", error);
  }
});


// ═══════════════════════════════════════════════════════════════════
// API ENDPOINTS — Dashboard & Management
// ═══════════════════════════════════════════════════════════════════

// ─── Customer Management ─────────────────────────────────────────
app.get("/api/customers", async (req, res) => {
  try {
    const customers = await db.getAllCustomers();
    res.json({ success: true, data: customers });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.get("/api/customers/:phone", async (req, res) => {
  try {
    const customer = await db.getCustomer(req.params.phone);
    const orders = await db.getOrderHistory(req.params.phone, 20);
    const stats = await db.getCustomerStats(req.params.phone);
    res.json({ success: true, data: { customer, orders, stats } });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// ─── Order Management ────────────────────────────────────────────
app.get("/api/orders", async (req, res) => {
  try {
    const { status, limit = 50 } = req.query;
    const orders = await db.getAllOrders(status, parseInt(limit));
    res.json({ success: true, data: orders });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.get("/api/orders/:id", async (req, res) => {
  try {
    const order = await db.getOrder(req.params.id);
    res.json({ success: true, data: order });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.patch("/api/orders/:id/status", async (req, res) => {
  try {
    const { status, deliveryPartner } = req.body;
    await db.updateOrderStatus(req.params.id, status, deliveryPartner);

    // Send WhatsApp notification to customer
    const order = await db.getOrder(req.params.id);
    if (order) {
      const statusMessages = {
        confirmed: `✅ Order confirmed! Your groceries are being packed right now.\n\nOrder #${order.id}\n💰 Total: ₹${order.total}\n\nWe'll update you once it's out for delivery!`,
        packed: `📦 Great news! Your order has been packed and is ready for dispatch.\n\nOrder #${order.id}`,
        out_for_delivery: `🚚 Your groceries are on the way! ${deliveryPartner || "Our delivery partner"} is heading to you.\n\nEstimated arrival: 30-45 minutes.\n\nOrder #${order.id}`,
        delivered: `🎉 Delivered! Your groceries have arrived.\n\nThank you for shopping with GRIH SANSAR, ${order.customer_name}! 😊\n\n💡 You saved approximately ₹${Math.round(order.total * 0.18)} compared to quick-commerce apps.\n\nThink Before You Blink.`,
        cancelled: `❌ Your order #${order.id} has been cancelled as requested. If this was a mistake, just send me a message!`,
      };

      const msg = statusMessages[status];
      if (msg) {
        await whatsapp.sendTextMessage(order.phone, msg);
        await db.saveConversation(order.phone, "ree", msg);
      }
    }

    res.json({ success: true, message: `Order status updated to ${status}` });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// ─── Inventory Management ────────────────────────────────────────
app.get("/api/inventory", async (req, res) => {
  try {
    const { category, search } = req.query;
    const inventory = await db.getInventory(category, search);
    res.json({ success: true, data: inventory });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.post("/api/inventory", async (req, res) => {
  try {
    const item = req.body;
    const id = await db.addInventoryItem(item);
    res.json({ success: true, data: { id } });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.put("/api/inventory/:id", async (req, res) => {
  try {
    await db.updateInventoryItem(req.params.id, req.body);
    res.json({ success: true, message: "Item updated" });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.delete("/api/inventory/:id", async (req, res) => {
  try {
    await db.deleteInventoryItem(req.params.id);
    res.json({ success: true, message: "Item deleted" });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});


// ═══════════════════════════════════════════════════════════════════
// EXCEL INVENTORY UPLOAD — Bulk import from .xlsx/.csv
// ═══════════════════════════════════════════════════════════════════

app.post("/api/inventory/upload", upload.single("file"), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ success: false, error: "No file uploaded" });
    }

    const filePath = req.file.path;
    const workbook = XLSX.readFile(filePath);
    const sheetName = workbook.SheetNames[0];
    const sheet = workbook.Sheets[sheetName];
    const rawData = XLSX.utils.sheet_to_json(sheet);

    if (rawData.length === 0) {
      return res.status(400).json({ success: false, error: "File is empty" });
    }

    // Normalize column headers (case-insensitive)
    const normalizeKey = (key) => key.toLowerCase().trim().replace(/\s+/g, "_");

    const results = { added: 0, updated: 0, errors: [] };

    for (let i = 0; i < rawData.length; i++) {
      const row = rawData[i];
      const normalized = {};
      Object.keys(row).forEach((k) => { normalized[normalizeKey(k)] = row[k]; });

      // Map columns flexibly
      const item = {
        name: normalized.name || normalized.item_name || normalized.product_name || normalized.product || "",
        category: normalized.category || normalized.type || normalized.group || "general",
        variant: normalized.variant || normalized.size || normalized.weight || normalized.quantity || "",
        price: parseFloat(normalized.price || normalized.mrp || normalized.cost || normalized.rate || 0),
        mrp: parseFloat(normalized.mrp || normalized.price || 0),
        stock: parseInt(normalized.stock || normalized.qty || normalized.inventory || normalized.available || 100),
        unit: normalized.unit || normalized.uom || "",
        brand: normalized.brand || normalized.company || "",
        barcode: normalized.barcode || normalized.sku || normalized.ean || "",
        active: normalized.active !== undefined ? (normalized.active ? 1 : 0) : 1,
        quick_commerce_price: parseFloat(normalized.quick_commerce_price || normalized.competitor_price || normalized.online_price || 0),
      };

      if (!item.name) {
        results.errors.push(`Row ${i + 2}: Missing product name`);
        continue;
      }
      if (!item.price || item.price <= 0) {
        results.errors.push(`Row ${i + 2}: Invalid price for "${item.name}"`);
        continue;
      }

      try {
        const existing = await db.findInventoryByName(item.name, item.variant);
        if (existing) {
          await db.updateInventoryItem(existing.id, item);
          results.updated++;
        } else {
          await db.addInventoryItem(item);
          results.added++;
        }
      } catch (err) {
        results.errors.push(`Row ${i + 2}: ${err.message}`);
      }
    }

    // Clean up uploaded file
    fs.unlinkSync(filePath);

    res.json({
      success: true,
      message: `Inventory upload complete: ${results.added} added, ${results.updated} updated, ${results.errors.length} errors`,
      data: results,
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Download inventory template
app.get("/api/inventory/template", (req, res) => {
  const templateData = [
    {
      name: "Aashirvaad Atta",
      category: "staples",
      variant: "5 kg",
      price: 375,
      mrp: 410,
      stock: 50,
      unit: "kg",
      brand: "Aashirvaad",
      barcode: "8901063010017",
      quick_commerce_price: 445,
    },
    {
      name: "Amul Toned Milk",
      category: "dairy",
      variant: "1 L",
      price: 62,
      mrp: 64,
      stock: 200,
      unit: "L",
      brand: "Amul",
      barcode: "8901262150019",
      quick_commerce_price: 72,
    },
    {
      name: "Toor Dal",
      category: "staples",
      variant: "1 kg",
      price: 175,
      mrp: 195,
      stock: 80,
      unit: "kg",
      brand: "Local",
      barcode: "",
      quick_commerce_price: 210,
    },
    {
      name: "Tomatoes",
      category: "fresh_produce",
      variant: "1 kg",
      price: 33,
      mrp: 33,
      stock: 100,
      unit: "kg",
      brand: "Farm Fresh",
      barcode: "",
      quick_commerce_price: 45,
    },
    {
      name: "Surf Excel Detergent",
      category: "cleaning",
      variant: "2 kg",
      price: 420,
      mrp: 450,
      stock: 30,
      unit: "kg",
      brand: "Surf Excel",
      barcode: "8901030623257",
      quick_commerce_price: 490,
    },
  ];

  const ws = XLSX.utils.json_to_sheet(templateData);

  // Set column widths
  ws["!cols"] = [
    { wch: 25 }, { wch: 15 }, { wch: 10 }, { wch: 8 },
    { wch: 8 }, { wch: 8 }, { wch: 6 }, { wch: 15 },
    { wch: 18 }, { wch: 20 },
  ];

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Inventory");

  // Add instructions sheet
  const instructions = [
    { Instructions: "GRIH SANSAR — Inventory Upload Template" },
    { Instructions: "" },
    { Instructions: "Required columns: name, price" },
    { Instructions: "Optional columns: category, variant, mrp, stock, unit, brand, barcode, quick_commerce_price" },
    { Instructions: "" },
    { Instructions: "Categories: staples, dairy, spices, snacks, beverages, cleaning, fresh_produce, personal_care, general" },
    { Instructions: "" },
    { Instructions: "Notes:" },
    { Instructions: "• Column headers are case-insensitive (Name, NAME, name all work)" },
    { Instructions: "• Alternative column names accepted: item_name, product_name, cost, rate, qty, sku, competitor_price" },
    { Instructions: "• If a product with the same name + variant exists, it will be updated" },
    { Instructions: "• quick_commerce_price is used for savings comparison messaging" },
    { Instructions: "• Stock defaults to 100 if not provided" },
    { Instructions: "" },
    { Instructions: "Upload this file at: POST /api/inventory/upload" },
  ];
  const wsInst = XLSX.utils.json_to_sheet(instructions);
  wsInst["!cols"] = [{ wch: 90 }];
  XLSX.utils.book_append_sheet(wb, wsInst, "Instructions");

  const buffer = XLSX.write(wb, { type: "buffer", bookType: "xlsx" });

  res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
  res.setHeader("Content-Disposition", "attachment; filename=GRIH_SANSAR_Inventory_Template.xlsx");
  res.send(buffer);
});


// ═══════════════════════════════════════════════════════════════════
// PROACTIVE MESSAGING — Monthly Reminders & Festival Alerts
// ═══════════════════════════════════════════════════════════════════

app.post("/api/reminders/check", async (req, res) => {
  try {
    const dueCustomers = await db.getCustomersDueForReminder();
    const sent = [];

    for (const customer of dueCustomers) {
      const lastOrder = await db.getLastOrder(customer.phone);
      if (!lastOrder) continue;

      const daysSince = Math.floor((Date.now() - new Date(lastOrder.created_at).getTime()) / 86400000);

      if (daysSince >= customer.avg_order_cycle * 0.9) {
        const analysis = await cloudflareAI.analyseReorderTiming({
          ...customer,
          orderHistory: await db.getOrderHistory(customer.phone, 10),
          lastOrderDate: lastOrder.created_at,
        });

        if (analysis && analysis.should_remind) {
          const reminder = analysis.suggested_message || `Hi ${customer.name}! 😊 It's been a while since your last order. Shall I set up your usual basket? Just say "Yes"!`;
          await whatsapp.sendTextMessage(customer.phone, reminder);
          await db.saveConversation(customer.phone, "ree", reminder);
          await db.updateLastReminder(customer.phone);
          sent.push(customer.phone);
        }
      }
    }

    res.json({ success: true, message: `Sent ${sent.length} reminders`, data: sent });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.post("/api/broadcast/festival", async (req, res) => {
  try {
    const { festival, message } = req.body;
    const activeCustomers = await db.getActiveCustomers();
    let sent = 0;

    for (const customer of activeCustomers) {
      try {
        await whatsapp.sendTextMessage(customer.phone, message);
        await db.saveConversation(customer.phone, "ree", message);
        sent++;
        // Rate limiting — 1 message per second
        await new Promise((r) => setTimeout(r, 1000));
      } catch (err) {
        console.error(`Failed to send to ${customer.phone}:`, err.message);
      }
    }

    res.json({ success: true, message: `Festival broadcast sent to ${sent} customers` });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});


// ═══════════════════════════════════════════════════════════════════
// ANALYTICS ENDPOINTS
// ═══════════════════════════════════════════════════════════════════

app.get("/api/analytics/dashboard", async (req, res) => {
  try {
    const stats = await db.getDashboardStats();
    res.json({ success: true, data: stats });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.get("/api/analytics/savings", async (req, res) => {
  try {
    const savings = await db.getTotalSavings();
    res.json({ success: true, data: savings });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});


// ═══════════════════════════════════════════════════════════════════
// CHAT API — For web/demo frontend
// ═══════════════════════════════════════════════════════════════════

app.post("/api/chat", async (req, res) => {
  try {
    const { message, phone, name } = req.body;
    const demoPhone = phone || "demo_user";
    const demoName = name || "Customer";

    await db.upsertCustomer(demoPhone, demoName);

    const customer = await db.getCustomer(demoPhone);
    const orderHistory = await db.getOrderHistory(demoPhone, 5);
    const conversationHistory = await db.getConversationHistory(demoPhone, 10);
    const inventory = await db.getInventory();

    const context = {
      customerName: customer?.name || demoName,
      phone: demoPhone,
      orderHistory,
      conversationHistory,
      inventory,
    };

    const response = await cloudflareAI.handleGeneralChat(message, demoName);

    await db.saveConversation(demoPhone, "user", message);
    await db.saveConversation(demoPhone, "ree", response);

    res.json({ success: true, data: { message: response } });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Image processing for web frontend
app.post("/api/chat/image", upload.single("image"), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ success: false, error: "No image uploaded" });
    }

    const imageBuffer = fs.readFileSync(req.file.path);
    const mimeType = req.file.mimetype;

    const analysis = await cloudflareAI.processGroceryImage(imageBuffer, mimeType);

    fs.unlinkSync(req.file.path);

    res.json({ success: true, data: { extractedItems: analysis } });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});


// ═══════════════════════════════════════════════════════════════════
// START SERVER
// ═══════════════════════════════════════════════════════════════════

// Initialize DB (early, so endpoints can use it right away)
try {
  db.initialize();
  console.log("✅ Database initialized successfully");
} catch (err) {
  console.error("❌ Failed to initialize database:", err);
}

// Start server
const server = app.listen(PORT, "0.0.0.0", () => {
  console.log("══════════════════════════════════════");
  console.log("🌿 REE WhatsApp Shopping Companion");
  console.log("🏪 GRIH SANSAR DEPARTMENTAL STORE");
  console.log(`🚀 Server running on port ${PORT}`);
  console.log("🔗 Webhook endpoint ready at /webhook");
  console.log("💡 Think Before You Blink.");
  console.log("══════════════════════════════════════");

  cloudflareAI.verifyConnection().then((ok) => {
    if (ok) {
      console.log("🧠 AI engine ready");
    } else {
      console.error("🚨 AI engine failed to initialize — AI features will not work!");
    }
  });
});

// Heartbeat log to keep Railway from idling the container
const heartbeat = setInterval(() => {
  console.log("💓 REE Bot heartbeat — server alive", new Date().toISOString());
}, 30000);

// Graceful shutdown handlers (Railway sends SIGTERM on deploy/stop)
let shuttingDown = false;
const shutdown = (signal) => {
  if (shuttingDown) return;
  shuttingDown = true;

  console.log(`🛑 ${signal} received. Shutting down server...`);
  clearInterval(heartbeat);

  // Stop accepting new connections, then exit
  server.close(() => {
    console.log("✅ Server closed");
    process.exit(0);
  });

  // Force exit if graceful shutdown hangs
  setTimeout(() => {
    console.warn("⚠️ Forced shutdown after timeout");
    process.exit(0);
  }, 10000);
};

process.on("SIGINT", () => shutdown("SIGINT"));
process.on("SIGTERM", () => shutdown("SIGTERM"));

// Export the app for testing or external use
module.exports = app;
