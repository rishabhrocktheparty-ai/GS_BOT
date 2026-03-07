// ═══════════════════════════════════════════════════════════════════
// REE Bot — WhatsApp Business API Service
// Handles: Sending messages, media, interactive buttons, templates
// ═══════════════════════════════════════════════════════════════════

const axios = require("axios");
const config = require("../config/config");

const WA_BASE_URL = `https://graph.facebook.com/${config.WHATSAPP_API_VERSION}`;
const WA_MESSAGES_URL = `${WA_BASE_URL}/${config.WHATSAPP_PHONE_NUMBER_ID}/messages`;

const headers = {
  Authorization: `Bearer ${config.WHATSAPP_ACCESS_TOKEN}`,
  "Content-Type": "application/json",
};


// ═══════════════════════════════════════════════════════════════════
// SEND TEXT MESSAGE
// ═══════════════════════════════════════════════════════════════════

async function sendTextMessage(to, text) {
  try {
    const response = await axios.post(WA_MESSAGES_URL, {
      messaging_product: "whatsapp",
      recipient_type: "individual",
      to,
      type: "text",
      text: { preview_url: false, body: text },
    }, { headers });

    console.log(`✅ Message sent to ${to}`);
    return response.data;
  } catch (error) {
    console.error(`❌ Failed to send message to ${to}:`, error.response?.data || error.message);
    throw error;
  }
}


// ═══════════════════════════════════════════════════════════════════
// SEND INTERACTIVE BUTTONS (Quick Reply)
// ═══════════════════════════════════════════════════════════════════

async function sendButtonMessage(to, bodyText, buttons) {
  // buttons: [{ id: "btn_1", title: "Yes" }, { id: "btn_2", title: "No" }]
  // Max 3 buttons, title max 20 chars
  try {
    const response = await axios.post(WA_MESSAGES_URL, {
      messaging_product: "whatsapp",
      recipient_type: "individual",
      to,
      type: "interactive",
      interactive: {
        type: "button",
        body: { text: bodyText },
        action: {
          buttons: buttons.map((btn) => ({
            type: "reply",
            reply: { id: btn.id, title: btn.title.substring(0, 20) },
          })),
        },
      },
    }, { headers });

    return response.data;
  } catch (error) {
    console.error(`❌ Button message failed:`, error.response?.data || error.message);
    // Fallback to text message
    return sendTextMessage(to, bodyText);
  }
}


// ═══════════════════════════════════════════════════════════════════
// SEND LIST MESSAGE (Menu)
// ═══════════════════════════════════════════════════════════════════

async function sendListMessage(to, bodyText, buttonTitle, sections) {
  // sections: [{ title: "Category", rows: [{ id: "1", title: "Item", description: "..." }] }]
  try {
    const response = await axios.post(WA_MESSAGES_URL, {
      messaging_product: "whatsapp",
      recipient_type: "individual",
      to,
      type: "interactive",
      interactive: {
        type: "list",
        body: { text: bodyText },
        action: {
          button: buttonTitle.substring(0, 20),
          sections: sections.map((s) => ({
            title: s.title.substring(0, 24),
            rows: s.rows.map((r) => ({
              id: r.id,
              title: r.title.substring(0, 24),
              description: r.description ? r.description.substring(0, 72) : undefined,
            })),
          })),
        },
      },
    }, { headers });

    return response.data;
  } catch (error) {
    console.error(`❌ List message failed:`, error.response?.data || error.message);
    return sendTextMessage(to, bodyText);
  }
}


// ═══════════════════════════════════════════════════════════════════
// SEND IMAGE MESSAGE
// ═══════════════════════════════════════════════════════════════════

async function sendImageMessage(to, imageUrl, caption) {
  try {
    const response = await axios.post(WA_MESSAGES_URL, {
      messaging_product: "whatsapp",
      recipient_type: "individual",
      to,
      type: "image",
      image: {
        link: imageUrl,
        caption: caption || "",
      },
    }, { headers });

    return response.data;
  } catch (error) {
    console.error(`❌ Image message failed:`, error.response?.data || error.message);
    throw error;
  }
}


