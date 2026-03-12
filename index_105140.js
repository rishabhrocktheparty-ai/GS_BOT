// ============================================================
// REE — WhatsApp Shopping Companion
// GRIH SANSAR DEPARTMENTAL STORE
// "Think Before You Blink."
// ============================================================

require('dotenv').config();
const express = require('express');
const pino = require('pino');
const { connectToWhatsApp } = require('./src/whatsapp');
const { validateEnv } = require('./src/utils/env');
const logger = require('./src/utils/logger');

// ── Validate environment before anything else ──
validateEnv();

// ── Express server (health check + QR display) ──
const app = express();
const PORT = process.env.PORT || 10000;

// Shared state for QR and bot status
const botState = {
    qr: '',
    status: 'Starting...',
    connectedAt: null,
    messagesHandled: 0,
};

// Export so whatsapp module can update it
module.exports = { botState };

// Health check / QR display
app.get('/', (req, res) => {
    if (botState.status === 'Ready') {
        res.send(`
            <div style="text-align:center; font-family:Arial; margin-top:50px;">
                <h1 style="color:#1B4332;">✅ GRIH SANSAR Bot — ONLINE</h1>
                <p style="color:#2D6A4F;">REE is ready and listening.</p>
                <p style="color:#6C757D; font-size:14px;">Connected since: ${botState.connectedAt || 'N/A'}</p>
                <p style="color:#6C757D; font-size:14px;">Messages handled: ${botState.messagesHandled}</p>
                <br><p style="color:#999; font-style:italic;">"Think Before You Blink."</p>
            </div>
        `);
    } else if (botState.qr) {
        res.send(`
            <div style="text-align:center; font-family:Arial; margin-top:50px;">
                <h2 style="color:#1B4332;">📱 Scan QR to Connect REE</h2>
                <p style="color:#6C757D;">Open WhatsApp → Linked Devices → Scan this code</p>
                <img src="https://api.qrserver.com/v1/create-qr-code/?size=300x300&data=${encodeURIComponent(botState.qr)}" 
                     style="border: 5px solid #25d366; border-radius: 10px; margin-top:20px;" />
                <br><br><p style="color:#999; font-style:italic;">"Think Before You Blink."</p>
            </div>
        `);
    } else {
        res.send(`
            <div style="text-align:center; font-family:Arial; margin-top:50px;">
                <h2 style="color:#F4A261;">⏳ ${botState.status}</h2>
                <p style="color:#6C757D;">Please wait...</p>
            </div>
        `);
    }
});

// Health endpoint for monitoring
app.get('/health', (req, res) => {
    res.json({ 
        status: botState.status, 
        uptime: process.uptime(),
        messages: botState.messagesHandled 
    });
});

app.listen(PORT, () => {
    logger.info(`Server running on port ${PORT}`);
});

// ── Start WhatsApp connection ──
connectToWhatsApp();

// ── Self-ping to keep Render alive ──
const RENDER_URL = process.env.RENDER_EXTERNAL_HOSTNAME;
if (RENDER_URL) {
    setInterval(() => {
        fetch(`https://${RENDER_URL}/health`).catch(() => {});
    }, 10 * 60 * 1000); // Every 10 minutes
}

// ── Graceful shutdown ──
process.on('SIGTERM', () => {
    logger.info('SIGTERM received. Shutting down gracefully...');
    process.exit(0);
});

process.on('unhandledRejection', (err) => {
    logger.error('Unhandled rejection:', err.message);
});
