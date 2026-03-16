const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const DATA_DIR = path.join(__dirname, '..', 'data');
const DB_FILE = path.join(DATA_DIR, 'db.json');

const DEFAULT_DB = {
  users: [],
  numbers: [],
  access: [],
  otpLogs: [],
};

function ensureDataDir() {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
}

function cloneDefaultDb() {
  return JSON.parse(JSON.stringify(DEFAULT_DB));
}

function normalizeDb(db) {
  const safeDb = db && typeof db === 'object' ? db : {};
  return {
    users: Array.isArray(safeDb.users) ? safeDb.users : [],
    numbers: Array.isArray(safeDb.numbers) ? safeDb.numbers : [],
    access: Array.isArray(safeDb.access) ? safeDb.access : [],
    otpLogs: Array.isArray(safeDb.otpLogs) ? safeDb.otpLogs : [],
  };
}

class Store {
  constructor() {
    ensureDataDir();
    this.db = this.load();
  }

  load() {
    try {
      if (!fs.existsSync(DB_FILE)) {
        const freshDb = cloneDefaultDb();
        fs.writeFileSync(DB_FILE, JSON.stringify(freshDb, null, 2));
        return freshDb;
      }

      const raw = fs.readFileSync(DB_FILE, 'utf-8');
      return normalizeDb(JSON.parse(raw));
    } catch (error) {
      console.error('Failed to load data store:', error.message);
      return cloneDefaultDb();
    }
  }

  save() {
    ensureDataDir();
    fs.writeFileSync(DB_FILE, JSON.stringify(this.db, null, 2));
  }

  generateId(prefix) {
    return `${prefix}_${crypto.randomBytes(6).toString('hex')}`;
  }

  listUsers() {
    return [...this.db.users].sort((a, b) => {
      return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
    });
  }

  getUserById(userId) {
    return this.db.users.find(user => user.id === userId) || null;
  }

  getUserByChatId(chatId) {
    return this.db.users.find(user => user.telegramChatId === String(chatId)) || null;
  }

  upsertTelegramUser(input) {
    const now = new Date().toISOString();
    const chatId = String(input.telegramChatId);
    const existing = this.getUserByChatId(chatId);

    if (existing) {
      existing.username = input.username !== undefined ? input.username : existing.username;
      existing.displayName = input.displayName || existing.displayName || chatId;
      if (typeof input.isAdmin === 'boolean') existing.isAdmin = input.isAdmin;
      if (typeof input.isActive === 'boolean') existing.isActive = input.isActive;
      existing.updatedAt = now;
      this.save();
      return existing;
    }

    const user = {
      id: this.generateId('usr'),
      telegramChatId: chatId,
      username: input.username || '',
      displayName: input.displayName || chatId,
      isAdmin: Boolean(input.isAdmin),
      isActive: Boolean(input.isActive),
      createdAt: now,
      updatedAt: now,
    };

    this.db.users.push(user);
    this.save();
    return user;
  }

  createUser(input) {
    return this.upsertTelegramUser(input);
  }

  updateUser(userId, updates) {
    const user = this.getUserById(userId);
    if (!user) return null;

    user.telegramChatId = updates.telegramChatId !== undefined
      ? String(updates.telegramChatId).trim()
      : user.telegramChatId;
    user.username = updates.username !== undefined ? String(updates.username).trim() : user.username;
    user.displayName = updates.displayName !== undefined ? String(updates.displayName).trim() : user.displayName;
    user.isAdmin = typeof updates.isAdmin === 'boolean' ? updates.isAdmin : user.isAdmin;
    user.isActive = typeof updates.isActive === 'boolean' ? updates.isActive : user.isActive;
    user.updatedAt = new Date().toISOString();
    this.save();
    return user;
  }

  deleteUser(userId) {
    this.db.users = this.db.users.filter(user => user.id !== userId);
    this.db.access = this.db.access.filter(entry => entry.userId !== userId);
    this.save();
  }

  listNumbers() {
    return [...this.db.numbers].sort((a, b) => {
      return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
    });
  }

  getNumberById(numberId) {
    return this.db.numbers.find(number => number.id === numberId) || null;
  }

  createNumber(input) {
    const now = new Date().toISOString();
    const number = {
      id: this.generateId('num'),
      label: String(input.label || '').trim(),
      senderKey: String(input.senderKey || '').trim(),
      description: String(input.description || '').trim(),
      isActive: input.isActive !== false,
      createdAt: now,
      updatedAt: now,
    };
    this.db.numbers.push(number);
    this.save();
    return number;
  }

  updateNumber(numberId, updates) {
    const number = this.getNumberById(numberId);
    if (!number) return null;

    number.label = updates.label !== undefined ? String(updates.label).trim() : number.label;
    number.senderKey = updates.senderKey !== undefined ? String(updates.senderKey).trim() : number.senderKey;
    number.description = updates.description !== undefined ? String(updates.description).trim() : number.description;
    number.isActive = typeof updates.isActive === 'boolean' ? updates.isActive : number.isActive;
    number.updatedAt = new Date().toISOString();
    this.save();
    return number;
  }

  deleteNumber(numberId) {
    this.db.numbers = this.db.numbers.filter(number => number.id !== numberId);
    this.db.access = this.db.access.filter(entry => entry.numberId !== numberId);
    this.db.otpLogs = this.db.otpLogs.filter(log => log.numberId !== numberId);
    this.save();
  }

  assignAccess(userId, numberId) {
    const existing = this.db.access.find(entry => entry.userId === userId && entry.numberId === numberId);
    if (existing) return existing;

    const access = {
      id: this.generateId('acc'),
      userId,
      numberId,
      createdAt: new Date().toISOString(),
    };

    this.db.access.push(access);
    this.save();
    return access;
  }

  revokeAccess(userId, numberId) {
    this.db.access = this.db.access.filter(entry => !(entry.userId === userId && entry.numberId === numberId));
    this.save();
  }

  getAssignments() {
    return this.db.access.map(entry => ({
      ...entry,
      user: this.getUserById(entry.userId),
      number: this.getNumberById(entry.numberId),
    })).filter(entry => entry.user && entry.number);
  }

  getUsersForNumber(numberId) {
    const userIds = this.db.access
      .filter(entry => entry.numberId === numberId)
      .map(entry => entry.userId);

    return this.db.users.filter(user => userIds.includes(user.id) && user.isActive);
  }

  getNumbersForUser(userId) {
    const numberIds = this.db.access
      .filter(entry => entry.userId === userId)
      .map(entry => entry.numberId);

    return this.db.numbers.filter(number => numberIds.includes(number.id));
  }

  logOtp(entry) {
    const logEntry = {
      id: this.generateId('otp'),
      timestamp: new Date().toISOString(),
      numberId: entry.numberId || null,
      numberLabel: entry.numberLabel || '',
      sender: entry.sender || '',
      otp: entry.otp || '',
      rawText: entry.rawText || '',
      deliveryCount: entry.deliveryCount || 0,
      deliveredTo: Array.isArray(entry.deliveredTo) ? entry.deliveredTo : [],
      status: entry.status || 'received',
    };

    this.db.otpLogs.push(logEntry);
    this.db.otpLogs = this.db.otpLogs.slice(-500);
    this.save();
    return logEntry;
  }

  listOtpLogs(limit = 100) {
    return [...this.db.otpLogs]
      .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
      .slice(0, limit);
  }
}

module.exports = {
  Store,
  DB_FILE,
};
