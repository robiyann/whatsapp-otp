const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { DatabaseSync } = require('node:sqlite');

const DATA_DIR = path.join(__dirname, '..', 'data');
const DB_FILE = path.join(DATA_DIR, 'app.db');
const LEGACY_JSON_FILE = path.join(DATA_DIR, 'db.json');

function ensureDataDir() {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
}

function nowIso() {
  return new Date().toISOString();
}

function toBool(value) {
  return Boolean(value);
}

function decodeRecipients(value) {
  if (!value) return [];
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed : [];
  } catch (error) {
    return [];
  }
}

class Store {
  constructor() {
    ensureDataDir();
    this.db = new DatabaseSync(DB_FILE);
    this.setup();
    this.migrateLegacyJson();
  }

  setup() {
    this.db.exec(`
      PRAGMA journal_mode = WAL;
      PRAGMA foreign_keys = ON;

      CREATE TABLE IF NOT EXISTS users (
        id TEXT PRIMARY KEY,
        telegram_chat_id TEXT NOT NULL UNIQUE,
        username TEXT NOT NULL DEFAULT '',
        display_name TEXT NOT NULL,
        is_admin INTEGER NOT NULL DEFAULT 0,
        is_active INTEGER NOT NULL DEFAULT 0,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS numbers (
        id TEXT PRIMARY KEY,
        label TEXT NOT NULL,
        sender_key TEXT NOT NULL UNIQUE,
        description TEXT NOT NULL DEFAULT '',
        is_active INTEGER NOT NULL DEFAULT 1,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS access_entries (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        number_id TEXT NOT NULL,
        created_at TEXT NOT NULL,
        UNIQUE(user_id, number_id),
        FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE,
        FOREIGN KEY(number_id) REFERENCES numbers(id) ON DELETE CASCADE
      );

      CREATE TABLE IF NOT EXISTS otp_logs (
        id TEXT PRIMARY KEY,
        timestamp TEXT NOT NULL,
        number_id TEXT,
        number_label TEXT NOT NULL DEFAULT '',
        sender TEXT NOT NULL DEFAULT '',
        otp TEXT NOT NULL DEFAULT '',
        raw_text TEXT NOT NULL DEFAULT '',
        delivery_count INTEGER NOT NULL DEFAULT 0,
        delivered_to TEXT NOT NULL DEFAULT '[]',
        status TEXT NOT NULL DEFAULT 'received',
        source TEXT NOT NULL DEFAULT '',
        FOREIGN KEY(number_id) REFERENCES numbers(id) ON DELETE SET NULL
      );

      CREATE INDEX IF NOT EXISTS idx_users_chat_id ON users (telegram_chat_id);
      CREATE INDEX IF NOT EXISTS idx_numbers_sender_key ON numbers (sender_key);
      CREATE INDEX IF NOT EXISTS idx_access_user_id ON access_entries (user_id);
      CREATE INDEX IF NOT EXISTS idx_access_number_id ON access_entries (number_id);
      CREATE INDEX IF NOT EXISTS idx_otp_logs_timestamp ON otp_logs (timestamp DESC);
    `);
  }

