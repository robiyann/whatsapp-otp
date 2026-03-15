require('dotenv').config();
const express = require('express');
const fetch = require('node-fetch');
const fs = require('fs');
const path = require('path');

const app = express();
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// ==================== CONFIG ====================
const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const PORT = process.env.PORT || 3200;
const FILTER_NUMBERS = process.env.FILTER_NUMBERS
  ? process.env.FILTER_NUMBERS.split(',').map(n => n.trim())
  : [];

// ==================== SUBSCRIBERS ====================
const SUBSCRIBERS_FILE = path.join(__dirname, 'subscribers.json');
const LOG_FILE = path.join(__dirname, 'messages.log');

function loadSubscribers() {
  try {
    if (fs.existsSync(SUBSCRIBERS_FILE)) {
      return JSON.parse(fs.readFileSync(SUBSCRIBERS_FILE, 'utf-8'));
    }
  } catch (err) {
    console.error('⚠️ Error loading subscribers:', err.message);
  }
  return {};
}

function saveSubscribers(subs) {
  fs.writeFileSync(SUBSCRIBERS_FILE, JSON.stringify(subs, null, 2));
}

// { chatId: { username, firstName, subscribedAt } }
let subscribers = loadSubscribers();

// ==================== LOG ====================
function logMessage(data) {
  const timestamp = new Date().toISOString();
  const logEntry = `[${timestamp}] From: ${data.sender || 'Unknown'} | Message: ${data.text || 'N/A'}\n`;
  fs.appendFileSync(LOG_FILE, logEntry);
  console.log(logEntry.trim());
}

// ==================== TELEGRAM SEND ====================
async function sendToTelegram(chatId, text) {
  try {
    const url = `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`;
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: chatId,
        text: text,
        parse_mode: 'HTML',
      }),
    });
    const result = await res.json();
    if (!result.ok) {
      console.error(`❌ Telegram error (chat ${chatId}):`, result.description);
      return false;
    }
    return true;
  } catch (err) {
    console.error(`❌ Send failed (chat ${chatId}):`, err.message);
    return false;
  }
}

// Broadcast to ALL subscribers
async function broadcastToSubscribers(text) {
  const chatIds = Object.keys(subscribers);
  if (chatIds.length === 0) {
    console.log('⚠️ Tidak ada subscriber. Kirim /start ke bot untuk subscribe.');
    return 0;
  }

  let successCount = 0;
  for (const chatId of chatIds) {
    const sent = await sendToTelegram(chatId, text);
    if (sent) successCount++;
  }

  console.log(`✅ Broadcast ke ${successCount}/${chatIds.length} subscriber`);
  return successCount;
}

// ==================== EXTRACT OTP ====================
function extractOTP(text) {
  if (!text) return null;

  // Pattern 1: "123456 is your verification code" (angka di awal)
  const pattern1 = text.match(/^\s*(\d{4,8})\s+(?:is your|adalah)/i);
  if (pattern1) return pattern1[1];

  // Pattern 2: "Your code is 123456" / "kode: 123456"
  const pattern2 = text.match(/(?:code|kode|OTP|pin|verifikasi|verification)[:\s]+(?:is\s+)?(\d{4,8})\b/i);
  if (pattern2) return pattern2[1];

  // Pattern 3: Any standalone 4-8 digit number in the message
  const pattern3 = text.match(/\b(\d{4,8})\b/);
  if (pattern3) return pattern3[1];

  return null;
}

// ==================== FORMAT OTP MESSAGE ====================
function formatOTPMessage(sender, otp) {
  const time = new Date().toLocaleString('id-ID', { timeZone: 'Asia/Jakarta' });
  return `🔑 <code>${otp}</code>\n👤 ${sender} • ${time}`;
}

// ==================== FILTER CHECK ====================
function shouldForward(sender) {
  if (FILTER_NUMBERS.length === 0) return true;
  return FILTER_NUMBERS.some(num => {
    if (!sender) return false;
    return sender.includes(num) || num.includes(sender);
  });
}

// ==================== TELEGRAM BOT POLLING ====================
let lastUpdateId = 0;

async function pollTelegramUpdates() {
  if (!TELEGRAM_BOT_TOKEN || TELEGRAM_BOT_TOKEN === 'your_bot_token_here') return;

  try {
    const url = `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/getUpdates?offset=${lastUpdateId + 1}&timeout=5`;
    const res = await fetch(url);
    const data = await res.json();

    if (!data.ok || !data.result) return;

    for (const update of data.result) {
      lastUpdateId = update.update_id;
      const msg = update.message;
      if (!msg || !msg.text) continue;

      const chatId = String(msg.chat.id);
      const username = msg.from.username || '';
      const firstName = msg.from.first_name || '';
      const command = msg.text.trim().toLowerCase();

      if (command === '/start') {
        subscribers[chatId] = {
          username,
          firstName,
          subscribedAt: new Date().toISOString(),
        };
        saveSubscribers(subscribers);
        console.log(`✅ New subscriber: ${firstName} (@${username}) [${chatId}]`);
        await sendToTelegram(chatId,
          `✅ <b>Subscribed!</b>\n\n` +
          `Kamu akan menerima forward pesan WhatsApp.\n\n` +
          `<b>Commands:</b>\n` +
          `/start - Subscribe\n` +
          `/stop - Unsubscribe\n` +
          `/status - Cek status`
        );
      } else if (command === '/stop') {
        delete subscribers[chatId];
        saveSubscribers(subscribers);
        console.log(`🔴 Unsubscribed: ${firstName} (@${username}) [${chatId}]`);
        await sendToTelegram(chatId, `🔴 <b>Unsubscribed.</b>\nKamu tidak akan menerima forward pesan lagi.\nKirim /start untuk subscribe kembali.`);
      } else if (command === '/status') {
        const subCount = Object.keys(subscribers).length;
        const isSubscribed = !!subscribers[chatId];
        await sendToTelegram(chatId,
          `📊 <b>Status</b>\n\n` +
          `🔔 Kamu: ${isSubscribed ? '✅ Subscribed' : '❌ Not subscribed'}\n` +
          `👥 Total subscribers: ${subCount}\n` +
          `🟢 Server: Online`
        );
      }
    }
  } catch (err) {
    // Silently handle polling errors
  }
}

