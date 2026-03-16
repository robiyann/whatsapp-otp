require('dotenv').config();

const crypto = require('crypto');
const express = require('express');
const fetch = require('node-fetch');

const { Store } = require('./lib/store');
const {
  escapeHtml,
  renderLoginPage,
  renderDashboard,
  renderUsersPage,
  renderNumbersPage,
  renderLogsPage,
} = require('./lib/admin-ui');

const app = express();
const store = new Store();

app.use(express.json({ limit: '100kb' }));
app.use(express.urlencoded({ extended: true, limit: '100kb' }));

const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN || '';
const PORT = Number(process.env.PORT || 3200);
const ADMIN_USERNAME = process.env.ADMIN_USERNAME || 'admin';
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'admin123';
const ADMIN_TELEGRAM_IDS = (process.env.ADMIN_TELEGRAM_IDS || '')
  .split(',')
  .map(value => value.trim())
  .filter(Boolean);
const WEBHOOK_SECRET = process.env.WEBHOOK_SECRET || '';
const SESSION_TTL_MS = 1000 * 60 * 60 * 12;
const sessions = new Map();

function createSession() {
  const token = crypto.randomBytes(24).toString('hex');
  sessions.set(token, {
    createdAt: Date.now(),
    expiresAt: Date.now() + SESSION_TTL_MS,
  });
  return token;
}

function getSession(token) {
  const session = sessions.get(token);
  if (!session) return null;
  if (session.expiresAt < Date.now()) {
    sessions.delete(token);
    return null;
  }
  session.expiresAt = Date.now() + SESSION_TTL_MS;
  return session;
}

function destroySession(token) {
  if (token) sessions.delete(token);
}

function parseCookies(cookieHeader) {
  return String(cookieHeader || '')
    .split(';')
    .map(part => part.trim())
    .filter(Boolean)
    .reduce((cookies, part) => {
      const index = part.indexOf('=');
      if (index === -1) return cookies;
      const key = part.slice(0, index);
      const value = part.slice(index + 1);
      cookies[key] = decodeURIComponent(value);
      return cookies;
    }, {});
}

function setCookie(res, name, value, options = {}) {
  const pieces = [`${name}=${encodeURIComponent(value)}`];
  if (options.maxAge !== undefined) pieces.push(`Max-Age=${options.maxAge}`);
  pieces.push(`Path=${options.path || '/'}`);
  if (options.httpOnly !== false) pieces.push('HttpOnly');
  if (options.sameSite) pieces.push(`SameSite=${options.sameSite}`);
  const existing = res.getHeader('Set-Cookie');
  const nextValue = pieces.join('; ');
  if (!existing) {
    res.setHeader('Set-Cookie', nextValue);
    return;
  }
  if (Array.isArray(existing)) {
    res.setHeader('Set-Cookie', [...existing, nextValue]);
    return;
  }
  res.setHeader('Set-Cookie', [existing, nextValue]);
}

function clearCookie(res, name) {
  setCookie(res, name, '', { maxAge: 0, sameSite: 'Lax' });
}

function withFlash(req, res, next) {
  const cookies = parseCookies(req.headers.cookie);
  if (cookies.flash) {
    req.flash = cookies.flash;
    clearCookie(res, 'flash');
  } else {
    req.flash = '';
  }
  next();
}

function setFlash(res, message) {
  setCookie(res, 'flash', message, { maxAge: 15, sameSite: 'Lax' });
}

function requireAdmin(req, res, next) {
  const cookies = parseCookies(req.headers.cookie);
  const token = cookies.admin_session;
  if (!token || !getSession(token)) {
    return res.redirect('/admin/login');
  }
  req.adminSession = token;
  return next();
}

function normalizeKey(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '');
}

