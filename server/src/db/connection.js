import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import Database from 'better-sqlite3';
import { config } from '../config.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const db = new Database(config.dbPath);
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

const schemaPath = path.join(__dirname, 'schema.sql');
const schemaSql = fs.readFileSync(schemaPath, 'utf8');
runMigrationsBeforeSchema();
db.exec(schemaSql);
runMigrations();

function runMigrationsBeforeSchema() {
  const sessionsTable = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='sessions'").get();
  if (sessionsTable) {
    const sessionColumns = db.prepare('PRAGMA table_info(sessions)').all();
    const sessionColumnNames = new Set(sessionColumns.map((c) => c.name));
    const expiresColumn = sessionColumns.find((c) => c.name === 'expires_at');
    if (expiresColumn?.notnull) {
      db.exec(`
        CREATE TABLE IF NOT EXISTS sessions_new (
          id TEXT PRIMARY KEY,
          expires_at INTEGER,
          duration TEXT NOT NULL DEFAULT 'remember',
          created_at INTEGER NOT NULL
        );
        INSERT OR IGNORE INTO sessions_new (id, expires_at, duration, created_at)
        SELECT id, expires_at, 'remember', created_at FROM sessions;
        DROP TABLE sessions;
        ALTER TABLE sessions_new RENAME TO sessions;
      `);
    } else if (!sessionColumnNames.has('duration')) {
      db.exec("ALTER TABLE sessions ADD COLUMN duration TEXT NOT NULL DEFAULT 'remember'");
    }
  }

  const logsTable = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='request_logs'").get();
  if (logsTable) {
    const logColumns = db.prepare('PRAGMA table_info(request_logs)').all();
    const logColumnNames = new Set(logColumns.map((c) => c.name));
    if (!logColumnNames.has('oauth_account_id')) db.exec('ALTER TABLE request_logs ADD COLUMN oauth_account_id TEXT');
  }

  const table = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='oauth_provider_accounts'").get();
  if (!table) return;
  const columns = db.prepare('PRAGMA table_info(oauth_provider_accounts)').all();
  if (columns.some((c) => c.name === 'is_default')) return;
  const indexes = db.prepare('PRAGMA index_list(oauth_provider_accounts)').all();
  const hasProviderUnique = indexes.some((idx) => idx.unique && String(idx.name || '').includes('provider'));
  if (!hasProviderUnique) return;
  db.exec(`
    CREATE TABLE IF NOT EXISTS oauth_provider_accounts_new (
      id TEXT PRIMARY KEY,
      provider_id TEXT NOT NULL,
      provider_name TEXT NOT NULL,
      account_label TEXT,
      account_subject TEXT,
      account_email TEXT,
      token_type TEXT,
      scope TEXT,
      expires_at INTEGER,
      encrypted_access_token TEXT NOT NULL,
      encrypted_refresh_token TEXT,
      masked_access_token TEXT,
      is_default INTEGER NOT NULL DEFAULT 0,
      last_used_at INTEGER,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    );
    INSERT OR IGNORE INTO oauth_provider_accounts_new (
      id, provider_id, provider_name, token_type, scope, expires_at,
      encrypted_access_token, encrypted_refresh_token, masked_access_token, is_default,
      last_used_at, created_at, updated_at
    )
    SELECT id, provider_id, provider_name, token_type, scope, expires_at,
      encrypted_access_token, encrypted_refresh_token, masked_access_token, 1,
      last_used_at, created_at, updated_at
    FROM oauth_provider_accounts;
    DROP TABLE oauth_provider_accounts;
    ALTER TABLE oauth_provider_accounts_new RENAME TO oauth_provider_accounts;
  `);
}

