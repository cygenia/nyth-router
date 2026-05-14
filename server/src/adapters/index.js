import * as openai from './openai.js';
import * as anthropic from './anthropic.js';
import * as codex from './codex.js';
import * as geminiOauth from './geminiOauth.js';
import * as kiro from './kiro.js';

export function getAdapter(format) {
  if (format === 'anthropic-compatible') return anthropic;
  if (format === 'codex-account') return codex;
  if (format === 'gemini-oauth-account') return geminiOauth;
  if (format === 'kiro-account') return kiro;
  // openai-compatible, native (treat as openai-compatible best-effort), local
  return openai;
}

export { openai, anthropic, codex, geminiOauth, kiro };