// Start polling every 3 seconds
setInterval(pollTelegramUpdates, 3000);

// ==================== WEBHOOK ENDPOINT ====================
app.post('/webhook', async (req, res) => {
  try {
    console.log('\n📩 Webhook received:', JSON.stringify(req.body, null, 2));

    const data = req.body;
    const sender = data.sender || data.title || data.from || '';
    const text = data.text || data.message || data.content || '';

    if (!text) {
      console.log('⚠️ Pesan kosong, skip.');
      return res.json({ status: 'skipped', reason: 'empty message' });
    }

    if (!shouldForward(sender)) {
      console.log(`⚠️ Sender "${sender}" tidak di filter, skip.`);
      return res.json({ status: 'skipped', reason: 'filtered out' });
    }

    // Extract OTP — skip jika tidak ada OTP
    const otp = extractOTP(text);
    if (!otp) {
      console.log('⚠️ Tidak ada OTP terdeteksi, skip.');
      return res.json({ status: 'skipped', reason: 'no OTP detected' });
    }

    console.log(`🔑 OTP detected: ${otp} from ${sender}`);
    logMessage({ sender, text: `OTP: ${otp}` });

    const formatted = formatOTPMessage(sender, otp);
    const sentCount = await broadcastToSubscribers(formatted);

    return res.json({
      status: sentCount > 0 ? 'forwarded' : 'no_subscribers',
      otp,
      sender,
      sentTo: sentCount,
      timestamp: new Date().toISOString(),
    });
  } catch (err) {
    console.error('❌ Error processing webhook:', err.message);
    return res.status(500).json({ status: 'error', message: err.message });
  }
});

// ==================== GET ENDPOINT (alternative) ====================
app.get('/forward', async (req, res) => {
  try {
    const sender = req.query.sender || req.query.from || 'Unknown';
    const text = req.query.text || req.query.message || '';

    if (!text) return res.json({ status: 'skipped', reason: 'empty message' });
    if (!shouldForward(sender)) return res.json({ status: 'skipped', reason: 'filtered out' });

    const otp = extractOTP(text);
    if (!otp) return res.json({ status: 'skipped', reason: 'no OTP detected' });

    logMessage({ sender, text: `OTP: ${otp}` });
    const formatted = formatOTPMessage(sender, otp);
    const sentCount = await broadcastToSubscribers(formatted);

    return res.json({ status: sentCount > 0 ? 'forwarded' : 'no_subscribers', otp, sentTo: sentCount });
  } catch (err) {
    return res.status(500).json({ status: 'error', message: err.message });
  }
});

// ==================== HEALTH CHECK ====================
app.get('/', (req, res) => {
  res.json({
    status: 'running',
    service: 'WA Chat Forwarder',
    subscribers: Object.keys(subscribers).length,
    uptime: process.uptime(),
    endpoints: {
      webhook: 'POST /webhook { sender, text }',
      forward: 'GET /forward?sender=xxx&text=xxx',
      logs: 'GET /logs',
    },
  });
});

// ==================== VIEW LOGS ====================
app.get('/logs', (req, res) => {
  try {
    if (!fs.existsSync(LOG_FILE)) return res.json({ logs: [] });
    const logs = fs.readFileSync(LOG_FILE, 'utf-8').split('\n').filter(Boolean).slice(-50);
    return res.json({ count: logs.length, logs });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

// ==================== START ====================
app.listen(PORT, () => {
  console.log(`\n🚀 WA Chat Forwarder running on port ${PORT}`);
  console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
  console.log(`📌 Webhook:  http://YOUR_IP:${PORT}/webhook`);
  console.log(`📌 Forward:  http://YOUR_IP:${PORT}/forward?sender=xxx&text=xxx`);
  console.log(`📌 Health:   http://YOUR_IP:${PORT}/`);
  console.log(`📌 Logs:     http://YOUR_IP:${PORT}/logs`);
  console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
  console.log(`👥 Subscribers: ${Object.keys(subscribers).length}`);
  if (FILTER_NUMBERS.length > 0) {
    console.log(`🔍 Filter: ${FILTER_NUMBERS.join(', ')}`);
  } else {
    console.log(`🔍 Filter: OFF (forward semua)`);
  }
  console.log(`\n💡 Siapa saja bisa /start bot Telegram untuk menerima forward.`);
  console.log(`   Tidak perlu set Chat ID manual!\n`);
});