// ═══════════════════════════════════════════════════════════════════
// SEND AUDIO MESSAGE (Voice Note)
// ═══════════════════════════════════════════════════════════════════

async function sendAudioMessage(to, audioUrl) {
  try {
    const response = await axios.post(WA_MESSAGES_URL, {
      messaging_product: "whatsapp",
      recipient_type: "individual",
      to,
      type: "audio",
      audio: { link: audioUrl },
    }, { headers });

    return response.data;
  } catch (error) {
    console.error(`❌ Audio message failed:`, error.response?.data || error.message);
    throw error;
  }
}


// ═══════════════════════════════════════════════════════════════════
// SEND DOCUMENT (Receipt/Invoice)
// ═══════════════════════════════════════════════════════════════════

async function sendDocumentMessage(to, documentUrl, filename, caption) {
  try {
    const response = await axios.post(WA_MESSAGES_URL, {
      messaging_product: "whatsapp",
      recipient_type: "individual",
      to,
      type: "document",
      document: {
        link: documentUrl,
        filename: filename || "document.pdf",
        caption: caption || "",
      },
    }, { headers });

    return response.data;
  } catch (error) {
    console.error(`❌ Document message failed:`, error.response?.data || error.message);
    throw error;
  }
}


// ═══════════════════════════════════════════════════════════════════
// SEND LOCATION MESSAGE
// ═══════════════════════════════════════════════════════════════════

async function sendLocationMessage(to, latitude, longitude, name, address) {
  try {
    const response = await axios.post(WA_MESSAGES_URL, {
      messaging_product: "whatsapp",
      recipient_type: "individual",
      to,
      type: "location",
      location: { latitude, longitude, name, address },
    }, { headers });

    return response.data;
  } catch (error) {
    console.error(`❌ Location message failed:`, error.response?.data || error.message);
    throw error;
  }
}


// ═══════════════════════════════════════════════════════════════════
// SEND TEMPLATE MESSAGE (for proactive outreach)
// ═══════════════════════════════════════════════════════════════════

async function sendTemplateMessage(to, templateName, languageCode, components) {
  try {
    const response = await axios.post(WA_MESSAGES_URL, {
      messaging_product: "whatsapp",
      recipient_type: "individual",
      to,
      type: "template",
      template: {
        name: templateName,
        language: { code: languageCode || "en" },
        components: components || [],
      },
    }, { headers });

    return response.data;
  } catch (error) {
    console.error(`❌ Template message failed:`, error.response?.data || error.message);
    throw error;
  }
}


// ═══════════════════════════════════════════════════════════════════
// MARK MESSAGE AS READ
// ═══════════════════════════════════════════════════════════════════

async function markAsRead(messageId) {
  try {
    await axios.post(WA_MESSAGES_URL, {
      messaging_product: "whatsapp",
      status: "read",
      message_id: messageId,
    }, { headers });
  } catch (error) {
    // Non-critical, just log
    console.warn("⚠️ Could not mark as read:", error.message);
  }
}


// ═══════════════════════════════════════════════════════════════════
// TYPING INDICATOR
// ═══════════════════════════════════════════════════════════════════

async function sendTypingIndicator(to) {
  try {
    await axios.post(WA_MESSAGES_URL, {
      messaging_product: "whatsapp",
      recipient_type: "individual",
      to,
      type: "reaction",
    }, { headers });
  } catch (error) {
    // Non-critical
  }
}


// ═══════════════════════════════════════════════════════════════════
// MEDIA HANDLING — Download received media
// ═══════════════════════════════════════════════════════════════════

async function getMediaUrl(mediaId) {
  try {
    const response = await axios.get(`${WA_BASE_URL}/${mediaId}`, { headers });
    return response.data.url;
  } catch (error) {
    console.error(`❌ Failed to get media URL:`, error.response?.data || error.message);
    throw error;
  }
}

