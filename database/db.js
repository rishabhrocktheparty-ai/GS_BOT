// ═══════════════════════════════════════════════════════════════════
// REE Bot — Database Layer (SQLite / better-sqlite3)
// Complete schema for customers, orders, inventory, conversations
// ═══════════════════════════════════════════════════════════════════

const Database = require("better-sqlite3");
const path = require("path");
const config = require("../config/config");

let db;

// ─── Initialize Database & Create Tables ─────────────────────────
function initialize() {
  const dbPath = path.resolve(config.DB_PATH);
  db = new Database(dbPath);

  // Enable WAL mode for better concurrent read performance
  db.pragma("journal_mode = WAL");
  db.pragma("foreign_keys = ON");

  // ════════════════════════════════════════
  // TABLE: customers
  // ════════════════════════════════════════
  db.exec(`
    CREATE TABLE IF NOT EXISTS customers (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      phone TEXT UNIQUE NOT NULL,
      name TEXT DEFAULT 'Customer',
      address TEXT,
      locality TEXT,
      pincode TEXT,
      family_size INTEGER,
      preferences TEXT DEFAULT '{}',
      declined_suggestions TEXT DEFAULT '[]',
      avg_order_cycle INTEGER DEFAULT 30,
      total_orders INTEGER DEFAULT 0,
      total_spent REAL DEFAULT 0,
      total_savings REAL DEFAULT 0,
      last_order_date TEXT,
      last_reminder_date TEXT,
      consecutive_ignores INTEGER DEFAULT 0,
      is_active INTEGER DEFAULT 1,
      opted_out INTEGER DEFAULT 0,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now'))
    );
  `);

  // ════════════════════════════════════════
  // TABLE: inventory
  // ════════════════════════════════════════
  db.exec(`
    CREATE TABLE IF NOT EXISTS inventory (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      category TEXT DEFAULT 'general',
      variant TEXT DEFAULT '',
      price REAL NOT NULL,
      mrp REAL DEFAULT 0,
      stock INTEGER DEFAULT 100,
      unit TEXT DEFAULT '',
      brand TEXT DEFAULT '',
      barcode TEXT DEFAULT '',
      image_url TEXT DEFAULT '',
      description TEXT DEFAULT '',
      tags TEXT DEFAULT '',
      quick_commerce_price REAL DEFAULT 0,
      is_seasonal INTEGER DEFAULT 0,
      season_start TEXT,
      season_end TEXT,
      active INTEGER DEFAULT 1,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now'))
    );
  `);

  // ════════════════════════════════════════
  // TABLE: orders
  // ════════════════════════════════════════
  db.exec(`
    CREATE TABLE IF NOT EXISTS orders (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      phone TEXT NOT NULL,
      customer_name TEXT,
      items TEXT NOT NULL,
      subtotal REAL DEFAULT 0,
      delivery_charge REAL DEFAULT 0,
      discount REAL DEFAULT 0,
      total REAL NOT NULL,
      savings_vs_quickcommerce REAL DEFAULT 0,
      status TEXT DEFAULT 'pending',
      payment_method TEXT DEFAULT 'cod',
      payment_status TEXT DEFAULT 'pending',
      delivery_address TEXT,
      delivery_partner TEXT,
      delivery_notes TEXT,
      estimated_delivery TEXT,
      delivered_at TEXT,
      source TEXT DEFAULT 'whatsapp',
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (phone) REFERENCES customers(phone)
    );
  `);

  // ════════════════════════════════════════
  // TABLE: order_items (individual line items)
  // ════════════════════════════════════════
  db.exec(`
    CREATE TABLE IF NOT EXISTS order_items (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      order_id INTEGER NOT NULL,
      inventory_id INTEGER,
      item_name TEXT NOT NULL,
      variant TEXT DEFAULT '',
      quantity INTEGER DEFAULT 1,
      unit_price REAL NOT NULL,
      total_price REAL NOT NULL,
      FOREIGN KEY (order_id) REFERENCES orders(id),
      FOREIGN KEY (inventory_id) REFERENCES inventory(id)
    );
  `);

  // ════════════════════════════════════════
  // TABLE: conversations (chat history)
  // ════════════════════════════════════════
  db.exec(`
    CREATE TABLE IF NOT EXISTS conversations (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      phone TEXT NOT NULL,
      sender TEXT NOT NULL,
      message TEXT NOT NULL,
      message_type TEXT DEFAULT 'text',
      metadata TEXT DEFAULT '{}',
      created_at TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (phone) REFERENCES customers(phone)
    );
  `);

  // ════════════════════════════════════════
  // TABLE: product_affinities (suggestion pairs)
  // ════════════════════════════════════════
  db.exec(`
    CREATE TABLE IF NOT EXISTS product_affinities (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      product_a TEXT NOT NULL,
      product_b TEXT NOT NULL,
      affinity_score REAL DEFAULT 1.0,
      category TEXT DEFAULT 'complementary',
      created_at TEXT DEFAULT (datetime('now'))
    );
  `);

  // ════════════════════════════════════════
  // TABLE: festival_combos
  // ════════════════════════════════════════
  db.exec(`
    CREATE TABLE IF NOT EXISTS festival_combos (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      festival TEXT NOT NULL,
      items TEXT NOT NULL,
      price REAL NOT NULL,
      mrp REAL NOT NULL,
      savings REAL DEFAULT 0,
      active_from TEXT,
      active_until TEXT,
      is_active INTEGER DEFAULT 1,
      created_at TEXT DEFAULT (datetime('now'))
    );
  `);

  // ════════════════════════════════════════
  // TABLE: reminders_log
  // ════════════════════════════════════════
  db.exec(`
    CREATE TABLE IF NOT EXISTS reminders_log (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      phone TEXT NOT NULL,
      type TEXT DEFAULT 'reorder',
      message TEXT,
      response TEXT,
      sent_at TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (phone) REFERENCES customers(phone)
    );
  `);

  // ════════════════════════════════════════
  // INDEXES for performance
  // ════════════════════════════════════════
  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_customers_phone ON customers(phone);
    CREATE INDEX IF NOT EXISTS idx_orders_phone ON orders(phone);
    CREATE INDEX IF NOT EXISTS idx_orders_status ON orders(status);
    CREATE INDEX IF NOT EXISTS idx_orders_created ON orders(created_at);
    CREATE INDEX IF NOT EXISTS idx_inventory_category ON inventory(category);
    CREATE INDEX IF NOT EXISTS idx_inventory_name ON inventory(name);
    CREATE INDEX IF NOT EXISTS idx_conversations_phone ON conversations(phone);
    CREATE INDEX IF NOT EXISTS idx_conversations_created ON conversations(created_at);
  `);

  // Seed default product affinities
  const affinityCount = db.prepare("SELECT COUNT(*) as c FROM product_affinities").get();
  if (affinityCount.c === 0) {
    seedAffinities();
  }

  console.log("✅ Database initialized successfully");
}

// ─── Seed Product Affinities ─────────────────────────────────────
function seedAffinities() {
  const affinities = [
    ["Bread", "Butter", 0.95, "breakfast"],
    ["Bread", "Jam", 0.85, "breakfast"],
    ["Bread", "Eggs", 0.80, "breakfast"],
    ["Bread", "Cheese Slices", 0.75, "breakfast"],
    ["Atta", "Ghee", 0.90, "cooking"],
    ["Atta", "Oil", 0.85, "cooking"],
    ["Atta", "Paneer", 0.70, "cooking"],
    ["Rice", "Dal", 0.95, "meal"],
    ["Rice", "Pickle", 0.75, "meal"],
    ["Rice", "Papad", 0.70, "meal"],
    ["Rice", "Curd", 0.65, "meal"],
    ["Tea", "Milk", 0.95, "beverage"],
    ["Tea", "Sugar", 0.90, "beverage"],
    ["Tea", "Biscuits", 0.80, "beverage"],
    ["Coffee", "Milk", 0.90, "beverage"],
    ["Coffee", "Sugar", 0.85, "beverage"],
    ["Pasta", "Sauce", 0.95, "recipe"],
    ["Pasta", "Cheese", 0.80, "recipe"],
    ["Noodles", "Vegetables", 0.75, "recipe"],
    ["Maggi", "Vegetables", 0.70, "recipe"],
    ["Tomatoes", "Onions", 0.90, "cooking"],
    ["Tomatoes", "Coriander Leaves", 0.85, "cooking"],
    ["Tomatoes", "Green Chillies", 0.75, "cooking"],
    ["Onions", "Ginger", 0.80, "cooking"],
    ["Onions", "Garlic", 0.80, "cooking"],
    ["Paneer", "Capsicum", 0.75, "recipe"],
    ["Paneer", "Onions", 0.70, "recipe"],
    ["Eggs", "Bread", 0.80, "breakfast"],
    ["Eggs", "Butter", 0.75, "breakfast"],
    ["Milk", "Cornflakes", 0.80, "breakfast"],
    ["Diapers", "Wipes", 0.95, "baby"],
    ["Diapers", "Rash Cream", 0.85, "baby"],
    ["Shampoo", "Conditioner", 0.90, "personal_care"],
    ["Shampoo", "Soap", 0.75, "personal_care"],
    ["Surf Excel", "Vim Bar", 0.80, "cleaning"],
    ["Harpic", "Lizol", 0.85, "cleaning"],
    ["Cleaning Liquid", "Scrubber", 0.80, "cleaning"],
  ];

  const stmt = db.prepare("INSERT INTO product_affinities (product_a, product_b, affinity_score, category) VALUES (?, ?, ?, ?)");
  const insertMany = db.transaction((items) => {
    for (const item of items) stmt.run(...item);
  });
  insertMany(affinities);
}


// ═══════════════════════════════════════════════════════════════════
// CUSTOMER OPERATIONS
// ═══════════════════════════════════════════════════════════════════

function upsertCustomer(phone, name) {
  const existing = db.prepare("SELECT id FROM customers WHERE phone = ?").get(phone);
  if (existing) {
    db.prepare("UPDATE customers SET name = ?, updated_at = datetime('now') WHERE phone = ?").run(name, phone);
    return existing.id;
  }
  const result = db.prepare("INSERT INTO customers (phone, name) VALUES (?, ?)").run(phone, name);
  return result.lastInsertRowid;
}

function getCustomer(phone) {
  return db.prepare("SELECT * FROM customers WHERE phone = ?").get(phone);
}

function getAllCustomers() {
  return db.prepare("SELECT * FROM customers ORDER BY updated_at DESC").all();
}

function getActiveCustomers() {
  return db.prepare("SELECT * FROM customers WHERE is_active = 1 AND opted_out = 0").all();
}

function getCustomerStats(phone) {
  const stats = db.prepare(`
    SELECT 
      COUNT(*) as total_orders,
      COALESCE(SUM(total), 0) as total_spent,
      COALESCE(SUM(savings_vs_quickcommerce), 0) as total_savings,
      COALESCE(AVG(total), 0) as avg_order_value,
      MIN(created_at) as first_order,
      MAX(created_at) as last_order
    FROM orders WHERE phone = ? AND status != 'cancelled'
  `).get(phone);

  const topItems = db.prepare(`
    SELECT oi.item_name, SUM(oi.quantity) as total_qty, COUNT(*) as order_count
    FROM order_items oi
    JOIN orders o ON oi.order_id = o.id
    WHERE o.phone = ?
    GROUP BY oi.item_name
    ORDER BY order_count DESC
    LIMIT 10
  `).all(phone);

  return { ...stats, topItems };
}

function getCustomersDueForReminder() {
  return db.prepare(`
    SELECT * FROM customers 
    WHERE is_active = 1 
    AND opted_out = 0 
    AND consecutive_ignores < ?
    AND (last_reminder_date IS NULL OR julianday('now') - julianday(last_reminder_date) >= 7)
    AND last_order_date IS NOT NULL
  `).all(config.PAUSE_OUTREACH_AFTER_IGNORES);
}

function updateLastReminder(phone) {
  db.prepare("UPDATE customers SET last_reminder_date = datetime('now') WHERE phone = ?").run(phone);
}


// ═══════════════════════════════════════════════════════════════════
// ORDER OPERATIONS
// ═══════════════════════════════════════════════════════════════════

function createOrder(phone, orderData) {
  const { items, subtotal, deliveryCharge, discount, total, savingsVsQC, paymentMethod, deliveryAddress } = orderData;

  const result = db.prepare(`
    INSERT INTO orders (phone, customer_name, items, subtotal, delivery_charge, discount, total, 
      savings_vs_quickcommerce, payment_method, delivery_address, status)
    VALUES (?, (SELECT name FROM customers WHERE phone = ?), ?, ?, ?, ?, ?, ?, ?, ?, 'confirmed')
  `).run(phone, phone, JSON.stringify(items), subtotal, deliveryCharge || 0, discount || 0, total, savingsVsQC || 0, paymentMethod || "cod", deliveryAddress || "");

  const orderId = result.lastInsertRowid;

  // Insert individual items
  const itemStmt = db.prepare("INSERT INTO order_items (order_id, item_name, variant, quantity, unit_price, total_price) VALUES (?, ?, ?, ?, ?, ?)");
  for (const item of items) {
    itemStmt.run(orderId, item.name, item.variant || "", item.quantity || 1, item.price, (item.price * (item.quantity || 1)));
  }

  // Update customer stats
  db.prepare(`
    UPDATE customers SET 
      total_orders = total_orders + 1,
      total_spent = total_spent + ?,
      total_savings = total_savings + ?,
      last_order_date = datetime('now'),
      updated_at = datetime('now')
    WHERE phone = ?
  `).run(total, savingsVsQC || 0, phone);

  // Update avg order cycle
  const recentOrders = db.prepare(`
    SELECT created_at FROM orders WHERE phone = ? AND status != 'cancelled' ORDER BY created_at DESC LIMIT 5
  `).all(phone);

  if (recentOrders.length >= 2) {
    let totalDays = 0;
    for (let i = 0; i < recentOrders.length - 1; i++) {
      const d1 = new Date(recentOrders[i].created_at);
      const d2 = new Date(recentOrders[i + 1].created_at);
      totalDays += Math.abs(d1 - d2) / 86400000;
    }
    const avgCycle = Math.round(totalDays / (recentOrders.length - 1));
    db.prepare("UPDATE customers SET avg_order_cycle = ? WHERE phone = ?").run(avgCycle, phone);
  }

  return orderId;
}

function getOrder(id) {
  const order = db.prepare("SELECT * FROM orders WHERE id = ?").get(id);
  if (order) {
    order.itemsList = db.prepare("SELECT * FROM order_items WHERE order_id = ?").all(id);
  }
  return order;
}

function getLastOrder(phone) {
  return db.prepare("SELECT * FROM orders WHERE phone = ? AND status != 'cancelled' ORDER BY created_at DESC LIMIT 1").get(phone);
}

function getOrderHistory(phone, limit = 10) {
  return db.prepare("SELECT * FROM orders WHERE phone = ? ORDER BY created_at DESC LIMIT ?").all(phone, limit);
}

function getAllOrders(status, limit = 50) {
  if (status) {
    return db.prepare("SELECT * FROM orders WHERE status = ? ORDER BY created_at DESC LIMIT ?").all(status, limit);
  }
  return db.prepare("SELECT * FROM orders ORDER BY created_at DESC LIMIT ?").all(limit);
}

function updateOrderStatus(id, status, deliveryPartner) {
  db.prepare(`
    UPDATE orders SET status = ?, delivery_partner = COALESCE(?, delivery_partner), 
    delivered_at = CASE WHEN ? = 'delivered' THEN datetime('now') ELSE delivered_at END,
    updated_at = datetime('now')
    WHERE id = ?
  `).run(status, deliveryPartner, status, id);
}


// ═══════════════════════════════════════════════════════════════════
// INVENTORY OPERATIONS
// ═══════════════════════════════════════════════════════════════════

function getInventory(category, search) {
  if (category && search) {
    return db.prepare("SELECT * FROM inventory WHERE category = ? AND (name LIKE ? OR brand LIKE ?) AND active = 1 ORDER BY name")
      .all(category, `%${search}%`, `%${search}%`);
  }
  if (category) {
    return db.prepare("SELECT * FROM inventory WHERE category = ? AND active = 1 ORDER BY name").all(category);
  }
  if (search) {
    return db.prepare("SELECT * FROM inventory WHERE (name LIKE ? OR brand LIKE ? OR tags LIKE ?) AND active = 1 ORDER BY name")
      .all(`%${search}%`, `%${search}%`, `%${search}%`);
  }
  return db.prepare("SELECT * FROM inventory WHERE active = 1 ORDER BY category, name").all();
}

function addInventoryItem(item) {
  const result = db.prepare(`
    INSERT INTO inventory (name, category, variant, price, mrp, stock, unit, brand, barcode, quick_commerce_price, active)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(item.name, item.category || "general", item.variant || "", item.price, item.mrp || item.price, item.stock || 100, item.unit || "", item.brand || "", item.barcode || "", item.quick_commerce_price || 0, item.active !== undefined ? item.active : 1);
  return result.lastInsertRowid;
}

