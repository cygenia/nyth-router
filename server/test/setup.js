// Shared test setup. Imported FIRST by every test file so that env vars are
// applied before config.js / db/connection.js read process.env on load.
import os from 'node:os';
import path from 'node:path';
import fs from 'node:fs';
import crypto from 'node:crypto';

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'bigliner-test-'));
process.env.BIGLINER_DB_PATH = path.join(tmp, 'test.db');
process.env.BIGLINER_MASTER_KEY = crypto.randomBytes(32).toString('hex');
process.env.BIGLINER_PASSWORD = 'test-password-15chars';
process.env.BIGLINER_LOG_RETENTION_DAYS = '0';
process.env.BIGLINER_PROMPT_LOG_MODE = 'preview';

export const TEST_DIR = tmp;