async function downloadMedia(url) {
  try {
    const response = await axios.get(url, {
      headers: { Authorization: `Bearer ${config.WHATSAPP_ACCESS_TOKEN}` },
      responseType: "arraybuffer",
    });
    return Buffer.from(response.data);
  } catch (error) {
    console.error(`❌ Failed to download media:`, error.message);
    throw error;
  }
}


// ═══════════════════════════════════════════════════════════════════
// WELCOME MESSAGE WITH INTERACTIVE BUTTONS
// ═══════════════════════════════════════════════════════════════════

async function sendWelcomeMessage(to, customerName) {
  const isReturning = customerName && customerName !== "Customer";

  if (isReturning) {
    await sendButtonMessage(to,
      `Welcome back, ${customerName}! 😊 Great to see you again at GRIH SANSAR.\n\nHow can I help you today?`,
      [
        { id: "reorder", title: "🔁 Reorder" },
        { id: "new_order", title: "🛒 New Order" },
        { id: "deals", title: "🌟 Today's Deals" },
      ]
    );
  } else {
    await sendButtonMessage(to,
      `Hello! 😊 Welcome to GRIH SANSAR — your neighbourhood store, now on WhatsApp.\n\nI'm REE, your shopping companion. I help you shop smarter and save money!\n\nWhat would you like to do?`,
      [
        { id: "new_order", title: "🛒 Order Groceries" },
        { id: "deals", title: "🌟 Today's Deals" },
        { id: "recipes", title: "🍳 Quick Recipes" },
      ]
    );
  }
}


// ═══════════════════════════════════════════════════════════════════
// ORDER CONFIRMATION WITH BUTTONS
// ═══════════════════════════════════════════════════════════════════

async function sendOrderConfirmation(to, basketSummary, total) {
  await sendButtonMessage(to,
    `${basketSummary}\n\n💰 Grand Total: ₹${total}\n🚚 ${total >= config.FREE_DELIVERY_THRESHOLD ? "Free Delivery!" : `Delivery: ₹${config.DELIVERY_CHARGE}`}\n\nShall I confirm this order?`,
    [
      { id: "confirm_order", title: "✅ Confirm Order" },
      { id: "modify_order", title: "✏️ Modify" },
      { id: "cancel_order", title: "❌ Cancel" },
    ]
  );
}


// ═══════════════════════════════════════════════════════════════════
// PRODUCT CATEGORY MENU
// ═══════════════════════════════════════════════════════════════════

async function sendCategoryMenu(to) {
  await sendListMessage(to,
    "Browse our store categories 🏪\n\nTap below to explore:",
    "Browse Store",
    [
      {
        title: "Groceries",
        rows: [
          { id: "cat_staples", title: "🌾 Staples", description: "Atta, Rice, Dal, Oil, Sugar" },
          { id: "cat_dairy", title: "🥛 Dairy & Eggs", description: "Milk, Paneer, Butter, Eggs" },
          { id: "cat_spices", title: "🌶️ Spices", description: "Haldi, Mirch, Masala" },
          { id: "cat_fresh", title: "🥬 Fresh Produce", description: "Vegetables & Fruits" },
        ],
      },
      {
        title: "More",
        rows: [
          { id: "cat_snacks", title: "🍪 Snacks", description: "Biscuits, Chips, Namkeen" },
          { id: "cat_beverages", title: "☕ Beverages", description: "Tea, Coffee, Juice" },
          { id: "cat_cleaning", title: "🧹 Cleaning", description: "Detergent, Floor Cleaner" },
          { id: "cat_personal", title: "🧴 Personal Care", description: "Soap, Shampoo, Toothpaste" },
        ],
      },
    ]
  );
}


module.exports = {
  sendTextMessage, sendButtonMessage, sendListMessage,
  sendImageMessage, sendAudioMessage, sendDocumentMessage,
  sendLocationMessage, sendTemplateMessage,
  markAsRead, sendTypingIndicator,
  getMediaUrl, downloadMedia,
  sendWelcomeMessage, sendOrderConfirmation, sendCategoryMenu,
};
