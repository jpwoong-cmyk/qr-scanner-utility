# Scanme-QR v3

Simple browser-based QR scanner using HTML, CSS and JavaScript. Works on HTTPS Vercel sites. This update is based on the working QR Scanner v2 project.

## Usage

1. Tap **Start camera**, read the Singlish confirmation, then choose **Allow this time**. Your browser may also show its camera permission prompt.
2. Scan a QR code. The camera stops and the decoded value appears. **Open** is displayed only for HTTP/HTTPS URLs. Other content gets **Copy text**.
3. Tap **Scan again** to return to the idle scanner. Scanme-QR **does not reopen the camera automatically**. A new tap opens the confirmation again.
4. To scan from a file, choose **Upload from documents**, accept the same confirmation, then select an image from your device.

## How permission works (important)

Scanme-QR itself asks you to confirm **on every scan session or document selection**. After scanning, stopping, tab hiding or leaving, it stops the camera stream. File access is limited to the file you choose with the browser's picker, without folder or library privileges.

**A website cannot force Chrome/Safari to forget a previously granted camera permission** or guarantee a fresh *browser-level* permission prompt every time. On mobile, choose your browser's **Allow this time** option when offered, or clear the site's saved camera permission in browser Site settings if you previously allowed persistent access. Our in-app prompt appears regardless.

## File and link safeguards

- Select a single image, not a directory. Only PNG, JPG/JPEG, or WebP files are accepted. File content signatures are checked, not merely file extensions.
- Images are limited to 10 MiB and (where `createImageBitmap` is supported) 40 megapixels.
- Decoding happens in the browser. There is **no server upload code**, account, database, persistent scan log, or local storage.
- Decoded values are inserted using `textContent`, never rendered as HTML. Only HTTP/HTTPS URLs without embedded usernames/passwords get an Open button. The destination isn't opened automatically.
- HTTPS and a security-headers policy are configured in `vercel.json`, including Content Security Policy, no microphone permission, no framing, and no referrer leaking from Open links.
- The QR decoding library `qr-scanner@1.4.2` is fetched as a pinned-version module from jsDelivr only when needed and remains a third-party runtime dependency. That CDN is allowed by the Content Security Policy. An offline/local vendored dependency would further reduce that trust boundary.

## Deploy to GitHub + Vercel

1. Replace the existing repo files (`index.html`, `style.css`, `app.js`, `vercel.json`, `README.md`; favicon and sample QR are included).
2. Push to the main branch; Vercel redeploys automatically if connected.
3. Open your HTTPS URL, test the camera consent with your phone, then upload `sample-qr.png` to test image decoding.

No Node.js, npm, build configuration, app installation, or backend is needed.

## Note about 1× zoom

The preview still uses `object-fit: contain`. On compatible devices the physical-camera zoom slider starts at 1× (or the nearest supported zoom). Some phone browsers don't expose camera zoom. It is not necessarily the same field of view as the phone's own camera app.
