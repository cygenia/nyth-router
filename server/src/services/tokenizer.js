// Lightweight token estimation. Approximates tokens as ~4 characters per token,
// which is a good fallback when provider-specific tokenizers aren't available.
// Real provider-reported usage from chat completions overrides these estimates.

export function estimateTokens(value) {
  if (value == null) return 0;
  let text;
  if (typeof value === 'string') text = value;
  else {
    try { text = JSON.stringify(value); } catch { text = String(value); }
  }
  if (!text) return 0;
  const chars = text.length;
  const words = text.split(/\s+/).filter(Boolean).length;
  // Heuristic: 4 chars per token, but at least 1 token per word.
  return Math.max(words, Math.ceil(chars / 4));
}

export function estimateMessages(messages = []) {
  if (!Array.isArray(messages)) return 0;
  let total = 0;
  for (const m of messages) {
    total += estimateTokens(m.content || '');
    total += 4; // overhead per message
  }
  return total;
}

export function preview(value, maxLen = 240) {
  if (value == null) return '';
  let text;
  if (typeof value === 'string') text = value;
  else if (Array.isArray(value)) text = value.map((p) => p?.content || p?.text || (typeof p === 'string' ? p : '')).join(' ');
  else {
    try { text = JSON.stringify(value); } catch { text = String(value); }
  }
  text = text.replace(/\s+/g, ' ').trim();
  if (text.length <= maxLen) return text;
  return `${text.slice(0, Math.max(0, maxLen - 1))}…`;
}
