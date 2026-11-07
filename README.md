# QR Scanner · Minimal utility (v2)

Mobile-first QR code scanner. Plain HTML, CSS, and JavaScript. No backend or build tools.

## What's changed from Phase 1

- Removed sidebar, workspace/phase copy, privacy labels, footer, tabs, and result metadata.
- Live camera preview uses `object-fit: contain` instead of `cover`, so the camera picture isn't visually cropped to fill the box.
- Vertical physical-camera zoom slider at the right, initialized to 1× whenever the camera starts or flips, when the browser reports zoom support. If the device's supported zoom minimum is above 1, the app uses that minimum instead. If unavailable, the slider is hidden.
- After scanning a URL, shows the decoded result with **Open** and **Scan again**. For non-link text, **Copy text** replaces Open.
- Image upload remains available as a small secondary action, without a separate view.

## Deploy

1. Create a GitHub repository and place the extracted files at the repository root.
2. In Vercel, import the repository; Framework Preset **Other**, no build command.
3. Open the HTTPS deployment in your phone browser and tap **Start camera**.

Files: `index.html`, `style.css`, `app.js`, `favicon.svg`, `sample-qr.png`, `vercel.json`, `README.md`.

## Notes

- Uses `qr-scanner@1.4.2` from jsDelivr at runtime. First-use requires internet.
- Camera zoom uses `MediaStreamTrack.getCapabilities()` and `applyConstraints()`. Slider visibility and min/max depend on the phone/browser. '1×' is the camera's zoom setting, not necessarily the same field of view as your phone's native Camera app.
- URL results **never open automatically**. Only explicit HTTP/HTTPS links get an Open button.
- No scan history, server storage or upload destination.
- For a fast image test, use the included `sample-qr.png`.
