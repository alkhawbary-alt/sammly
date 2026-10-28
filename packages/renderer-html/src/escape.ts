export function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/** For a CSS string inside double quotes: drop anything that could close the string, rule or tag. */
export function cssString(s: string): string {
  return `"${s.replace(/["\\<>\n\r{};]/g, '')}"`;
}

/** URL for `url("…")` / `src="…"`. Only safe schemes; quotes and angle brackets are percent-encoded. */
export function safeUrl(u: string): string {
  if (!/^(https?:|data:image\/|data:font\/|data:application\/font|blob:)/i.test(u)) return '';
  return u.replace(/"/g, '%22').replace(/'/g, '%27').replace(/</g, '%3C').replace(/>/g, '%3E').replace(/[\n\r]/g, '');
}

export function px(n: number): string {
  return `${Math.round(n * 1000) / 1000}px`;
}