function updateInventoryItem(id, item) {
  const fields = [];
  const values = [];
  const allowed = ["name", "category", "variant", "price", "mrp", "stock", "unit", "brand", "barcode", "quick_commerce_price", "active", "image_url", "description", "tags"];

  for (const field of allowed) {
    if (item[field] !== undefined) {
      fields.push(`${field} = ?`);
      values.push(item[field]);
    }
  }
  fields.push("updated_at = datetime('now')");
  values.push(id);

  db.prepare(`UPDATE inventory SET ${fields.join(", ")} WHERE id = ?`).run(...values);
}

function deleteInventoryItem(id) {
  db.prepare("UPDATE inventory SET active = 0 WHERE id = ?").run(id);
}

function findInventoryByName(name, variant) {
  if (variant) {
    return db.prepare("SELECT * FROM inventory WHERE LOWER(name) = LOWER(?) AND LOWER(variant) = LOWER(?) AND active = 1").get(name, variant);
  }
  return db.prepare("SELECT * FROM inventory WHERE LOWER(name) = LOWER(?) AND active = 1").get(name);
}


// ═══════════════════════════════════════════════════════════════════
// CONVERSATION OPERATIONS
// ═══════════════════════════════════════════════════════════════════

function saveConversation(phone, sender, message, type = "text", metadata = {}) {
  db.prepare("INSERT INTO conversations (phone, sender, message, message_type, metadata) VALUES (?, ?, ?, ?, ?)")
    .run(phone, sender, message, type, JSON.stringify(metadata));
}

