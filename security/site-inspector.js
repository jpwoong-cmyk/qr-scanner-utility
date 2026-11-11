/**
 * SCANme-QR local URL inspector.
 * No fetch, external dependencies, DNS, certificate checks or reputation claims.
 * Findings are observations, not a trust verdict.
 */
const SHORTENERS = new Set(['bit.ly','tinyurl.com','t.co','cutt.ly','is.gd','rb.gy','rebrand.ly','shorturl.at','ow.ly','tiny.cc','buff.ly']);
const SUSPICIOUS_TOKENS = /(?:login|verify|account|password|wallet|payment|secure|update|confirm|reset)/i;

export function inspectSite(audit) {
  if (audit.kind !== 'link') return null;
  const original = String(audit.original || '');
  let url;
  try { url = new URL(audit.href || original); }
  catch {
    return {
      domain: audit.hostname || 'Unavailable',
      status: 'blocked',
      headline: 'Address blocked by safety checks',
      findings: [{label:'URL format',value:'Could not inspect as a usable web address',level:'blocked'}],
      caveat: 'No connection to this site was made.'
    };
  }
  const host = url.hostname.toLowerCase();
  const findings = [];
  const add = (label,value,level='neutral') => findings.push({label,value,level});
  add('Website address',host);
  add('Connection type',url.protocol === 'https:' ? 'HTTPS requested (certificate not checked)' : 'HTTP: no HTTPS requested',url.protocol === 'https:' ? 'neutral' : 'warning');
  add('Domain encoding',host.includes('xn--') ? 'Punycode detected: inspect spelling' : 'No Punycode marker found',host.includes('xn--') ? 'warning' : 'neutral');
  add('Shortened link',SHORTENERS.has(host) ? 'Yes: final destination unknown' : 'Not a recognized short-link provider',SHORTENERS.has(host) ? 'warning' : 'neutral');
  const hostParts=host.split('.');
  add('Subdomains',hostParts.length > 5 ? 'Unusually many levels' : 'No unusual depth detected',hostParts.length > 5 ? 'warning' : 'neutral');
  add('URL length',original.length > 2048 ? 'Unusually long' : `${original.length} characters`,original.length > 2048 ? 'warning' : 'neutral');
  const encoded=/%(?:00|0a|0d|09)/i.test(original);
  add('Hidden characters',encoded ? 'Encoded control sequence detected' : 'No common encoded controls detected',encoded ? 'warning' : 'neutral');
  if (url.port && !['80','443'].includes(url.port)) add('Network port',`Unusual port: ${url.port}`,'warning');
  if (SUSPICIOUS_TOKENS.test(url.pathname + url.search)) add('Sensitive terms','Contains account or verification-related words. Not proof of fraud.','neutral');
  add('TLS certificate','Not inspected');
  add('Threat reputation','Not inspected (offline)');
  add('Redirect destination','Not followed');
  const blocked=audit.severity === 'blocked';
  const caution=audit.severity === 'caution';
  return {
    domain:host,
    status: blocked ? 'blocked' : caution ? 'caution' : 'unverified',
    headline:blocked ? 'Blocked by local safety rules' : caution ? 'Potential warning signs detected' : 'No obvious URL warning signs',
    findings,
    caveat:'Offline URL inspection only. Not a trust certificate, malware scan or website verification. No site was contacted.'
  };
}
