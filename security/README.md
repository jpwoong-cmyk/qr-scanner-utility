# Security lane — QR address check

`url-audit.js` is deliberately small and runs **entirely in the browser** after decoding but **before displaying the address**. It does not send scanned content to any server.

- **Review:** HTTP(S) URL with no obvious local warning signs. Open is available. This is **NOT** a malware/phishing clean bill.
- **Caution:** HTTP without TLS, link shortener, punycode domain, long/unusual URL or port, etc. User gets a second confirmation before Open.
- **Blocked:** executable/unsafe URL schemes, URL credentials, private/localhost/IP endpoints, malformed addresses, hidden controls. Open is unavailable; user can still see/copy the decoded text.
- **Text:** Plain text QR: copy only.

## Important limitations

There is no live threat intelligence, domain ownership validation, DNS resolution, redirect inspection, content analysis or actual malicious-page detection in this version. New or perfectly normal-looking phishing links can pass local checks. This scanner never labels a URL “safe.”

To add live reputation checks later, implement a separate Vercel API route with server-side credentials and a privacy notice describing URLs sent to the provider. Google Safe Browsing API is licensed for non-commercial use; Google's Web Risk service is the commercial alternative. Never put API keys in browser JavaScript or query unknown links directly from the user's device to "test" them.
