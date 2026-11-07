// Optional developer checks. Run: node security/url-audit.test.mjs
import assert from 'node:assert/strict';
import { auditQrText } from './url-audit.js';
const fixtures = [
  ['https://example.com/path', 'review'],
  ['http://example.com', 'caution'],
  ['https://bit.ly/a', 'caution'],
  ['https://xn--pple-43d.com', 'caution'],
  ['https://example.com:8443', 'caution'],
  ['https://safe.example@evil.example', 'blocked'],
  ['javascript:alert(1)', 'blocked'],
  ['data:text/html,evil', 'blocked'],
  ['http://localhost:3000', 'blocked'],
  ['http://127.0.0.1/admin', 'blocked'],
  ['http://192.168.1.1', 'blocked'],
  ['http://[::1]/', 'blocked'],
  ['https://example.com/\nredirect', 'blocked'],
  ['Hello, this is a QR note', 'text'],
];
for (const [qr, severity] of fixtures) {
  const report = auditQrText(qr);
  assert.equal(report.severity, severity, `${qr} should be ${severity}`);
  assert.equal(report.onlineChecked, false);
  if (severity === 'blocked') assert.equal(report.href, null);
}
console.log(`PASS: ${fixtures.length} URL/text security scenarios`);