function getConversationHistory(phone, limit = 10) {
  return db.prepare("SELECT * FROM conversations WHERE phone = ? ORDER BY created_at DESC LIMIT ?").all(phone, limit).reverse();
}


// ═══════════════════════════════════════════════════════════════════
// ANALYTICS OPERATIONS
// ═══════════════════════════════════════════════════════════════════

function getDashboardStats() {
  const totalCustomers = db.prepare("SELECT COUNT(*) as c FROM customers WHERE is_active = 1").get().c;
  const totalOrders = db.prepare("SELECT COUNT(*) as c FROM orders").get().c;
  const totalRevenue = db.prepare("SELECT COALESCE(SUM(total), 0) as s FROM orders WHERE status != 'cancelled'").get().s;
  const totalSavings = db.prepare("SELECT COALESCE(SUM(savings_vs_quickcommerce), 0) as s FROM orders WHERE status != 'cancelled'").get().s;
  const todayOrders = db.prepare("SELECT COUNT(*) as c FROM orders WHERE DATE(created_at) = DATE('now')").get().c;
  const todayRevenue = db.prepare("SELECT COALESCE(SUM(total), 0) as s FROM orders WHERE DATE(created_at) = DATE('now') AND status != 'cancelled'").get().s;
  const pendingOrders = db.prepare("SELECT COUNT(*) as c FROM orders WHERE status IN ('pending', 'confirmed', 'packed', 'out_for_delivery')").get().c;
  const inventoryCount = db.prepare("SELECT COUNT(*) as c FROM inventory WHERE active = 1").get().c;
  const lowStockItems = db.prepare("SELECT COUNT(*) as c FROM inventory WHERE stock < 10 AND active = 1").get().c;

  const topProducts = db.prepare(`
    SELECT oi.item_name, SUM(oi.quantity) as total_qty, SUM(oi.total_price) as total_revenue
    FROM order_items oi
    JOIN orders o ON oi.order_id = o.id
    WHERE o.status != 'cancelled'
    GROUP BY oi.item_name
    ORDER BY total_qty DESC
    LIMIT 10
  `).all();

  const recentOrders = db.prepare("SELECT * FROM orders ORDER BY created_at DESC LIMIT 10").all();

  return {
    totalCustomers, totalOrders, totalRevenue, totalSavings,
    todayOrders, todayRevenue, pendingOrders,
    inventoryCount, lowStockItems, topProducts, recentOrders,
  };
}

function getTotalSavings() {
  return db.prepare(`
    SELECT 
      COALESCE(SUM(savings_vs_quickcommerce), 0) as total_savings,
      COUNT(*) as total_orders,
      COALESCE(AVG(savings_vs_quickcommerce), 0) as avg_savings_per_order
    FROM orders WHERE status != 'cancelled'
  `).get();
}


// ─── Export all functions ────────────────────────────────────────
module.exports = {
  initialize, upsertCustomer, getCustomer, getAllCustomers, getActiveCustomers,
  getCustomerStats, getCustomersDueForReminder, updateLastReminder,
  createOrder, getOrder, getLastOrder, getOrderHistory, getAllOrders, updateOrderStatus,
  getInventory, addInventoryItem, updateInventoryItem, deleteInventoryItem, findInventoryByName,
  saveConversation, getConversationHistory,
  getDashboardStats, getTotalSavings,
};
