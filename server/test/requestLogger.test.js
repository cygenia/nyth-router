import './setup.js';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import db from '../src/db/connection.js';
import { logRequest } from '../src/services/requestLogger.js';

function clearUsage() {
  db.prepare('DELETE FROM request_logs').run();
  db.prepare('DELETE FROM usage_daily').run();
  db.prepare('DELETE FROM fallback_events').run();
  db.prepare('DELETE FROM prompt_fingerprints').run();
}

test('logRequest aggregates usage for requests without an app id', () => {
  clearUsage();
  logRequest({
    id: 'req_test_no_app',
    ts: Date.now(),
    providerId: 'openai',
    model: 'gpt-test',
    inputTokens: 100,
    outputTokens: 40,
    estimatedCost: 0.012,
    status: 'ok',
    endpoint: '/v1/chat/completions',
    prompt: [{ role: 'user', content: 'hello' }],
  });
  logRequest({
    id: 'req_test_no_app_2',
    ts: Date.now(),
    providerId: 'openai',
    model: 'gpt-test',
    inputTokens: 50,
    outputTokens: 20,
    estimatedCost: 0.006,
    status: 'error',
    endpoint: '/v1/chat/completions',
    prompt: [{ role: 'user', content: 'hello again' }],
  });
  const rows = db.prepare('SELECT request_count AS requestCount, input_tokens AS inputTokens, output_tokens AS outputTokens, error_count AS errorCount FROM usage_daily WHERE provider_id = ? AND model = ?').all('openai', 'gpt-test');
  assert.equal(rows.length, 1);
  assert.equal(rows[0].requestCount, 2);
  assert.equal(rows[0].inputTokens, 150);
  assert.equal(rows[0].outputTokens, 60);
  assert.equal(rows[0].errorCount, 1);
});
