const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');

let dbInstance = null;

function initBooksTable(db) {
  const database = db || getDatabase();
  database.exec(`
    CREATE TABLE IF NOT EXISTS books (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      filename_original TEXT UNIQUE NOT NULL,
      title TEXT,
      author TEXT,
      year INTEGER,
      isbn TEXT,
      description TEXT,
      tags TEXT,
      cover_url TEXT,
      cover_id INTEGER,
      file_path TEXT,
      telegram_group_id TEXT,
      telegram_message_id INTEGER,
      telegram_file_unique_id TEXT,
      processed_at TEXT NOT NULL
    );
  `);

  const columns = database.prepare('PRAGMA table_info(books)').all();
  const columnNames = new Set(columns.map(col => col.name));

  if (!columnNames.has('telegram_file_unique_id')) {
    database.exec('ALTER TABLE books ADD COLUMN telegram_file_unique_id TEXT;');
  }
  if (!columnNames.has('description')) {
    database.exec('ALTER TABLE books ADD COLUMN description TEXT;');
  }
  if (!columnNames.has('tags')) {
    database.exec('ALTER TABLE books ADD COLUMN tags TEXT;');
  }
  if (!columnNames.has('cover_url')) {
    database.exec('ALTER TABLE books ADD COLUMN cover_url TEXT;');
  }
  if (!columnNames.has('cover_id')) {
    database.exec('ALTER TABLE books ADD COLUMN cover_id INTEGER;');
  }

  database.exec('CREATE UNIQUE INDEX IF NOT EXISTS idx_books_telegram_file_unique_id ON books(telegram_file_unique_id);');
  database.exec('CREATE INDEX IF NOT EXISTS idx_books_filename ON books(filename_original);');
}

function initStateTable(db) {
  const database = db || getDatabase();
  database.exec(`
    CREATE TABLE IF NOT EXISTS state (
      key TEXT PRIMARY KEY,
      value TEXT
    );
  `);
}

function initDatabase(dbPath = './books.db') {
  if (dbInstance) {
    return dbInstance;
  }

  const resolvedPath = path.resolve(process.cwd(), dbPath);
  const dir = path.dirname(resolvedPath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }

  dbInstance = new Database(resolvedPath);
  dbInstance.pragma('journal_mode = WAL');

  initBooksTable(dbInstance);
  initStateTable(dbInstance);

  return dbInstance;
}

function getDatabase() {
  if (!dbInstance) {
    return initDatabase();
  }
  return dbInstance;
}

function getState(key) {
  const db = getDatabase();
  const stmt = db.prepare('SELECT value FROM state WHERE key = ?');
  const row = stmt.get(String(key));
  return row ? row.value : null;
}

function setState(key, value) {
  const db = getDatabase();
  const stmt = db.prepare(`
    INSERT INTO state (key, value)
    VALUES (?, ?)
    ON CONFLICT(key) DO UPDATE SET value = excluded.value
  `);
  stmt.run(String(key), value !== null && value !== undefined ? String(value) : null);
}

function findBookByFileUniqueId(uniqueId) {
  if (!uniqueId) {
    return null;
  }
  const db = getDatabase();
  const stmt = db.prepare('SELECT * FROM books WHERE telegram_file_unique_id = ?');
  const result = stmt.get(String(uniqueId));
  return result || null;
}

function bookExists(filenameOriginal) {
  const db = getDatabase();
  const stmt = db.prepare('SELECT 1 FROM books WHERE filename_original = ?');
  const result = stmt.get(filenameOriginal);
  return Boolean(result);
}

function getBookByFilename(filenameOriginal) {
  const db = getDatabase();
  const stmt = db.prepare('SELECT * FROM books WHERE filename_original = ?');
  return stmt.get(filenameOriginal);
}

function insertBook(bookData) {
  const db = getDatabase();
  const stmt = db.prepare(`
    INSERT INTO books (
      filename_original,
      title,
      author,
      year,
      isbn,
      description,
      tags,
      cover_url,
      cover_id,
      file_path,
      telegram_group_id,
      telegram_message_id,
      telegram_file_unique_id,
      processed_at
    ) VALUES (
      @filename_original,
      @title,
      @author,
      @year,
      @isbn,
      @description,
      @tags,
      @cover_url,
      @cover_id,
      @file_path,
      @telegram_group_id,
      @telegram_message_id,
      @telegram_file_unique_id,
      @processed_at
    )
  `);

  const info = stmt.run({
    filename_original: bookData.filename_original,
    title: bookData.title || null,
    author: bookData.author || null,
    year: bookData.year !== undefined && bookData.year !== null ? Number(bookData.year) : null,
    isbn: bookData.isbn || null,
    description: bookData.description || null,
    tags: bookData.tags || null,
    cover_url: bookData.cover_url || null,
    cover_id: bookData.cover_id !== undefined && bookData.cover_id !== null ? Number(bookData.cover_id) : null,
    file_path: bookData.file_path || null,
    telegram_group_id: bookData.telegram_group_id !== undefined && bookData.telegram_group_id !== null ? String(bookData.telegram_group_id) : null,
    telegram_message_id: bookData.telegram_message_id !== undefined && bookData.telegram_message_id !== null ? Number(bookData.telegram_message_id) : null,
    telegram_file_unique_id: bookData.telegram_file_unique_id ? String(bookData.telegram_file_unique_id) : null,
    processed_at: bookData.processed_at || new Date().toISOString()
  });

  return info.lastInsertRowid;
}

function updateTelegramInfo(id, telegramGroupId, telegramMessageId) {
  const db = getDatabase();
  const stmt = db.prepare(`
    UPDATE books
    SET telegram_group_id = ?,
        telegram_message_id = ?
    WHERE id = ?
  `);
  return stmt.run(
    telegramGroupId !== undefined && telegramGroupId !== null ? String(telegramGroupId) : null,
    telegramMessageId !== undefined && telegramMessageId !== null ? Number(telegramMessageId) : null,
    id
  );
}

function getAllBooks() {
  const db = getDatabase();
  const stmt = db.prepare('SELECT * FROM books ORDER BY id ASC');
  return stmt.all();
}

function closeDatabase() {
  if (dbInstance) {
    dbInstance.close();
    dbInstance = null;
  }
}

module.exports = {
  initBooksTable,
  initStateTable,
  initDatabase,
  getDatabase,
  getState,
  setState,
  findBookByFileUniqueId,
  bookExists,
  getBookByFilename,
  insertBook,
  updateTelegramInfo,
  getAllBooks,
  closeDatabase
};
