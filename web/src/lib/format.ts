export function formatNumber(value: number | undefined | null) {
  if (value == null) return '0';
  return Number(value).toLocaleString('en-US');
}

export function formatCurrency(value: number | undefined | null) {
  if (value == null) return '$0.00';
  if (value === 0) return '$0.00';
  if (Math.abs(value) < 0.01) return `$${value.toFixed(4)}`;
  return `$${value.toFixed(2)}`;
}

export function formatCost(value: number | undefined | null, incomplete?: boolean) {
  if (incomplete) return value && value > 0 ? `${formatCurrency(value)}+` : 'Unpriced';
  return formatCurrency(value);
}

export function formatLatency(ms: number | undefined | null) {
  if (ms == null) return '-';
  if (ms < 1000) return `${Math.round(ms)} ms`;
  return `${(ms / 1000).toFixed(2)} s`;
}

export function relativeTime(ts: number | undefined | null) {
  if (!ts) return '-';
  const diff = Date.now() - ts;
  if (diff < 30_000) return 'just now';
  if (diff < 60_000) return `${Math.round(diff / 1000)}s ago`;
  if (diff < 3_600_000) return `${Math.round(diff / 60_000)}m ago`;
  if (diff < 86_400_000) return `${Math.round(diff / 3_600_000)}h ago`;
  return new Date(ts).toLocaleDateString();
}

export function copyToClipboard(text: string) {
  if (navigator.clipboard && window.isSecureContext) {
    return navigator.clipboard.writeText(text);
  }
  const ta = document.createElement('textarea');
  ta.value = text;
  ta.style.position = 'fixed';
  ta.style.opacity = '0';
  document.body.appendChild(ta);
  ta.select();
  document.execCommand('copy');
  document.body.removeChild(ta);
  return Promise.resolve();
}
