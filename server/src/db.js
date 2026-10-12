import fs from 'node:fs';
import Database from 'better-sqlite3';
import { config } from './config.js';

fs.mkdirSync(config.dataDir, { recursive: true });

export const db = new Database(config.dbFile);
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');
db.pragma('busy_timeout = 5000');

// Each entry is applied once, in order. Never edit an applied migration; append a new one.
const migrations = [
  `
  CREATE TABLE users (
    id INTEGER PRIMARY KEY,
    username TEXT NOT NULL UNIQUE COLLATE NOCASE,
    password_hash TEXT NOT NULL,
    is_admin INTEGER NOT NULL DEFAULT 0,
    default_language TEXT NOT NULL DEFAULT 'EN',
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE sessions (
    token_hash TEXT PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    expires_at TEXT NOT NULL
  );

  CREATE TABLE invites (
    code TEXT PRIMARY KEY,
    note TEXT,
    created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    used_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
    used_at TEXT
  );

  CREATE TABLE sets (
    set_id TEXT PRIMARY KEY,
    data TEXT NOT NULL
  );

  CREATE TABLE cards (
    id TEXT PRIMARY KEY,
    data TEXT NOT NULL,
    image_url TEXT NOT NULL,
    image_version TEXT,
    active INTEGER NOT NULL DEFAULT 1,
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  -- Duplicate API records point at the canonical card they were merged into.
  CREATE TABLE card_aliases (
    alias_id TEXT PRIMARY KEY,
    card_id TEXT NOT NULL
  );

  CREATE TABLE collection (
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    card_id TEXT NOT NULL,
    finish TEXT NOT NULL CHECK (finish IN ('normal', 'foil')),
    language TEXT NOT NULL,
    qty INTEGER NOT NULL CHECK (qty > 0),
    updated_at TEXT NOT NULL DEFAULT (datetime('now')),
    PRIMARY KEY (user_id, card_id, finish, language)
  );

  CREATE TABLE wants (
    id INTEGER PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    name_key TEXT NOT NULL,
    card_id TEXT,
    finish TEXT NOT NULL DEFAULT 'any',
    qty INTEGER NOT NULL DEFAULT 1,
    priority INTEGER NOT NULL DEFAULT 2,
    note TEXT NOT NULL DEFAULT '',
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );
  CREATE INDEX wants_user ON wants(user_id);

  CREATE TABLE decks (
    id INTEGER PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    notes TEXT NOT NULL DEFAULT '',
    list_text TEXT NOT NULL DEFAULT '',
    entries TEXT NOT NULL DEFAULT '[]',
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
  );
  CREATE INDEX decks_user ON decks(user_id);

  CREATE TABLE meta (
    key TEXT PRIMARY KEY,
    value TEXT
  );
  `,
];

db.exec('CREATE TABLE IF NOT EXISTS schema_version (version INTEGER NOT NULL)');
const current = db.prepare('SELECT version FROM schema_version').get()?.version ?? 0;
if (current === 0) db.prepare('INSERT INTO schema_version (version) VALUES (0)').run();
for (let v = current; v < migrations.length; v++) {
  db.transaction(() => {
    db.exec(migrations[v]);
    db.prepare('UPDATE schema_version SET version = ?').run(v + 1);
  })();
}

export function getMeta(key) {
  return db.prepare('SELECT value FROM meta WHERE key = ?').get(key)?.value ?? null;
}

export function setMeta(key, value) {
  db.prepare('INSERT INTO meta (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value').run(
    key,
    value,
  );
}
