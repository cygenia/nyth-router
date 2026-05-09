import * as openai from './openai.js';
import * as anthropic from './anthropic.js';

export function getAdapter(format) {
  if (format === 'anthropic-compatible') return anthropic;
  // openai-compatible, native (treat as openai-compatible best-effort), local
  return openai;
}

export { openai, anthropic };
