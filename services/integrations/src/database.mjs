import { DatabaseSync } from "node:sqlite";
export class Database {
  constructor(path) {
    this.sql = new DatabaseSync(path);
    this.sql.exec(`PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON;
      CREATE TABLE IF NOT EXISTS users (id TEXT PRIMARY KEY, username TEXT UNIQUE NOT NULL, email TEXT UNIQUE NOT NULL, user_ref TEXT UNIQUE NOT NULL, verified INTEGER NOT NULL DEFAULT 0, customer TEXT, subscription TEXT, paid_until INTEGER NOT NULL DEFAULT 0, billing_checked INTEGER NOT NULL DEFAULT 0, checkout_nonce TEXT, checkout_id TEXT, checkout_url TEXT, checkout_expires INTEGER, created INTEGER NOT NULL);
      CREATE TABLE IF NOT EXISTS challenges (id TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id), digest TEXT NOT NULL, expires INTEGER NOT NULL, attempts INTEGER NOT NULL DEFAULT 0);
      CREATE TABLE IF NOT EXISTS sessions (digest TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id), expires INTEGER NOT NULL);
      CREATE TABLE IF NOT EXISTS identities (id TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id), label TEXT NOT NULL, created INTEGER NOT NULL);
      CREATE TABLE IF NOT EXISTS enabled (user_id TEXT NOT NULL REFERENCES users(id), provider TEXT NOT NULL, PRIMARY KEY(user_id,provider));
      CREATE TABLE IF NOT EXISTS provider_accounts (id TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id), identity_id TEXT NOT NULL REFERENCES identities(id), provider TEXT NOT NULL, label TEXT NOT NULL, user_ref TEXT NOT NULL, created INTEGER NOT NULL, UNIQUE(provider,user_ref));
      CREATE TABLE IF NOT EXISTS provider_selections (user_id TEXT NOT NULL REFERENCES users(id), provider TEXT NOT NULL, account_id TEXT NOT NULL REFERENCES provider_accounts(id), PRIMARY KEY(user_id,provider));
      CREATE TABLE IF NOT EXISTS grants (name TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id), fingerprint TEXT NOT NULL, state TEXT NOT NULL, ciphertext TEXT, expires INTEGER NOT NULL);
      CREATE TABLE IF NOT EXISTS events (id TEXT PRIMARY KEY, user_id TEXT NOT NULL, done INTEGER NOT NULL DEFAULT 0);
      CREATE TABLE IF NOT EXISTS stripe_registration (slot INTEGER PRIMARY KEY CHECK(slot=1), nonce TEXT NOT NULL, created INTEGER NOT NULL, url TEXT NOT NULL, endpoint_id TEXT, ciphertext TEXT, ready INTEGER NOT NULL DEFAULT 0);
      CREATE TABLE IF NOT EXISTS limits (key TEXT PRIMARY KEY, count INTEGER NOT NULL, expires INTEGER NOT NULL);`);
    this.sql
      .exec(`CREATE INDEX IF NOT EXISTS provider_accounts_owner ON provider_accounts(user_id,provider,created);
      CREATE INDEX IF NOT EXISTS identities_owner ON identities(user_id,created);`);
  }
  one(sql, ...args) {
    return this.sql.prepare(sql).get(...args);
  }
  all(sql, ...args) {
    return this.sql.prepare(sql).all(...args);
  }
  run(sql, ...args) {
    return this.sql.prepare(sql).run(...args);
  }
  user(id) {
    return this.one("SELECT * FROM users WHERE id=?", id);
  }
  transaction(fn) {
    this.sql.exec("BEGIN IMMEDIATE");
    try {
      const result = fn();
      this.sql.exec("COMMIT");
      return result;
    } catch (error) {
      this.sql.exec("ROLLBACK");
      throw error;
    }
  }
  close() {
    this.sql.close();
  }
}
