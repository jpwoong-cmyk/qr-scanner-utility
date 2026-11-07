# SCANme-QR v4

Mobile-first QR scanner in plain HTML, CSS, and JavaScript, ready for GitHub + Vercel. This is an update to the working v3 scanner; no framework, backend, npm, or API key is required.

## What's new

- Brand header now says **SCANme-QR** and uses the supplied **J logo** in a charcoal badge.
- Browser favicon and iPhone home-screen icon use a square icon adapted from the same logo. The original logo artwork itself has not been redrawn.
- Shorter Singlish confirmations:
  - Camera: **Use camera?** / **Paiseh ah, need your permission first.** / **Not now** and **Ok can**.
  - Documents: **Want upload ah?** / **Ok loh, choose image from documents.** / **Don't want** and **Ok Choose**.
- Cleaner scanner with **Scan QR**, **Upload from documents**, and a simple **Result** view.

## Run and deploy

Upload the contents of this folder to the root of your existing GitHub repository. Include all image assets, the updated `index.html`, `style.css`, `app.js`, and `vercel.json`. If Vercel is connected to GitHub, it will deploy after you push. Open the HTTPS URL on your phone and verify both flows.

The `sample-qr.png` file lets you test **Upload from documents**.

## Security and permissions

- SCANme-QR asks for **in-app confirmation every time** before starting camera or opening the file picker. It does not request directory or library access.
- A website **cannot force the browser to revoke an already-saved camera permission** or show a fresh native permission dialog on every attempt. Choose your browser's temporary permission option, if available, or clear saved permissions in site settings.
- When scanning stops, finishes, tab is hidden, or page is closed, the camera stream is released. **Scan again** does not automatically restart the camera.
- Selected images are checked for PNG/JPEG/WebP file signatures and are limited to 10 MiB. Resolution is also checked where supported.
- Scanned content is displayed as text, never HTML. Only HTTP/HTTPS links without embedded credentials receive an **Open** button; nothing auto-opens. Read the destination before visiting.
- QR decoding happens locally in the browser using the version-pinned `qr-scanner@1.4.2` decoder loaded from jsDelivr when required. This is a third-party network dependency, but QR content and image files are not sent to an application server by our code.
- `vercel.json` retains CSP, frame restrictions, referrer policy, and limited permissions.
- The camera's physical 1× zoom starts at 1× or the closest available setting, and the zoom slider only appears when supported. Preview uses `object-fit: contain` to avoid cropping.

Files: `index.html`, `style.css`, `app.js`, `J_logo.png`, `J_logo_icon.png`, `vercel.json`, `sample-qr.png`, `README.md`.
