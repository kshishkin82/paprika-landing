import { DatabaseSync } from "node:sqlite";
import fs from "node:fs";
import path from "node:path";

const SCHEMA = `
CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS sessions (
  token_hash TEXT PRIMARY KEY,
  expires_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS master_classes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  title TEXT NOT NULL,
  slug TEXT NOT NULL UNIQUE,
  description_md TEXT NOT NULL DEFAULT '',
  next_date TEXT,                      -- 'YYYY-MM-DDTHH:MM', местное время студии
  published INTEGER NOT NULL DEFAULT 1,
  sort INTEGER NOT NULL DEFAULT 0,     -- ручной порядок в админке и на сайте
  show_on_home INTEGER NOT NULL DEFAULT 0, -- 1 = выводить в блоке «Ближайшие мастер-классы» на главной
  seo_title TEXT NOT NULL DEFAULT '',       -- <title> страницы; пусто = «<название> — мастер-класс в студии Паприка»
  seo_description TEXT NOT NULL DEFAULT '', -- meta description; пусто = начало описания
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS master_class_photos (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  master_class_id INTEGER NOT NULL REFERENCES master_classes(id) ON DELETE CASCADE,
  url TEXT NOT NULL,
  sort INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS gallery_photos (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  url TEXT NOT NULL,
  caption TEXT NOT NULL DEFAULT '',
  description TEXT NOT NULL DEFAULT '', -- доп. описание, показывается в лайтбоксе
  published INTEGER NOT NULL DEFAULT 1, -- 0 = скрыто на сайте
  sort INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS reviews (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  author TEXT NOT NULL,
  photo TEXT NOT NULL DEFAULT '',
  date TEXT NOT NULL,                  -- 'YYYY-MM-DD'
  text TEXT NOT NULL,
  published INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS orders (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  phone TEXT NOT NULL,
  kind TEXT NOT NULL,                  -- master_class | certificate | event | other
  master_class_id INTEGER REFERENCES master_classes(id) ON DELETE SET NULL,
  master_class_title TEXT NOT NULL DEFAULT '',
  guests INTEGER,
  comment TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'new',  -- new | in_progress | done | cancelled
  admin_note TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_mc_photos ON master_class_photos(master_class_id, sort);
CREATE INDEX IF NOT EXISTS idx_orders_status ON orders(status, created_at);
`;

export function openDb(file) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const db = new DatabaseSync(file);
  db.exec("PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON;");
  db.exec(SCHEMA);
  migrate(db);
  return db;
}

/** Миграции для баз, созданных до появления новых колонок. */
function migrate(db) {
  const cols = db.prepare("PRAGMA table_info(master_classes)").all().map((c) => c.name);
  if (!cols.includes("sort")) {
    db.exec("ALTER TABLE master_classes ADD COLUMN sort INTEGER NOT NULL DEFAULT 0");
    const rows = db.prepare("SELECT id FROM master_classes ORDER BY next_date IS NULL, next_date, title").all();
    const upd = db.prepare("UPDATE master_classes SET sort = ? WHERE id = ?");
    rows.forEach((r, i) => upd.run(i, r.id));
  }
  if (!cols.includes("show_on_home")) {
    db.exec("ALTER TABLE master_classes ADD COLUMN show_on_home INTEGER NOT NULL DEFAULT 0");
    // сохраняем то, что уже было на главной: три ближайших опубликованных МК
    const now = new Date().toISOString().slice(0, 16);
    db.prepare(
      `UPDATE master_classes SET show_on_home = 1 WHERE id IN (
         SELECT id FROM master_classes WHERE published = 1 AND next_date >= ? ORDER BY sort, id LIMIT 3)`
    ).run(now);
  }
  if (!cols.includes("seo_title")) db.exec("ALTER TABLE master_classes ADD COLUMN seo_title TEXT NOT NULL DEFAULT ''");
  if (!cols.includes("seo_description")) db.exec("ALTER TABLE master_classes ADD COLUMN seo_description TEXT NOT NULL DEFAULT ''");
  const gcols = db.prepare("PRAGMA table_info(gallery_photos)").all().map((c) => c.name);
  if (!gcols.includes("description")) db.exec("ALTER TABLE gallery_photos ADD COLUMN description TEXT NOT NULL DEFAULT ''");
  if (!gcols.includes("published")) db.exec("ALTER TABLE gallery_photos ADD COLUMN published INTEGER NOT NULL DEFAULT 1");
}

export function transaction(db, fn) {
  db.exec("BEGIN");
  try {
    const result = fn();
    db.exec("COMMIT");
    return result;
  } catch (err) {
    db.exec("ROLLBACK");
    throw err;
  }
}

export function getSetting(db, key) {
  return db.prepare("SELECT value FROM settings WHERE key = ?").get(key)?.value ?? null;
}

export function setSetting(db, key, value) {
  db.prepare(
    "INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value"
  ).run(key, value);
}
