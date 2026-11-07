# SCANme-QR v7

A lightweight, mobile-first browser QR scanner. Static HTML, CSS and JavaScript. Built for GitHub + Vercel, with no npm, login or database.

## What's changed

- **Security lane:** `security/url-audit.js` runs a **local URL precheck before the decoded address is displayed**. Normal HTTPS links show the decoded address without an extra badge; suspicious URLs require another confirmation; blocked link types cannot be opened through the app. Details in `security/README.md`.
- **Zoom at 0 extra zoom:** camera opens at the smallest zoom the device/browser reports, and the slider starts at **0**. `0` is a relative UI baseline, not a literal physical `0×` camera. Devices with no exposed zoom slider cannot be controlled by the site. Video uses `object-fit: contain` and never CSS zoom/crop, so black bars are possible when the camera aspect ratio differs from the phone screen.
- **Moving scan line:** subtle green line travels up and down inside the scan brackets while the camera is active. Respects reduced-motion preferences.
- **Exit animation:** after decoding, the app immediately releases the camera, shows a short "Checking link…" transition, and slides to the result page.
- **Smiley mouse:** small, understated line-art mouse replaces the larger cartoon icon.
- **Result copy:** normal link says "Ok done. Open?". Suspicious links say "Eh, careful.". Non-link QR codes say "Ok done." and allow copying.
- **Scan again:** immediately opens the existing camera consent dialog and starts the camera when confirmed. The idle Scan button is restored if permission is declined.
- **Shortcut button:** renamed **Add shortcut**.
- **Result wording:** removed the “Not verified online” badge on ordinary links, while retaining caution/block warnings.
- **Original branding and permissions** preserved.

## Deploy to GitHub + Vercel

1. Extract the ZIP, copy everything into the root of your existing GitHub repository, and commit. **Keep the `security` and `icons` folders.**
2. The Vercel deployment connected to GitHub redeploys automatically.
3. Open the HTTPS link on your phone. Tap **Tap to Scan**, grant camera access, and point at a QR code.
4. Camera controls vary by hardware: flashlight, camera switching, and optical/digital zoom are exposed only when supported.

## Security behaviour and limitations

Everything in `security/` runs locally. QR content isn't uploaded to a scanning server. Checks include URL protocol, embedded URL credentials, local network/IP hosts, punycode, shortened URLs, TLS, unusual ports, overly long URLs and control characters.

**Crucial:** This is **not** a live malware/phishing-reputation scan. A phishing address can look normal and pass. The app never labels a QR URL “safe.” No external reputation lookup, redirect inspection, DNS/IP ownership check, file content sandbox or anti-malware engine is implemented. Don't treat “No obvious red flags” as proof of safety. An ordinary-looking URL can lead to an unsafe site after you open it. User privacy was prioritized over sending scans to a third-party API without a separate design and disclosure.

If you want threat-list lookup later, use a Vercel serverless API endpoint and a reputation provider such as Google Safe Browsing (non-commercial terms) or Web Risk (commercial). Keep secrets server-side, add an explicit data-use notice, and handle unavailable lookup distinctly from a clean result. See `security/README.md`.

## Permission behaviour

- The app displays its Singlish confirmation for every camera session and document selection.
- Camera tracks are stopped after detection, Stop, backgrounding or leaving the page.
- Browser-managed permission persistence cannot be cleared or forced by a website.
- Document selection exposes only the chosen image; uploads are limited to PNG/JPG/WebP and validated by format, size (10 MB max) and dimensions.
- QR text is inserted as text, never HTML. No URL opens automatically. External links use `noopener noreferrer`, no-referrer, and only allowed HTTP(S) URLs.
- The QR library is loaded from jsDelivr when scanning is first needed. A network connection is required for the first decoder load.

## Project files

- `index.html` / `style.css` / `app.js` — app UI and scanner logic
- `security/url-audit.js` — pure, standalone QR security checks
- `security/README.md` — security architecture and extension notes
- `security/url-audit.test.mjs` — optional Node.js tests (not required to deploy)
- `manifest.webmanifest` / `icons/` — mobile shortcut
- `J_logo.png` / `J_logo_icon.png` / `apple-touch-icon.png` — existing J branding
- `vercel.json` — security headers including CSP
- `sample-qr.png` — sample QR image

## Quick checks

Without a phone, you can upload `sample-qr.png`, or run `node security/url-audit.test.mjs` if Node is installed. A real mobile browser is required to verify actual camera zoom, autofocus, lens selection, flash and shortcut availability.
