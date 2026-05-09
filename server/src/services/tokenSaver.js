import { compress, getCompressionStats } from 'caveman-plus';
import { estimateTokens } from './tokenizer.js';

const DEFAULTS = {
  enabled: false,
  mode: 'safe',
  compressToolOutput: true,
  compressAssistantOutput: false,
  maxToolOutputChars: 12000,
};

export function getTokenSaverSettings(settings = {}) {
  return {
    enabled: settings.tokenSaverEnabled === true || settings.tokenSaverEnabled === 'true' || DEFAULTS.enabled,
    mode: String(settings.tokenSaverMode || DEFAULTS.mode),
    compressToolOutput: settings.compressToolOutput !== false && settings.compressToolOutput !== 'false',
    compressAssistantOutput: settings.compressAssistantOutput === true || settings.compressAssistantOutput === 'true',
    maxToolOutputChars: Number(settings.maxToolOutputChars || DEFAULTS.maxToolOutputChars),
  };
}

export function compressText(value, options = {}) {
  const text = typeof value === 'string' ? value : stringify(value);
  const beforeTokens = estimateTokens(text);
  const trimmed = text.slice(0, Number(options.maxChars || DEFAULTS.maxToolOutputChars));
  const compressed = compress(trimmed, { mode: options.mode || DEFAULTS.mode });
  const stats = getCompressionStats(trimmed, compressed);
  return {
    text: compressed,
    originalChars: text.length,
    compressedChars: compressed.length,
    beforeTokens,
    afterTokens: estimateTokens(compressed),
    reductionPercent: stats.reductionPercent || 0,
    truncated: text.length > trimmed.length,
  };
}

export function optimizeMessages(messages = [], settings = {}) {
  const cfg = getTokenSaverSettings(settings);
  if (!cfg.enabled || !Array.isArray(messages)) return { messages, savings: null };
  let beforeTokens = 0;
  let afterTokens = 0;
  let compressedCount = 0;
  const next = messages.map((message) => {
    const raw = typeof message.content === 'string' ? message.content : stringify(message.content);
    beforeTokens += estimateTokens(raw);
    const shouldCompress = (message.role === 'tool' && cfg.compressToolOutput)
      || (message.role === 'assistant' && cfg.compressAssistantOutput);
    if (!shouldCompress || !raw) {
      afterTokens += estimateTokens(raw);
      return message;
    }
    const result = compressText(raw, { mode: cfg.mode, maxChars: cfg.maxToolOutputChars });
    afterTokens += result.afterTokens;
    compressedCount += 1;
    return { ...message, content: result.text };
  });
  return {
    messages: next,
    savings: {
      beforeTokens,
      afterTokens,
      savedTokens: Math.max(0, beforeTokens - afterTokens),
      reductionPercent: beforeTokens ? Math.round(((beforeTokens - afterTokens) / beforeTokens) * 100) : 0,
      compressedMessages: compressedCount,
    },
  };
}

function stringify(value) {
  try { return JSON.stringify(value, null, 2); } catch { return String(value); }
}
