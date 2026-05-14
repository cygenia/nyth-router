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
  const configuredMasterKey = env.NYTH_MASTER_KEY;
  if (configuredMasterKey && configuredMasterKey.length >= 16) {
    return configuredMasterKey;
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
  password: env.NYTH_PASSWORD || '',
  masterKey: ensureMasterKey(),
  dbPath: env.NYTH_DB_PATH || path.join(dataDir, 'nyth.db'),
  logRetentionDays: Number(env.NYTH_LOG_RETENTION_DAYS || 30),
  promptLogMode: ['off', 'metadata', 'preview', 'full'].includes(env.NYTH_PROMPT_LOG_MODE)
    ? env.NYTH_PROMPT_LOG_MODE
    : 'preview',
  sessionTtlMs: 1000 * 60 * 60 * 12,
  webDistPath: path.join(ROOT, 'web', 'dist'),
};

export function isProduction() {
  return env.NODE_ENV === 'production';
}
