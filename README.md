# SCANme-QR v5

A simple browser QR scanner for GitHub + Vercel. No database, login, build step or Android package.

## What's new

- Smaller J logo in the header.
- The `QR` letters in the wordmark are replaced by a small decorative QR-like icon. It is **not a real QR code**.
- **Tap to Scan** replaces **Scan QR**.
- The camera preview fills the screen while scanning, with only Stop, zoom (if supported), flash (if supported), and camera switch (if supported).
- All idle actions (Tap to Scan and Upload from documents) sit inside one large camera box.
- A **Shortcut** button explains Add to Home Screen on iPhone/Android. Supported Chromium browsers may show a native Install prompt.
- Included `manifest.webmanifest`, Android app icons, and an Apple touch icon based on the existing J logo.

## Deployment

1. Copy all files and the `icons` folder into the **root** of the existing GitHub repository.
2. Include `vercel.json` so security headers remain active.
3. Vercel deploys automatically when linked to GitHub.
4. Open the deployed HTTPS site on a phone and tap **Tap to Scan**.

**Important:** The browser controls whether it retains camera permission. This app asks for its own confirmation on every scan and ends camera tracks when scanning stops, a result is found, or the page becomes hidden.

## Add to Home Screen

Tap **Shortcut** in the header.
- **Android:** If the browser offers installation, use the native prompt. Otherwise choose *Add to Home screen* or *Install app* in the browser's menu.
- **iPhone:** Use the browser's Share menu → *Add to Home Screen* → *Add*.

When launched from the Home Screen, the web app uses a standalone layout where the browser supports it. This is **not** a native APK. A browser cannot force a shortcut to appear without user action.

## Security and privacy

- QR content is rendered as text, never as executable HTML.
- External links never auto-open; only HTTP and HTTPS are eligible for **Open**.
- Images are processed on the device; the app only reads the selected file, with signature, size and image-dimension checks.
- Camera session is released after scanning. The app doesn't store scan history.
- The QR decoding library loads from jsDelivr on first use (network required). No files/QR payloads are intentionally uploaded by this code.

## Files

- `index.html` — page layout and dialogs
- `style.css` — idle and immersive scanning layouts
- `app.js` — scanner, security checks, permissions, shortcuts
- `manifest.webmanifest` — web app installation metadata
- `icons/` — 192px and 512px app icons
- `J_logo.png`, `J_logo_icon.png`, `apple-touch-icon.png` — branding
- `sample-qr.png` — test image
- `vercel.json` — security headers

Try a real phone after deploying: camera zoom support, flash control and install UI differ across devices and browsers.