  migrateLegacyJson() {
    if (!fs.existsSync(LEGACY_JSON_FILE)) return;

    const existingUsers = this.db.prepare('SELECT COUNT(*) AS count FROM users').get().count;
    const existingNumbers = this.db.prepare('SELECT COUNT(*) AS count FROM numbers').get().count;
    const existingAccess = this.db.prepare('SELECT COUNT(*) AS count FROM access_entries').get().count;
    const existingLogs = this.db.prepare('SELECT COUNT(*) AS count FROM otp_logs').get().count;

    if (existingUsers || existingNumbers || existingAccess || existingLogs) {
      return;
    }

    try {
      const payload = JSON.parse(fs.readFileSync(LEGACY_JSON_FILE, 'utf-8'));
      const users = Array.isArray(payload.users) ? payload.users : [];
      const numbers = Array.isArray(payload.numbers) ? payload.numbers : [];
      const access = Array.isArray(payload.access) ? payload.access : [];
      const otpLogs = Array.isArray(payload.otpLogs) ? payload.otpLogs : [];

      const insertUser = this.db.prepare(`
        INSERT OR IGNORE INTO users
        (id, telegram_chat_id, username, display_name, is_admin, is_active, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `);
      const insertNumber = this.db.prepare(`
        INSERT OR IGNORE INTO numbers
        (id, label, sender_key, description, is_active, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `);
      const insertAccess = this.db.prepare(`
        INSERT OR IGNORE INTO access_entries
        (id, user_id, number_id, created_at)
        VALUES (?, ?, ?, ?)
      `);
      const insertLog = this.db.prepare(`
        INSERT OR IGNORE INTO otp_logs
        (id, timestamp, number_id, number_label, sender, otp, raw_text, delivery_count, delivered_to, status, source)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);

      const migrate = this.db.transaction(() => {
        users.forEach(user => {
          insertUser.run(
            user.id || this.generateId('usr'),
            String(user.telegramChatId || '').trim(),
            String(user.username || '').trim(),
            String(user.displayName || user.telegramChatId || '').trim(),
            toBool(user.isAdmin) ? 1 : 0,
            toBool(user.isActive) ? 1 : 0,
            user.createdAt || nowIso(),
            user.updatedAt || user.createdAt || nowIso()
          );
        });

        numbers.forEach(number => {
          insertNumber.run(
            number.id || this.generateId('num'),
            String(number.label || '').trim(),
            String(number.senderKey || '').trim(),
            String(number.description || '').trim(),
            toBool(number.isActive) ? 1 : 0,
            number.createdAt || nowIso(),
            number.updatedAt || number.createdAt || nowIso()
          );
        });

        access.forEach(entry => {
          insertAccess.run(
            entry.id || this.generateId('acc'),
            entry.userId,
            entry.numberId,
            entry.createdAt || nowIso()
          );
        });

        otpLogs.forEach(log => {
          insertLog.run(
            log.id || this.generateId('otp'),
            log.timestamp || nowIso(),
            log.numberId || null,
            String(log.numberLabel || '').trim(),
            String(log.sender || '').trim(),
            String(log.otp || '').trim(),
            String(log.rawText || '').trim(),
            Number(log.deliveryCount || 0),
            JSON.stringify(Array.isArray(log.deliveredTo) ? log.deliveredTo : []),
            String(log.status || 'received'),
            String(log.source || '')
          );
        });
      });

      migrate();
      fs.renameSync(LEGACY_JSON_FILE, `${LEGACY_JSON_FILE}.migrated`);
    } catch (error) {
      console.error('Legacy JSON migration failed:', error.message);
    }
  }

  generateId(prefix) {
    return `${prefix}_${crypto.randomBytes(6).toString('hex')}`;
  }

  mapUser(row) {
    if (!row) return null;
    return {
      id: row.id,
      telegramChatId: row.telegram_chat_id,
      username: row.username,
      displayName: row.display_name,
      isAdmin: Boolean(row.is_admin),
      isActive: Boolean(row.is_active),
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }

  mapNumber(row) {
    if (!row) return null;
    return {
      id: row.id,
      label: row.label,
      senderKey: row.sender_key,
      description: row.description,
      isActive: Boolean(row.is_active),
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }

  mapLog(row) {
    if (!row) return null;
    return {
      id: row.id,
      timestamp: row.timestamp,
      numberId: row.number_id,
      numberLabel: row.number_label,
      sender: row.sender,
      otp: row.otp,
      rawText: row.raw_text,
      deliveryCount: row.delivery_count,
      deliveredTo: decodeRecipients(row.delivered_to),
      status: row.status,
      source: row.source,
    };
  }

  listUsers() {
    const rows = this.db.prepare('SELECT * FROM users ORDER BY datetime(created_at) DESC').all();
    return rows.map(row => this.mapUser(row));
  }

  getUserById(userId) {
    return this.mapUser(this.db.prepare('SELECT * FROM users WHERE id = ?').get(userId));
  }

  getUserByChatId(chatId) {
    return this.mapUser(
      this.db.prepare('SELECT * FROM users WHERE telegram_chat_id = ?').get(String(chatId))
    );
  }

  upsertTelegramUser(input) {
    const chatId = String(input.telegramChatId).trim();
    const existing = this.getUserByChatId(chatId);
    const timestamp = nowIso();

    if (existing) {
      this.db.prepare(`
        UPDATE users
        SET
          username = ?,
          display_name = ?,
          is_admin = ?,
          is_active = ?,
          updated_at = ?
        WHERE id = ?
      `).run(
        input.username !== undefined ? String(input.username).trim() : existing.username,
        input.displayName ? String(input.displayName).trim() : existing.displayName,
        typeof input.isAdmin === 'boolean' ? (input.isAdmin ? 1 : 0) : (existing.isAdmin ? 1 : 0),
        typeof input.isActive === 'boolean' ? (input.isActive ? 1 : 0) : (existing.isActive ? 1 : 0),
        timestamp,
        existing.id
      );
      return this.getUserById(existing.id);
    }

    const userId = this.generateId('usr');
    this.db.prepare(`
      INSERT INTO users
      (id, telegram_chat_id, username, display_name, is_admin, is_active, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      userId,
      chatId,
      input.username ? String(input.username).trim() : '',
      input.displayName ? String(input.displayName).trim() : chatId,
      input.isAdmin ? 1 : 0,
      input.isActive ? 1 : 0,
      timestamp,
      timestamp
    );
    return this.getUserById(userId);
  }

  createUser(input) {
    return this.upsertTelegramUser(input);
  }

  updateUser(userId, updates) {
    const existing = this.getUserById(userId);
    if (!existing) return null;

    this.db.prepare(`
      UPDATE users
      SET
        telegram_chat_id = ?,
        username = ?,
        display_name = ?,
        is_admin = ?,
        is_active = ?,
        updated_at = ?
      WHERE id = ?
    `).run(
      updates.telegramChatId !== undefined ? String(updates.telegramChatId).trim() : existing.telegramChatId,
      updates.username !== undefined ? String(updates.username).trim() : existing.username,
      updates.displayName !== undefined ? String(updates.displayName).trim() : existing.displayName,
      typeof updates.isAdmin === 'boolean' ? (updates.isAdmin ? 1 : 0) : (existing.isAdmin ? 1 : 0),
      typeof updates.isActive === 'boolean' ? (updates.isActive ? 1 : 0) : (existing.isActive ? 1 : 0),
      nowIso(),
      userId
    );

    return this.getUserById(userId);
  }

  deleteUser(userId) {
    this.db.prepare('DELETE FROM users WHERE id = ?').run(userId);
  }

  listNumbers() {
    const rows = this.db.prepare('SELECT * FROM numbers ORDER BY datetime(created_at) DESC').all();
    return rows.map(row => this.mapNumber(row));
  }

  getNumberById(numberId) {
    return this.mapNumber(this.db.prepare('SELECT * FROM numbers WHERE id = ?').get(numberId));
  }

  createNumber(input) {
    const numberId = this.generateId('num');
    const timestamp = nowIso();
    this.db.prepare(`
      INSERT INTO numbers
      (id, label, sender_key, description, is_active, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(
      numberId,
      String(input.label || '').trim(),
      String(input.senderKey || '').trim(),
      String(input.description || '').trim(),
      input.isActive !== false ? 1 : 0,
      timestamp,
      timestamp
    );

    return this.getNumberById(numberId);
  }

  updateNumber(numberId, updates) {
    const existing = this.getNumberById(numberId);
    if (!existing) return null;

    this.db.prepare(`
      UPDATE numbers
      SET
        label = ?,
        sender_key = ?,
        description = ?,
        is_active = ?,
        updated_at = ?
      WHERE id = ?
    `).run(
      updates.label !== undefined ? String(updates.label).trim() : existing.label,
      updates.senderKey !== undefined ? String(updates.senderKey).trim() : existing.senderKey,
      updates.description !== undefined ? String(updates.description).trim() : existing.description,
      typeof updates.isActive === 'boolean' ? (updates.isActive ? 1 : 0) : (existing.isActive ? 1 : 0),
      nowIso(),
      numberId
    );

    return this.getNumberById(numberId);
  }

  deleteNumber(numberId) {
    this.db.prepare('DELETE FROM numbers WHERE id = ?').run(numberId);
  }

  assignAccess(userId, numberId) {
    const existing = this.db.prepare(
      'SELECT * FROM access_entries WHERE user_id = ? AND number_id = ?'
    ).get(userId, numberId);

    if (existing) {
      return {
        id: existing.id,
        userId: existing.user_id,
        numberId: existing.number_id,
        createdAt: existing.created_at,
      };
    }

    const entry = {
      id: this.generateId('acc'),
      userId,
      numberId,
      createdAt: nowIso(),
    };

    this.db.prepare(`
      INSERT INTO access_entries
      (id, user_id, number_id, created_at)
      VALUES (?, ?, ?, ?)
    `).run(entry.id, entry.userId, entry.numberId, entry.createdAt);

    return entry;
  }

  revokeAccess(userId, numberId) {
    this.db.prepare('DELETE FROM access_entries WHERE user_id = ? AND number_id = ?').run(userId, numberId);
  }

  getAssignments() {
    const rows = this.db.prepare(`
      SELECT
        a.id,
        a.user_id,
        a.number_id,
        a.created_at,
        u.id AS u_id,
        u.telegram_chat_id,
        u.username,
        u.display_name,
        u.is_admin,
        u.is_active,
        u.created_at AS u_created_at,
        u.updated_at AS u_updated_at,
        n.id AS n_id,
        n.label,
        n.sender_key,
        n.description,
        n.is_active AS n_is_active,
        n.created_at AS n_created_at,
        n.updated_at AS n_updated_at
      FROM access_entries a
      JOIN users u ON u.id = a.user_id
      JOIN numbers n ON n.id = a.number_id
      ORDER BY datetime(a.created_at) DESC
    `).all();

    return rows.map(row => ({
      id: row.id,
      userId: row.user_id,
      numberId: row.number_id,
      createdAt: row.created_at,
      user: this.mapUser({
        id: row.u_id,
        telegram_chat_id: row.telegram_chat_id,
        username: row.username,
        display_name: row.display_name,
        is_admin: row.is_admin,
        is_active: row.is_active,
        created_at: row.u_created_at,
        updated_at: row.u_updated_at,
      }),
      number: this.mapNumber({
        id: row.n_id,
        label: row.label,
        sender_key: row.sender_key,
        description: row.description,
        is_active: row.n_is_active,
        created_at: row.n_created_at,
        updated_at: row.n_updated_at,
      }),
    }));
  }

  getUsersForNumber(numberId) {
    const rows = this.db.prepare(`
      SELECT u.*
      FROM access_entries a
      JOIN users u ON u.id = a.user_id
      WHERE a.number_id = ? AND u.is_active = 1
      ORDER BY datetime(u.created_at) DESC
    `).all(numberId);

    return rows.map(row => this.mapUser(row));
  }

  getNumbersForUser(userId) {
    const rows = this.db.prepare(`
      SELECT n.*
      FROM access_entries a
      JOIN numbers n ON n.id = a.number_id
      WHERE a.user_id = ?
      ORDER BY datetime(n.created_at) DESC
    `).all(userId);

    return rows.map(row => this.mapNumber(row));
  }

  logOtp(entry) {
    const log = {
      id: this.generateId('otp'),
      timestamp: entry.timestamp || nowIso(),
      numberId: entry.numberId || null,
      numberLabel: String(entry.numberLabel || '').trim(),
      sender: String(entry.sender || '').trim(),
      otp: String(entry.otp || '').trim(),
      rawText: String(entry.rawText || '').trim(),
      deliveryCount: Number(entry.deliveryCount || 0),
      deliveredTo: Array.isArray(entry.deliveredTo) ? entry.deliveredTo : [],
      status: String(entry.status || 'received'),
      source: String(entry.source || ''),
    };

    this.db.prepare(`
      INSERT INTO otp_logs
      (id, timestamp, number_id, number_label, sender, otp, raw_text, delivery_count, delivered_to, status, source)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      log.id,
      log.timestamp,
      log.numberId,
      log.numberLabel,
      log.sender,
      log.otp,
      log.rawText,
      log.deliveryCount,
      JSON.stringify(log.deliveredTo),
      log.status,
      log.source
    );

    const staleRows = this.db.prepare(`
      SELECT id
      FROM otp_logs
      ORDER BY datetime(timestamp) DESC
      LIMIT -1 OFFSET 500
    `).all();

    if (staleRows.length > 0) {
      const deleteStmt = this.db.prepare('DELETE FROM otp_logs WHERE id = ?');
      const cleanup = this.db.transaction(() => {
        staleRows.forEach(row => deleteStmt.run(row.id));
      });
      cleanup();
    }

    return log;
  }

  listOtpLogs(limit = 100) {
    const rows = this.db.prepare(`
      SELECT *
      FROM otp_logs
      ORDER BY datetime(timestamp) DESC
      LIMIT ?
    `).all(Number(limit));

    return rows.map(row => this.mapLog(row));
  }
}

module.exports = {
  Store,
  DB_FILE,
};
