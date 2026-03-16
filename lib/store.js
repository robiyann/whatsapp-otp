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

function decodeJsonArray(value) {
  if (!value) return [];
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed : [];
  } catch (error) {
    return [];
  }
}

function normalizeUsername(value) {
  return String(value || '').trim().replace(/^@+/, '');
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
        is_admin INTEGER NOT NULL DEFAULT 0,
        is_active INTEGER NOT NULL DEFAULT 0,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS numbers (
        id TEXT PRIMARY KEY,
        label TEXT NOT NULL,
        number_key TEXT NOT NULL UNIQUE,
        sender_key TEXT NOT NULL DEFAULT '',
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
        number_key TEXT NOT NULL DEFAULT '',
        sender TEXT NOT NULL DEFAULT '',
        otp TEXT NOT NULL DEFAULT '',
        raw_text TEXT NOT NULL DEFAULT '',
        delivery_count INTEGER NOT NULL DEFAULT 0,
        delivered_to TEXT NOT NULL DEFAULT '[]',
        status TEXT NOT NULL DEFAULT 'received',
        source TEXT NOT NULL DEFAULT '',
        FOREIGN KEY(number_id) REFERENCES numbers(id) ON DELETE SET NULL
      );
    `);

    this.ensureColumn('users', 'username', "TEXT NOT NULL DEFAULT ''");
    this.ensureColumn('users', 'display_name', "TEXT NOT NULL DEFAULT ''");
    this.ensureColumn('numbers', 'number_key', "TEXT NOT NULL DEFAULT ''");
    this.ensureColumn('numbers', 'sender_key', "TEXT NOT NULL DEFAULT ''");
    this.ensureColumn('otp_logs', 'number_key', "TEXT NOT NULL DEFAULT ''");
    this.ensureColumn('otp_logs', 'source', "TEXT NOT NULL DEFAULT ''");
    this.backfillNumberKeys();

    this.db.exec(`
      CREATE INDEX IF NOT EXISTS idx_users_chat_id ON users (telegram_chat_id);
      CREATE INDEX IF NOT EXISTS idx_users_username ON users (username);
      CREATE INDEX IF NOT EXISTS idx_numbers_number_key ON numbers (number_key);
      CREATE INDEX IF NOT EXISTS idx_numbers_sender_key ON numbers (sender_key);
      CREATE INDEX IF NOT EXISTS idx_access_user_id ON access_entries (user_id);
      CREATE INDEX IF NOT EXISTS idx_access_number_id ON access_entries (number_id);
      CREATE INDEX IF NOT EXISTS idx_otp_logs_timestamp ON otp_logs (timestamp DESC);
    `);
  }

  ensureColumn(tableName, columnName, definition) {
    const columns = this.db.prepare(`PRAGMA table_info(${tableName})`).all();
    if (!columns.some(column => column.name === columnName)) {
      this.db.exec(`ALTER TABLE ${tableName} ADD COLUMN ${columnName} ${definition}`);
    }
  }

  backfillNumberKeys() {
    this.db.exec(`
      UPDATE users
      SET display_name = CASE
        WHEN TRIM(COALESCE(display_name, '')) <> '' THEN TRIM(display_name)
        WHEN TRIM(COALESCE(username, '')) <> '' THEN '@' || TRIM(username)
        ELSE TRIM(telegram_chat_id)
      END
      WHERE TRIM(COALESCE(display_name, '')) = '';

      UPDATE numbers
      SET number_key = CASE
        WHEN TRIM(COALESCE(number_key, '')) <> '' THEN TRIM(number_key)
        WHEN TRIM(COALESCE(sender_key, '')) <> '' THEN TRIM(sender_key)
        ELSE TRIM(label)
      END
      WHERE TRIM(COALESCE(number_key, '')) = '';

      UPDATE otp_logs
      SET number_key = COALESCE(
        NULLIF(TRIM(number_key), ''),
        NULLIF(TRIM(number_label), ''),
        ''
      )
      WHERE TRIM(COALESCE(number_key, '')) = '';
    `);
  }

  migrateLegacyJson() {
    if (!fs.existsSync(LEGACY_JSON_FILE)) return;

    const counts = [
      this.db.prepare('SELECT COUNT(*) AS count FROM users').get().count,
      this.db.prepare('SELECT COUNT(*) AS count FROM numbers').get().count,
      this.db.prepare('SELECT COUNT(*) AS count FROM access_entries').get().count,
      this.db.prepare('SELECT COUNT(*) AS count FROM otp_logs').get().count,
    ];

    if (counts.some(Boolean)) return;

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
        (id, label, number_key, sender_key, description, is_active, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `);
      const insertAccess = this.db.prepare(`
        INSERT OR IGNORE INTO access_entries
        (id, user_id, number_id, created_at)
        VALUES (?, ?, ?, ?)
      `);
      const insertLog = this.db.prepare(`
        INSERT OR IGNORE INTO otp_logs
        (id, timestamp, number_id, number_label, number_key, sender, otp, raw_text, delivery_count, delivered_to, status, source)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);

      const migrate = () => {
        this.db.exec('BEGIN');
        try {
        users.forEach(user => {
          insertUser.run(
            user.id || this.generateId('usr'),
            String(user.telegramChatId || '').trim(),
            normalizeUsername(user.username || user.displayName),
            user.username ? `@${normalizeUsername(user.username)}` : String(user.displayName || user.telegramChatId || '').trim(),
            user.isAdmin ? 1 : 0,
            user.isActive ? 1 : 0,
            user.createdAt || nowIso(),
            user.updatedAt || user.createdAt || nowIso()
          );
        });

        numbers.forEach(number => {
          const numberKey = String(number.numberKey || number.senderKey || number.label || '').trim();
          insertNumber.run(
            number.id || this.generateId('num'),
            String(number.label || numberKey).trim(),
            numberKey,
            String(number.senderKey || '').trim(),
            String(number.description || '').trim(),
            number.isActive === false ? 0 : 1,
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
            String(log.numberKey || '').trim(),
            String(log.sender || '').trim(),
            String(log.otp || '').trim(),
            String(log.rawText || '').trim(),
            Number(log.deliveryCount || 0),
            JSON.stringify(Array.isArray(log.deliveredTo) ? log.deliveredTo : []),
            String(log.status || 'received'),
            String(log.source || '')
          );
        });
          this.db.exec('COMMIT');
        } catch (error) {
          this.db.exec('ROLLBACK');
          throw error;
        }
      };

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
      numberKey: row.number_key,
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
      numberKey: row.number_key,
      sender: row.sender,
      otp: row.otp,
      rawText: row.raw_text,
      deliveryCount: row.delivery_count,
      deliveredTo: decodeJsonArray(row.delivered_to),
      status: row.status,
      source: row.source,
    };
  }

  listUsers() {
    return this.db.prepare('SELECT * FROM users ORDER BY username ASC, telegram_chat_id ASC').all()
      .map(row => this.mapUser(row));
  }

  getUserById(userId) {
    return this.mapUser(this.db.prepare('SELECT * FROM users WHERE id = ?').get(userId));
  }

  getUserByChatId(chatId) {
    return this.mapUser(this.db.prepare('SELECT * FROM users WHERE telegram_chat_id = ?').get(String(chatId)));
  }

  upsertTelegramUser(input) {
    const telegramChatId = String(input.telegramChatId || '').trim();
    const username = normalizeUsername(input.username);
    const existing = this.getUserByChatId(telegramChatId);
    const updatedAt = nowIso();

    if (existing) {
      this.db.prepare(`
      UPDATE users
      SET username = ?, display_name = ?, is_admin = ?, is_active = ?, updated_at = ?
      WHERE id = ?
      `).run(
        username || existing.username,
        username ? `@${username}` : (existing.username ? `@${existing.username}` : existing.telegramChatId),
        typeof input.isAdmin === 'boolean' ? (input.isAdmin ? 1 : 0) : (existing.isAdmin ? 1 : 0),
        typeof input.isActive === 'boolean' ? (input.isActive ? 1 : 0) : (existing.isActive ? 1 : 0),
        updatedAt,
        existing.id
      );
      return this.getUserById(existing.id);
    }

    const id = this.generateId('usr');
    this.db.prepare(`
      INSERT INTO users
      (id, telegram_chat_id, username, display_name, is_admin, is_active, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      id,
      telegramChatId,
      username,
      username ? `@${username}` : telegramChatId,
      input.isAdmin ? 1 : 0,
      input.isActive ? 1 : 0,
      updatedAt,
      updatedAt
    );

    return this.getUserById(id);
  }

  createUser(input) {
    return this.upsertTelegramUser(input);
  }

  updateUser(userId, updates) {
    const existing = this.getUserById(userId);
    if (!existing) return null;

    this.db.prepare(`
      UPDATE users
      SET telegram_chat_id = ?, username = ?, display_name = ?, is_admin = ?, is_active = ?, updated_at = ?
      WHERE id = ?
    `).run(
      updates.telegramChatId !== undefined ? String(updates.telegramChatId).trim() : existing.telegramChatId,
      updates.username !== undefined ? normalizeUsername(updates.username) : existing.username,
      (updates.username !== undefined ? normalizeUsername(updates.username) : existing.username)
        ? `@${updates.username !== undefined ? normalizeUsername(updates.username) : existing.username}`
        : (updates.telegramChatId !== undefined ? String(updates.telegramChatId).trim() : existing.telegramChatId),
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
    return this.db.prepare('SELECT * FROM numbers ORDER BY datetime(created_at) DESC').all()
      .map(row => this.mapNumber(row));
  }

  getNumberById(numberId) {
    return this.mapNumber(this.db.prepare('SELECT * FROM numbers WHERE id = ?').get(numberId));
  }

  createNumber(input) {
    const id = this.generateId('num');
    const timestamp = nowIso();
    this.db.prepare(`
      INSERT INTO numbers
      (id, label, number_key, sender_key, description, is_active, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      id,
      String(input.label || '').trim(),
      String(input.numberKey || '').trim(),
      String(input.senderKey || '').trim(),
      String(input.description || '').trim(),
      input.isActive === false ? 0 : 1,
      timestamp,
      timestamp
    );
    return this.getNumberById(id);
  }

  updateNumber(numberId, updates) {
    const existing = this.getNumberById(numberId);
    if (!existing) return null;

    this.db.prepare(`
      UPDATE numbers
      SET label = ?, number_key = ?, sender_key = ?, description = ?, is_active = ?, updated_at = ?
      WHERE id = ?
    `).run(
      updates.label !== undefined ? String(updates.label).trim() : existing.label,
      updates.numberKey !== undefined ? String(updates.numberKey).trim() : existing.numberKey,
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

  replaceNumberAccess(numberId, userIds) {
    const uniqueUserIds = [...new Set((Array.isArray(userIds) ? userIds : []).filter(Boolean))];
    const deleteStmt = this.db.prepare('DELETE FROM access_entries WHERE number_id = ?');
    const insertStmt = this.db.prepare(`
      INSERT INTO access_entries
      (id, user_id, number_id, created_at)
      VALUES (?, ?, ?, ?)
    `);

    this.db.exec('BEGIN');
    try {
      deleteStmt.run(numberId);
      uniqueUserIds.forEach(userId => {
        insertStmt.run(this.generateId('acc'), userId, numberId, nowIso());
      });
      this.db.exec('COMMIT');
    } catch (error) {
      this.db.exec('ROLLBACK');
      throw error;
    }
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
    return this.db.prepare(`
      SELECT
        a.id,
        a.user_id,
        a.number_id,
        a.created_at,
        u.telegram_chat_id,
        u.username,
        u.is_admin,
        u.is_active,
        u.created_at AS user_created_at,
        u.updated_at AS user_updated_at,
        n.label,
        n.number_key,
        n.sender_key,
        n.description,
        n.is_active AS number_is_active,
        n.created_at AS number_created_at,
        n.updated_at AS number_updated_at
      FROM access_entries a
      JOIN users u ON u.id = a.user_id
      JOIN numbers n ON n.id = a.number_id
      ORDER BY datetime(a.created_at) DESC
    `).all().map(row => ({
      id: row.id,
      userId: row.user_id,
      numberId: row.number_id,
      createdAt: row.created_at,
      user: this.mapUser({
        id: row.user_id,
        telegram_chat_id: row.telegram_chat_id,
        username: row.username,
        is_admin: row.is_admin,
        is_active: row.is_active,
        created_at: row.user_created_at,
        updated_at: row.user_updated_at,
      }),
      number: this.mapNumber({
        id: row.number_id,
        label: row.label,
        number_key: row.number_key,
        sender_key: row.sender_key,
        description: row.description,
        is_active: row.number_is_active,
        created_at: row.number_created_at,
        updated_at: row.number_updated_at,
      }),
    }));
  }

  getUsersForNumber(numberId) {
    return this.db.prepare(`
      SELECT u.*
      FROM access_entries a
      JOIN users u ON u.id = a.user_id
      WHERE a.number_id = ? AND u.is_active = 1
      ORDER BY u.username ASC, u.telegram_chat_id ASC
    `).all(numberId).map(row => this.mapUser(row));
  }

  getNumbersForUser(userId) {
    return this.db.prepare(`
      SELECT n.*
      FROM access_entries a
      JOIN numbers n ON n.id = a.number_id
      WHERE a.user_id = ?
      ORDER BY datetime(n.created_at) DESC
    `).all(userId).map(row => this.mapNumber(row));
  }

  logOtp(entry) {
    const log = {
      id: this.generateId('otp'),
      timestamp: entry.timestamp || nowIso(),
      numberId: entry.numberId || null,
      numberLabel: String(entry.numberLabel || '').trim(),
      numberKey: String(entry.numberKey || '').trim(),
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
      (id, timestamp, number_id, number_label, number_key, sender, otp, raw_text, delivery_count, delivered_to, status, source)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      log.id,
      log.timestamp,
      log.numberId,
      log.numberLabel,
      log.numberKey,
      log.sender,
      log.otp,
      log.rawText,
      log.deliveryCount,
      JSON.stringify(log.deliveredTo),
      log.status,
      log.source
    );

    const staleRows = this.db.prepare(`
      SELECT id FROM otp_logs
      ORDER BY datetime(timestamp) DESC
      LIMIT -1 OFFSET 500
    `).all();

    if (staleRows.length > 0) {
      const deleteStmt = this.db.prepare('DELETE FROM otp_logs WHERE id = ?');
      this.db.exec('BEGIN');
      try {
        staleRows.forEach(row => deleteStmt.run(row.id));
        this.db.exec('COMMIT');
      } catch (error) {
        this.db.exec('ROLLBACK');
        throw error;
      }
    }

    return log;
  }

  listOtpLogs(limit = 100) {
    return this.db.prepare(`
      SELECT * FROM otp_logs
      ORDER BY datetime(timestamp) DESC
      LIMIT ?
    `).all(Number(limit)).map(row => this.mapLog(row));
  }
}

module.exports = {
  Store,
  DB_FILE,
};
