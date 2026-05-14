// Shared test setup. Imported FIRST by every test file so that env vars are
// applied before config.js / db/connection.js read process.env on load.
import os from 'node:os';
import path from 'node:path';
import fs from 'node:fs';
import crypto from 'node:crypto';

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'nyth-test-'));
process.env.NYTH_DB_PATH = path.join(tmp, 'test.db');
process.env.NYTH_MASTER_KEY = crypto.randomBytes(32).toString('hex');
process.env.NYTH_PASSWORD='test-password-min-15-chars';
process.env.NYTH_LOG_RETENTION_DAYS = '0';
process.env.NYTH_PROMPT_LOG_MODE = 'preview';

export const TEST_DIR = tmp;
