# QR Utility | Phase 1

A lightweight, mobile-first QR code scanner built with **HTML + CSS + JavaScript**. Design direction: **Utility App (B)**, with separate Camera, Upload image, and Result views.

## What's included

- Camera scanning, requesting permission only when the user taps **Start camera**.
- Automatic QR detection and a **Stop camera** control.
- Optional camera switching and flashlight, shown only when supported.
- Decode QR codes from images and screenshots, including drag-and-drop on desktop.
- View scanned text/URLs, copy the exact content, and manually open HTTPS/HTTP links.
- **Scan again** and **Upload another** actions.
- No database, account, or upload endpoint. QR decoding happens in the browser.
- Camera is stopped when leaving the Camera view or when the page is backgrounded.

## Project structure

```text
qr-scanner-utility/
├── index.html        # Semantic markup and view structure
├── style.css         # Responsive Utility App styling
├── app.js            # Camera, image scanning, view and result logic
├── favicon.svg       # Simple vector favicon
├── vercel.json       # Hosting / security-response headers
├── sample-qr.png     # Test QR code containing https://example.com/qr-utility-test
└── README.md
```

## Deploy with GitHub + Vercel (no npm)

1. Create a new GitHub repository, for example `qr-scanner-utility`.
2. Upload **all the files from this folder into the repository root** (not the parent ZIP folder).
3. In [vercel.com/new](https://vercel.com/new), import the GitHub repository.
4. Use **Framework Preset: Other**. No build command or install command is needed. Keep the output directory at the project root / default for a plain static site.
5. Deploy. Open the resulting HTTPS URL on your phone.
6. Tap **Start camera** and grant permission. You can also choose **Upload image**, then select `sample-qr.png` to test decoding.

Every subsequent GitHub push to the deployed branch can trigger a fresh Vercel deployment.

## Test locally

Opening `index.html` directly via `file://` is not the recommended way to test JavaScript modules or camera permissions.

If Python is available, run from the project directory:

```bash
python -m http.server 8000
```

Then visit `http://localhost:8000/` on your computer. Camera access is allowed on `localhost` in browsers that support it. For testing on a **phone**, use the **HTTPS Vercel URL** rather than your computer's local-network HTTP address.

## Privacy and security

- QR codes are decoded **locally** in the browser; no QR content, camera feed, or uploaded images are sent to the app server.
- The QR decoding engine is lazily loaded from the **jsDelivr CDN** only when needed. Its code is a third-party dependency and requires a network connection to load unless cached by the browser. This request does not include your QR content.
- Only absolute `http://` or `https://` links are offered an **Open link** action. Scanning never automatically follows a link.
- Always check a scanned address before visiting. A QR can point to a malicious website.
- The selected image is limited to 15 MB. Some formats (notably HEIC) depend on the browser's decoding support.
- No scan history is persisted. Results are kept in memory only until the page is closed or refreshed.
- The app is **not** an installed PWA in Phase 1.

## Decoder library

Uses [nimiq/qr-scanner](https://github.com/nimiq/qr-scanner) version `1.4.2` (MIT License), loaded as an ES module from jsDelivr:

```text
https://cdn.jsdelivr.net/npm/qr-scanner@1.4.2/qr-scanner.min.js
```

The library fetches its corresponding worker script as needed. No Node.js, npm, webpack, or framework is necessary for this app.

## Possible Phase 2 enhancements

Optional installable PWA, opt-in local scan history, better QR type recognition (Wi-Fi, vCard, email), and offline bundling of the scanner library. None are required for Phase 1.