function identifyNumber(numberKey, sender) {
  const normalizedNumberKey = normalizeKey(numberKey);
  const normalizedSender = normalizeKey(sender);
  const candidates = store.listNumbers().filter(number => number.isActive);

  if (normalizedNumberKey) {
    const byNumberKey = candidates.find(number => normalizeKey(number.numberKey) === normalizedNumberKey);
    if (byNumberKey) return byNumberKey;
  }

  return candidates.find(number => {
    const senderKey = normalizeKey(number.senderKey);
    if (!senderKey) return false;
    return normalizedSender === senderKey
      || normalizedSender.includes(senderKey)
      || senderKey.includes(normalizedSender);
  }) || null;
}

function extractOTP(text) {
  if (!text) return null;

  const pattern1 = text.match(/^\s*(\d{4,8})\s+(?:is your|adalah)/i);
  if (pattern1) return pattern1[1];

  const pattern2 = text.match(/(?:otp|code|kode|pin|verifikasi|verification)\D{0,12}(\d{4,8})\b/i);
  if (pattern2) return pattern2[1];

  return null;
}

function formatOTPMessage(number, sender, otp) {
  const time = new Date().toLocaleString('id-ID', { timeZone: 'Asia/Bangkok' });
  const safeLabel = escapeHtml(number ? number.label : sender || 'Unknown number');
  const safeNumberKey = escapeHtml(number ? number.numberKey : '-');
  const safeSender = escapeHtml(sender || '-');
  const safeOtp = escapeHtml(otp || '');

  return [
    `<b>${safeLabel}</b>`,
    `Number: ${safeNumberKey}`,
    `OTP: <code>${safeOtp}</code>`,
    `Sender: ${safeSender}`,
    `Waktu: ${escapeHtml(time)}`,
  ].join('\n');
}

async function sendToTelegram(chatId, text) {
  if (!TELEGRAM_BOT_TOKEN || TELEGRAM_BOT_TOKEN === 'your_bot_token_here') {
    return false;
  }

  try {
    const response = await fetch(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: chatId,
        text,
        parse_mode: 'HTML',
      }),
    });

    const result = await response.json();
    if (!result.ok) {
      console.error(`Telegram send failed for ${chatId}:`, result.description);
      return false;
    }

    return true;
  } catch (error) {
    console.error(`Telegram send failed for ${chatId}:`, error.message);
    return false;
  }
}

function ensureAdminSeed() {
  for (const chatId of ADMIN_TELEGRAM_IDS) {
    store.upsertTelegramUser({
      telegramChatId: chatId,
      username: '',
      isAdmin: true,
      isActive: true,
    });
  }
}

async function routeOtp({ numberKey, sender, text, source }) {
  const otp = extractOTP(text);
  if (!otp) {
    return { status: 'skipped', reason: 'no OTP detected' };
  }

  const number = identifyNumber(numberKey, sender);
  if (!number) {
    store.logOtp({
      numberKey,
      sender,
      otp,
      rawText: text,
      status: 'unassigned_number',
      deliveryCount: 0,
      deliveredTo: [],
    });
    return { status: 'skipped', reason: 'unknown sender', otp };
  }

  const recipients = store.getUsersForNumber(number.id);
  if (recipients.length === 0) {
    store.logOtp({
      numberId: number.id,
      numberLabel: number.label,
      numberKey: number.numberKey,
      sender,
      otp,
      rawText: text,
      status: 'no_assigned_users',
      deliveryCount: 0,
      deliveredTo: [],
    });
    return { status: 'no_recipients', number: number.label, otp };
  }

  const formatted = formatOTPMessage(number, sender, otp);
  const deliveredTo = [];

  for (const user of recipients) {
    const sent = await sendToTelegram(user.telegramChatId, formatted);
    if (sent) deliveredTo.push(user.telegramChatId);
  }

    store.logOtp({
      numberId: number.id,
      numberLabel: number.label,
      numberKey: number.numberKey,
      sender,
      otp,
    rawText: text,
    status: deliveredTo.length > 0 ? 'forwarded' : 'send_failed',
    deliveryCount: deliveredTo.length,
    deliveredTo,
    source,
  });

  return {
    status: deliveredTo.length > 0 ? 'forwarded' : 'send_failed',
    otp,
    number: number.label,
    numberKey: number.numberKey,
    sender,
    sentTo: deliveredTo.length,
    recipients: deliveredTo,
  };
}

