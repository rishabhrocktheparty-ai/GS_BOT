// ═══════════════════════════════════════════════════════════════════
// REE Bot — Scheduled Tasks (Cron Jobs)
// Handles: Monthly reminders, festival alerts, stock checks
// ═══════════════════════════════════════════════════════════════════

const cron = require("node-cron");
const db = require("../database/db");
const whatsapp = require("../whatsapp/whatsapp-service");
const gemini = require("./gemini-service");

function initScheduler() {
  console.log("⏰ Scheduler initialized");

  // ─── Daily: Check for customers due for pantry reminders (10 AM) ──
  cron.schedule("0 10 * * *", async () => {
    console.log("🔔 Running daily pantry reminder check...");
    try {
      const dueCustomers = await db.getCustomersDueForReminder();
      let sent = 0;

      for (const customer of dueCustomers) {
        const lastOrder = await db.getLastOrder(customer.phone);
        if (!lastOrder) continue;

        const daysSince = Math.floor(
          (Date.now() - new Date(lastOrder.created_at).getTime()) / 86400000
        );

        // Trigger if within 90% of their average cycle
        if (daysSince >= customer.avg_order_cycle * 0.9) {
          const reminder = await gemini.generateReminder(customer, lastOrder);
          await whatsapp.sendTextMessage(customer.phone, reminder);
          await db.saveConversation(customer.phone, "ree", reminder);
          await db.updateLastReminder(customer.phone);
          sent++;

          // Rate limiting: 1 per second
          await new Promise((r) => setTimeout(r, 1000));
        }
      }

      console.log(`✅ Sent ${sent} pantry reminders`);
    } catch (err) {
      console.error("❌ Reminder cron error:", err.message);
    }
  });

  // ─── Weekly: Send savings summary to frequent customers (Sunday 11 AM) ──
  cron.schedule("0 11 * * 0", async () => {
    console.log("💰 Running weekly savings summary...");
    try {
      const frequentCustomers = await db.getActiveCustomers();
      let sent = 0;

      for (const customer of frequentCustomers) {
        if (customer.total_orders < 3) continue; // Only for regulars
        if (customer.total_savings < 100) continue; // Only if meaningful savings

        const message = `Hi ${customer.name}! 😊\n\n💰 Your GRIH SANSAR Savings Report:\n\n🌟 Total savings so far: ₹${Math.round(customer.total_savings)}\n📦 Orders placed: ${customer.total_orders}\n💵 Avg savings per order: ₹${Math.round(customer.total_savings / customer.total_orders)}\n\nThat's money saved by shopping thoughtfully with us! Keep it going. 🎉\n\nThink Before You Blink.`;

        await whatsapp.sendTextMessage(customer.phone, message);
        await db.saveConversation(customer.phone, "ree", message);
        sent++;
        await new Promise((r) => setTimeout(r, 1500));
      }

      console.log(`✅ Sent ${sent} savings summaries`);
    } catch (err) {
      console.error("❌ Savings cron error:", err.message);
    }
  });

  // ─── Daily: Check low stock items and alert store admin (8 AM) ──
  cron.schedule("0 8 * * *", async () => {
    console.log("📊 Running stock check...");
    try {
      const lowStockItems = await db.getInventory();
      const alerts = lowStockItems.filter((i) => i.stock < 10);

      if (alerts.length > 0) {
        const alertMsg = `⚠️ GRIH SANSAR — Low Stock Alert\n\n${alerts.map((i) => `• ${i.name} (${i.variant}) — Only ${i.stock} left`).join("\n")}\n\nPlease restock these items today.`;

        // Send to store admin phone (configure in .env)
        if (process.env.STORE_PHONE) {
          await whatsapp.sendTextMessage(process.env.STORE_PHONE, alertMsg);
        }
        console.log(`⚠️ ${alerts.length} items low on stock`);
      }
    } catch (err) {
      console.error("❌ Stock check error:", err.message);
    }
  });
}

module.exports = { initScheduler };