function runMigrations() {
  const table = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='oauth_provider_accounts'").get();
  if (!table) return;
  const columns = db.prepare('PRAGMA table_info(oauth_provider_accounts)').all();
  const names = new Set(columns.map((c) => c.name));
  const indexes = db.prepare('PRAGMA index_list(oauth_provider_accounts)').all();
  const hasProviderUnique = indexes.some((idx) => idx.unique && String(idx.name || '').includes('provider'));
  if (hasProviderUnique) {
    db.exec(`
      CREATE TABLE IF NOT EXISTS oauth_provider_accounts_new (
        id TEXT PRIMARY KEY,
        provider_id TEXT NOT NULL,
        provider_name TEXT NOT NULL,
        account_label TEXT,
        account_subject TEXT,
        account_email TEXT,
        token_type TEXT,
        scope TEXT,
        expires_at INTEGER,
        encrypted_access_token TEXT NOT NULL,
        encrypted_refresh_token TEXT,
        masked_access_token TEXT,
        is_default INTEGER NOT NULL DEFAULT 0,
        last_used_at INTEGER,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL
      );
      INSERT OR IGNORE INTO oauth_provider_accounts_new (
        id, provider_id, provider_name, token_type, scope, expires_at,
        encrypted_access_token, encrypted_refresh_token, masked_access_token, is_default,
        last_used_at, created_at, updated_at
      )
      SELECT id, provider_id, provider_name, token_type, scope, expires_at,
        encrypted_access_token, encrypted_refresh_token, masked_access_token, 1,
        last_used_at, created_at, updated_at
      FROM oauth_provider_accounts;
      DROP TABLE oauth_provider_accounts;
      ALTER TABLE oauth_provider_accounts_new RENAME TO oauth_provider_accounts;
    `);
  }
  const addColumn = (name, ddl) => {
    const refreshed = db.prepare('PRAGMA table_info(oauth_provider_accounts)').all();
    if (!refreshed.some((c) => c.name === name)) db.exec(`ALTER TABLE oauth_provider_accounts ADD COLUMN ${ddl}`);
  };
  addColumn('account_label', 'account_label TEXT');
  addColumn('account_subject', 'account_subject TEXT');
  addColumn('account_email', 'account_email TEXT');
  addColumn('is_default', 'is_default INTEGER NOT NULL DEFAULT 0');
  addColumn('plan_name', 'plan_name TEXT');
  addColumn('quota_status', 'quota_status TEXT');
  addColumn('quota_reset_cadence', 'quota_reset_cadence TEXT');
  addColumn('quota_next_reset_at', 'quota_next_reset_at INTEGER');
  addColumn('last_health_ok', 'last_health_ok INTEGER');
  addColumn('last_health_status', 'last_health_status INTEGER');
  addColumn('last_health_error', 'last_health_error TEXT');
  addColumn('last_health_checked_at', 'last_health_checked_at INTEGER');
  addColumn('oauth_metadata', 'oauth_metadata TEXT');
  db.exec('CREATE INDEX IF NOT EXISTS idx_oauth_provider_accounts_provider ON oauth_provider_accounts(provider_id)');
  db.exec('CREATE INDEX IF NOT EXISTS idx_oauth_provider_accounts_default ON oauth_provider_accounts(provider_id, is_default)');
  const providers = db.prepare('SELECT DISTINCT provider_id AS providerId FROM oauth_provider_accounts').all();
  const setDefault = db.prepare(`
    UPDATE oauth_provider_accounts SET is_default = CASE WHEN id = ? THEN 1 ELSE 0 END WHERE provider_id = ?
  `);
  for (const provider of providers) {
    const current = db.prepare('SELECT id FROM oauth_provider_accounts WHERE provider_id = ? AND is_default = 1 LIMIT 1').get(provider.providerId);
    if (!current) {
      const latest = db.prepare('SELECT id FROM oauth_provider_accounts WHERE provider_id = ? ORDER BY updated_at DESC LIMIT 1').get(provider.providerId);
      if (latest) setDefault.run(latest.id, provider.providerId);
    }
  }

  const keyTable = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='unified_api_keys'").get();
  if (keyTable) {
    const keyColumns = db.prepare('PRAGMA table_info(unified_api_keys)').all();
    const keyColumnNames = new Set(keyColumns.map((c) => c.name));
    if (!keyColumnNames.has('encrypted_key')) db.exec('ALTER TABLE unified_api_keys ADD COLUMN encrypted_key TEXT');
    if (!keyColumnNames.has('masked_key')) db.exec('ALTER TABLE unified_api_keys ADD COLUMN masked_key TEXT');
  }

  const sessionsTable = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='sessions'").get();
  if (sessionsTable) {
    const sessionColumns = db.prepare('PRAGMA table_info(sessions)').all();
    const sessionColumnNames = new Set(sessionColumns.map((c) => c.name));
    if (!sessionColumnNames.has('duration')) db.exec("ALTER TABLE sessions ADD COLUMN duration TEXT NOT NULL DEFAULT 'remember'");
  }

  const logsTable = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='request_logs'").get();
  if (logsTable) {
    const logColumns = db.prepare('PRAGMA table_info(request_logs)').all();
    const logColumnNames = new Set(logColumns.map((c) => c.name));
    if (!logColumnNames.has('oauth_account_id')) db.exec('ALTER TABLE request_logs ADD COLUMN oauth_account_id TEXT');
    db.exec('CREATE INDEX IF NOT EXISTS idx_logs_oauth_account ON request_logs(provider_id, oauth_account_id)');
  }
}

export { db };
export default db;