function webhookAuthorized(req) {
  if (!WEBHOOK_SECRET) return true;
  const headerSecret = req.headers['x-webhook-secret'];
  const bodySecret = req.body && req.body.secret;
  const querySecret = req.query && req.query.secret;
  return [headerSecret, bodySecret, querySecret].some(secret => secret === WEBHOOK_SECRET);
}

function sanitizeText(value) {
  return String(value || '').trim();
}

function parseBoolean(value) {
  return String(value) === 'true';
}

function metrics() {
  const users = store.listUsers();
  const numbers = store.listNumbers();
  return {
    activeUsers: users.filter(user => user.isActive).length,
    activeNumbers: numbers.filter(number => number.isActive).length,
    assignments: store.getAssignments().length,
    otpLogs: store.listOtpLogs(500).length,
  };
}

ensureAdminSeed();

app.use(withFlash);

app.get('/admin/login', (req, res) => {
  res.send(renderLoginPage({ error: req.flash }));
});

app.post('/admin/login', (req, res) => {
  const username = sanitizeText(req.body.username);
  const password = sanitizeText(req.body.password);

  if (username !== ADMIN_USERNAME || password !== ADMIN_PASSWORD) {
    return res.send(renderLoginPage({ error: 'Username atau password salah.' }));
  }

  const session = createSession();
  setCookie(res, 'admin_session', session, {
    maxAge: Math.floor(SESSION_TTL_MS / 1000),
    sameSite: 'Lax',
  });
  return res.redirect('/admin');
});

app.post('/admin/logout', (req, res) => {
  const cookies = parseCookies(req.headers.cookie);
  destroySession(cookies.admin_session);
  clearCookie(res, 'admin_session');
  return res.redirect('/admin/login');
});

app.get('/admin', requireAdmin, (req, res) => {
  res.send(renderDashboard({
    flash: req.flash,
    metrics: metrics(),
    recentLogs: store.listOtpLogs(8),
  }));
});

app.get('/admin/users', requireAdmin, (req, res) => {
  const users = store.listUsers();
  const numberMap = users.reduce((acc, user) => {
    acc[user.id] = store.getNumbersForUser(user.id);
    return acc;
  }, {});

  res.send(renderUsersPage({
    flash: req.flash,
    users,
    numberMap,
  }));
});

app.post('/admin/users', requireAdmin, (req, res) => {
  const telegramChatId = sanitizeText(req.body.telegramChatId);

  if (!telegramChatId) {
    setFlash(res, 'Telegram Chat ID wajib diisi.');
    return res.redirect('/admin/users');
  }

  store.createUser({
    telegramChatId,
    username: sanitizeText(req.body.username),
    isAdmin: parseBoolean(req.body.isAdmin),
    isActive: parseBoolean(req.body.isActive),
  });

  setFlash(res, 'User berhasil disimpan.');
  return res.redirect('/admin/users');
});

app.post('/admin/users/:id/toggle', requireAdmin, (req, res) => {
  const user = store.getUserById(req.params.id);
  if (user) {
    store.updateUser(user.id, { isActive: !user.isActive });
    setFlash(res, 'Status user diperbarui.');
  }
  return res.redirect('/admin/users');
});

app.post('/admin/users/:id/delete', requireAdmin, (req, res) => {
  store.deleteUser(req.params.id);
  setFlash(res, 'User dihapus.');
  return res.redirect('/admin/users');
});

app.get('/admin/numbers', requireAdmin, (req, res) => {
  const numbers = store.listNumbers();
  const userMap = numbers.reduce((acc, number) => {
    acc[number.id] = store.getUsersForNumber(number.id);
    return acc;
  }, {});

  res.send(renderNumbersPage({
    flash: req.flash,
    numbers,
    users: store.listUsers().filter(user => !user.isAdmin),
    userMap,
  }));
});

