import path from 'node:path';
import fs from 'node:fs';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..', '..');

function readEnvFile() {
  const envPath = path.join(ROOT, '..', '.env');
  if (!fs.existsSync(envPath)) return {};
  const out = {};
  const text = fs.readFileSync(envPath, 'utf8');
  for (const line of text.split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/);
    if (m && !line.trim().startsWith('#')) {
      let value = m[2];
      if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
        value = value.slice(1, -1);
      }
      out[m[1]] = value;
    }
  }
  return out;
}

const fileEnv = readEnvFile();
const env = { ...fileEnv, ...process.env };

const dataDir = path.join(__dirname, '..', 'data');
fs.mkdirSync(dataDir, { recursive: true });

function ensureMasterKey() {
  if (env.BIGLINER_MASTER_KEY && env.BIGLINER_MASTER_KEY.length >= 16) {
    return env.BIGLINER_MASTER_KEY;
  }
  const keyPath = path.join(dataDir, 'master.key');
  if (fs.existsSync(keyPath)) {
    return fs.readFileSync(keyPath, 'utf8').trim();
  }
  const generated = crypto.randomBytes(32).toString('hex');
  fs.writeFileSync(keyPath, generated, { mode: 0o600 });
  return generated;
}

export const config = {
  rootDir: ROOT,
  dataDir,
  port: Number(env.PORT || 9879),
  host: env.HOST || 'localhost',
  password: env.BIGLINER_PASSWORD || '',
  masterKey: ensureMasterKey(),
  dbPath: env.BIGLINER_DB_PATH || path.join(dataDir, 'bigliner.db'),
  logRetentionDays: Number(env.BIGLINER_LOG_RETENTION_DAYS || 30),
  promptLogMode: ['off', 'metadata', 'preview', 'full'].includes(env.BIGLINER_PROMPT_LOG_MODE)
    ? env.BIGLINER_PROMPT_LOG_MODE
    : 'preview',
  sessionTtlMs: 1000 * 60 * 60 * 12,
  webDistPath: path.join(ROOT, '..', 'web', 'dist'),
};

export function isProduction() {
  return env.NODE_ENV === 'production';
}
