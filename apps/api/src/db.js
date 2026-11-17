import fs from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';

const STATEMENTS = [
  `CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY,
    email TEXT NOT NULL UNIQUE,
    password_hash TEXT NOT NULL,
    email_verified INTEGER NOT NULL DEFAULT 0,
    kyc_status TEXT NOT NULL DEFAULT 'unverified',
    kyc_provider TEXT,
    kyc_reference TEXT,
    created_at TEXT NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS email_otps (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    code_hash TEXT NOT NULL,
    expires_at TEXT NOT NULL,
    consumed INTEGER NOT NULL DEFAULT 0,
    FOREIGN KEY (user_id) REFERENCES users(id)
  )`,
  `CREATE TABLE IF NOT EXISTS profiles (
    user_id TEXT PRIMARY KEY,
    display_name TEXT NOT NULL,
    gender TEXT NOT NULL,
    date_of_birth TEXT NOT NULL,
    height_cm INTEGER,
    city TEXT NOT NULL,
    state TEXT NOT NULL,
    religion TEXT,
    mother_tongue TEXT,
    education TEXT,
    profession TEXT,
    marital_status TEXT NOT NULL,
    about TEXT,
    phone TEXT,
    photo_path TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    FOREIGN KEY (user_id) REFERENCES users(id)
  )`,
  `CREATE TABLE IF NOT EXISTS preferences (
    user_id TEXT PRIMARY KEY,
    looking_for_gender TEXT NOT NULL,
    min_age INTEGER NOT NULL,
    max_age INTEGER NOT NULL,
    religion TEXT,
    city TEXT,
    FOREIGN KEY (user_id) REFERENCES users(id)
  )`,
  `CREATE TABLE IF NOT EXISTS interests (
    id TEXT PRIMARY KEY,
    from_user_id TEXT NOT NULL,
    to_user_id TEXT NOT NULL,
    status TEXT NOT NULL,
    created_at TEXT NOT NULL,
    UNIQUE (from_user_id, to_user_id),
    FOREIGN KEY (from_user_id) REFERENCES users(id),
    FOREIGN KEY (to_user_id) REFERENCES users(id)
  )`,
  `CREATE TABLE IF NOT EXISTS passes (
    user_id TEXT NOT NULL,
    passed_user_id TEXT NOT NULL,
    created_at TEXT NOT NULL,
    PRIMARY KEY (user_id, passed_user_id)
  )`,
  `CREATE TABLE IF NOT EXISTS messages (
    id TEXT PRIMARY KEY,
    match_key TEXT NOT NULL,
    sender_id TEXT NOT NULL,
    body TEXT NOT NULL,
    created_at TEXT NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS subscriptions (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    plan TEXT NOT NULL,
    status TEXT NOT NULL,
    provider TEXT NOT NULL,
    provider_ref TEXT,
    current_period_end TEXT NOT NULL,
    created_at TEXT NOT NULL
  )`,
  `CREATE INDEX IF NOT EXISTS idx_profiles_gender ON profiles(gender)`,
  `CREATE INDEX IF NOT EXISTS idx_messages_match ON messages(match_key)`,
  `CREATE INDEX IF NOT EXISTS idx_subscriptions_user ON subscriptions(user_id, status)`,
];

let database;

export function uploadDir() {
  return process.env.UPLOAD_DIR || path.join(process.cwd(), 'uploads');
}

function apply(sql) {
  database.prepare(sql).run();
}

export function initDb(target = process.env.DATABASE_URL || 'file:data/milap.db') {
  const location = target === ':memory:' ? ':memory:' : target.replace(/^file:/, '');
  if (location !== ':memory:') {
    fs.mkdirSync(path.dirname(path.resolve(location)), { recursive: true });
  }
  fs.mkdirSync(uploadDir(), { recursive: true });
  database = new DatabaseSync(location);
  apply('PRAGMA foreign_keys = ON');
  for (const statement of STATEMENTS) apply(statement);
  return database;
}

export function db() {
  if (!database) throw new Error('Database is not initialized');
  return database;
}

export function closeDb() {
  if (database) database.close();
  database = undefined;
}

export function one(sql, ...args) {
  const row = db().prepare(sql).get(...args);
  return row ? Object.fromEntries(Object.entries(row)) : null;
}

export function many(sql, ...args) {
  return db().prepare(sql).all(...args).map((row) => Object.fromEntries(Object.entries(row)));
}

export function run(sql, ...args) {
  return db().prepare(sql).run(...args);
}

export function transaction(fn) {
  apply('BEGIN');
  try {
    const result = fn();
    apply('COMMIT');
    return result;
  } catch (error) {
    apply('ROLLBACK');
    throw error;
  }
}