app.post('/admin/numbers', requireAdmin, (req, res) => {
  const label = sanitizeText(req.body.label);
  const numberKey = sanitizeText(req.body.numberKey);
  const senderKey = sanitizeText(req.body.senderKey);

  if (!label || !numberKey) {
    setFlash(res, 'Label dan number key wajib diisi.');
    return res.redirect('/admin/numbers');
  }

  try {
    const number = store.createNumber({
      label,
      numberKey,
      senderKey,
      description: sanitizeText(req.body.description),
      isActive: parseBoolean(req.body.isActive),
    });
    store.replaceNumberAccess(number.id, [].concat(req.body.userIds || []).map(sanitizeText));
  } catch (error) {
    setFlash(res, `Gagal menyimpan nomor: ${error.message}`);
    return res.redirect('/admin/numbers');
  }

  setFlash(res, 'Nomor OTP berhasil disimpan.');
  return res.redirect('/admin/numbers');
});

app.post('/admin/numbers/:id', requireAdmin, (req, res) => {
  const number = store.getNumberById(req.params.id);
  if (!number) {
    setFlash(res, 'Nomor tidak ditemukan.');
    return res.redirect('/admin/numbers');
  }

  try {
    store.updateNumber(number.id, {
      label: sanitizeText(req.body.label),
      numberKey: sanitizeText(req.body.numberKey),
      senderKey: sanitizeText(req.body.senderKey),
      description: sanitizeText(req.body.description),
      isActive: parseBoolean(req.body.isActive),
    });
    store.replaceNumberAccess(number.id, [].concat(req.body.userIds || []).map(sanitizeText));
    setFlash(res, 'Nomor berhasil diperbarui.');
  } catch (error) {
    setFlash(res, `Gagal memperbarui nomor: ${error.message}`);
  }
  return res.redirect('/admin/numbers');
});

app.post('/admin/numbers/:id/toggle', requireAdmin, (req, res) => {
  const number = store.getNumberById(req.params.id);
  if (number) {
    store.updateNumber(number.id, { isActive: !number.isActive });
    setFlash(res, 'Status nomor diperbarui.');
  }
  return res.redirect('/admin/numbers');
});

app.post('/admin/numbers/:id/delete', requireAdmin, (req, res) => {
  store.deleteNumber(req.params.id);
  setFlash(res, 'Nomor dihapus.');
  return res.redirect('/admin/numbers');
});

app.get('/admin/logs', requireAdmin, (req, res) => {
  res.send(renderLogsPage({
    flash: req.flash,
    logs: store.listOtpLogs(150),
  }));
});

