/**
 * Local-only QR URL precheck. No fetch, no analytics, no reputation verdict.
 * Security decisions are deliberately conservative; clean != safe.
 */
const SHORTENERS = new Set([
  'bit.ly', 'tinyurl.com', 't.co', 'cutt.ly', 'is.gd', 'rb.gy',
  'rebrand.ly', 'shorturl.at', 'ow.ly', 'tiny.cc', 'buff.ly'
]);
const BLOCKED_SCHEMES = /^(?:javascript|data|vbscript|file|intent|blob|about|chrome|content):/i;
const CONTROL_CHARS = /[\u0000-\u001f\u007f\u200b-\u200f\u202a-\u202e\u2060\u2066-\u2069]/u;
const IPV4 = /^(?:\d{1,3}\.){3}\d{1,3}$/;
const INTERNAL_SUFFIX = /(?:^|\.)(?:localhost|local|internal|test|invalid|onion)$/i;

export function auditQrText(input) {
  const value = String(input ?? '').trim();
  const common = { original: value, href: null, hostname: '', reasons: [], onlineChecked: false };
  if (!value) return { ...common, kind: 'blocked', severity: 'blocked', title: 'Nothing to scan', message: 'Empty QR content.' };
  if (value.length > 8192) return { ...common, kind: 'blocked', severity: 'blocked', title: 'Eh, careful.', message: 'QR content is unusually large.' };
  if (CONTROL_CHARS.test(value)) return { ...common, kind: 'blocked', severity: 'blocked', title: 'Eh, careful.', message: 'Hidden or control characters found.' };
  if (BLOCKED_SCHEMES.test(value)) return { ...common, kind: 'blocked', severity: 'blocked', title: 'Eh, careful.', message: 'This link type is blocked.' };

  if (!/^https?:\/\//i.test(value)) {
    return { ...common, kind: 'text', severity: 'text', title: 'Ok done.', message: 'Text QR, not a web link.' };
  }

  let url;
  try { url = new URL(value); } catch {
    return { ...common, kind: 'blocked', severity: 'blocked', title: 'Eh, careful.', message: 'Invalid web address.' };
  }
  if (!['https:', 'http:'].includes(url.protocol)) {
    return { ...common, kind: 'blocked', severity: 'blocked', title: 'Eh, careful.', message: 'Unsupported link type.' };
  }
  const hostname = url.hostname.toLowerCase().replace(/\.$/, '');
  const base = { ...common, kind: 'link', href: url.href, hostname };
  if (url.username || url.password) {
    return { ...base, kind: 'blocked', href: null, severity: 'blocked', title: 'Eh, careful.', message: 'This link hides a username in its address.' };
  }
  if (value.length > 2048) {
    return { ...base, kind: 'blocked', href: null, severity: 'blocked', title: 'Eh, careful.', message: 'Web address is unusually long.' };
  }
  // Direct network addresses can access a router, NAS, internal service, etc.
  if (!hostname || IPV4.test(hostname) || hostname.startsWith('[') ||
      !hostname.includes('.') || INTERNAL_SUFFIX.test(hostname)) {
    return { ...base, kind: 'blocked', href: null, severity: 'blocked', title: 'Eh, careful.', message: 'Local or direct network addresses are blocked.' };
  }
  const reasons = [];
  if (url.protocol === 'http:') reasons.push('No HTTPS encryption');
  if (hostname.includes('xn--')) reasons.push('Encoded domain name');
  if (SHORTENERS.has(hostname)) reasons.push('Short link hides its destination');
  if (hostname.split('.').length > 5) reasons.push('Unusually many subdomains');
  if (hostname.length > 100) reasons.push('Unusually long domain');
  if (url.port && !['80', '443'].includes(url.port)) reasons.push('Unusual network port');
  if (/%(?:00|0a|0d|09)/i.test(value)) reasons.push('Encoded control character');
  if (reasons.length) {
    return { ...base, reasons, severity: 'caution', title: 'Eh, careful.', message: reasons.join(' · ') };
  }
  return { ...base, severity: 'review', title: 'Ok done. Open?', message: 'No obvious red flags. Not verified online.' };
}