app.post('/webhook', async (req, res) => {
  if (!webhookAuthorized(req)) {
    return res.status(401).json({ status: 'error', message: 'invalid webhook secret' });
  }

  try {
    const numberKey = sanitizeText(req.body.number_key || req.body.numberKey || req.body.receiver_number || req.body.device_id || req.body.sim_label);
    const sender = sanitizeText(req.body.sender || req.body.title || req.body.from);
    const text = sanitizeText(req.body.text || req.body.message || req.body.content);

    if (!text) {
      return res.json({ status: 'skipped', reason: 'empty message' });
    }

    const result = await routeOtp({ numberKey, sender, text, source: 'webhook' });
    return res.json({
      ...result,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error('Webhook error:', error.message);
    return res.status(500).json({ status: 'error', message: error.message });
  }
});

app.get('/forward', async (req, res) => {
  if (!webhookAuthorized(req)) {
    return res.status(401).json({ status: 'error', message: 'invalid webhook secret' });
  }

  try {
    const numberKey = sanitizeText(req.query.number_key || req.query.numberKey || req.query.receiver_number || req.query.device_id || req.query.sim_label);
    const sender = sanitizeText(req.query.sender || req.query.from);
    const text = sanitizeText(req.query.text || req.query.message);

    if (!text) {
      return res.json({ status: 'skipped', reason: 'empty message' });
    }

    const result = await routeOtp({ numberKey, sender, text, source: 'query-forward' });
    return res.json({
      ...result,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    return res.status(500).json({ status: 'error', message: error.message });
  }
});

app.get('/logs', requireAdmin, (req, res) => {
  return res.json({
    count: store.listOtpLogs(50).length,
    logs: store.listOtpLogs(50),
  });
});

app.get('/', (req, res) => {
  res.json({
    status: 'running',
    service: 'OTP Control Room',
    adminPanel: '/admin/login',
    webhook: 'POST /webhook',
    queryForward: 'GET /forward',
    metrics: metrics(),
  });
});

let lastUpdateId = 0;
let polling = false;

async function pollTelegramUpdates() {
  if (polling || !TELEGRAM_BOT_TOKEN || TELEGRAM_BOT_TOKEN === 'your_bot_token_here') {
    return;
  }

  polling = true;
  try {
    const response = await fetch(
      `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/getUpdates?offset=${lastUpdateId + 1}&timeout=20`
    );
    const data = await response.json();

    if (!data.ok || !Array.isArray(data.result)) {
      return;
    }

    for (const update of data.result) {
      lastUpdateId = update.update_id;
      const msg = update.message;
      if (!msg || !msg.text) continue;

      const chatId = String(msg.chat.id);
      const username = msg.from && msg.from.username ? msg.from.username : '';
      const command = String(msg.text).trim().toLowerCase();
      const isSeedAdmin = ADMIN_TELEGRAM_IDS.includes(chatId);

      const user = store.upsertTelegramUser({
        telegramChatId: chatId,
        username,
        isAdmin: isSeedAdmin ? true : undefined,
        isActive: isSeedAdmin ? true : undefined,
      });

      if (command === '/start') {
        if (user.isAdmin) {
          await sendToTelegram(chatId, '<b>Admin ready.</b>\nBuka panel web untuk mengatur access.');
        } else if (user.isActive) {
          const numbers = store.getNumbersForUser(user.id);
          const labels = numbers.length
            ? numbers.map(number => `- ${escapeHtml(number.label)}`).join('\n')
            : '- Belum ada nomor yang di-assign';

          await sendToTelegram(
            chatId,
            `<b>Akses aktif.</b>\nKamu akan menerima OTP untuk nomor berikut:\n${labels}`
          );
        } else {
          await sendToTelegram(
            chatId,
            '<b>Permintaan diterima.</b>\nAdmin perlu mengaktifkan akunmu dulu sebelum OTP bisa dikirim.'
          );
        }
      } else if (command === '/status') {
        const numbers = store.getNumbersForUser(user.id);
        const lines = [
          `<b>Status akun</b>`,
          `Username: ${escapeHtml(user.username ? `@${user.username}` : '-')}`,
          `Aktif: ${user.isActive ? 'ya' : 'tidak'}`,
          `Role: ${user.isAdmin ? 'admin' : 'user'}`,
          `Jumlah nomor: ${numbers.length}`,
        ];
        await sendToTelegram(chatId, lines.join('\n'));
      } else if (command === '/stop') {
        store.updateUser(user.id, { isActive: false });
        await sendToTelegram(
          chatId,
          '<b>Akun dinonaktifkan.</b>\nHubungi admin jika ingin mengaktifkan kembali akses OTP.'
        );
      }
    }
  } catch (error) {
    console.error('Telegram polling error:', error.message);
  } finally {
    polling = false;
    setTimeout(pollTelegramUpdates, 3000);
  }
}

setTimeout(pollTelegramUpdates, 2000);

app.listen(PORT, () => {
  console.log(`OTP Control Room running on port ${PORT}`);
  console.log(`Admin panel: http://localhost:${PORT}/admin/login`);
  console.log(`Webhook: POST http://localhost:${PORT}/webhook`);
  console.log(`Forward: GET http://localhost:${PORT}/forward`);
});
