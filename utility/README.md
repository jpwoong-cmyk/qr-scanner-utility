# SCANme-QR: locally hosted QR engine (dependency record)

**Purpose:** This folder contains the two prebuilt JavaScript files used to decode QR codes. They are **not SCANme-QR original source**. The originals come from the open-source [Nimiq QR Scanner](https://github.com/nimiq/qr-scanner) project. This file exists so future maintainers or a GitHub-reading assistant can audit their provenance, compare future changes and assess patches.

## 1. Installed dependency

| Field | Value |
|---|---|
| Upstream project | `nimiq/qr-scanner` |
| Upstream repository | https://github.com/nimiq/qr-scanner |
| Package name | `qr-scanner` (npm) |
| Recorded package version | **1.4.2** |
| Source snapshot / pinned Git commit | [`abcfe1bce2703721408d8ce7ebde94a359998506`](https://github.com/nimiq/qr-scanner/commit/abcfe1bce2703721408d8ce7ebde94a359998506) |
| Commit message / date | `v1.4.2` / 2022-11-23 |
| Licence | **MIT**, see `utility/LICENSE` (Nimiq and danimoh copyright) |
| Imported into SCANme-QR | **2026-11-08** |
| Local path | `utility/` at SCANme-QR repository root |
| Runtime external CDN required | **No** |
| Automatic dependency updates | **No** |

**Snapshot rule:** Do not copy the current moving `master` branch when auditing. Compare against the exact commit recorded above first. The two checked-in files were taken from that pinned upstream Git commit, where `package.json` says version `1.4.2`. They have been compared with the pinned Git blobs. This check does **not** independently attest that an npm tarball/CDN mirror is byte-identical or that the code is free of vulnerabilities.

## 2. Files, hashes and original links

| File | Bytes | SHA-256 of file | Git blob SHA-1 |
|---|---:|---|---|
| `qr-scanner.min.js` | 15,844 | `0564e4cf84b94cac80213b4f779bd215bb0876a91c19df28baf97766f4fd5484` | `3f31ec98ab681a4fb3ceac6c837007a3e24cfce6` |
| `qr-scanner-worker.min.js` | 43,994 | `f4d8445f5a15c4e5f71a8c8c062c6443f09db370b8d3fe1fbdc7fe7889630d14` | `8425f8b1a4c6041a1ff9cf391963ccc43d45ae8a` |
| `LICENSE` | 1,071 | `f9e6b44d80d0eb44442c7e66af8a756709a61e4d9adf0a54b8951a92ece734e2` | `316816fc97f7eaef2fc044a1309a54008e4f6685` |

**Pinned upstream source:**

- Main module: https://raw.githubusercontent.com/nimiq/qr-scanner/abcfe1bce2703721408d8ce7ebde94a359998506/qr-scanner.min.js
- Decoder worker: https://raw.githubusercontent.com/nimiq/qr-scanner/abcfe1bce2703721408d8ce7ebde94a359998506/qr-scanner-worker.min.js
- Licence: https://raw.githubusercontent.com/nimiq/qr-scanner/abcfe1bce2703721408d8ce7ebde94a359998506/LICENSE
- Release package metadata: https://github.com/nimiq/qr-scanner/blob/abcfe1bce2703721408d8ce7ebde94a359998506/package.json
- npm registry page: https://www.npmjs.com/package/qr-scanner
- Previous external-CDN URL (retained only as historical provenance, **not used by SCANme-QR v9**): https://cdn.jsdelivr.net/npm/qr-scanner@1.4.2/qr-scanner.min.js

The upstream project explicitly documents copying these two prebuilt files next to each other without a bundler. The main module imports the worker using a relative path. **Keep these two files in the same `utility/` folder.**

## 3. Where the website imports them

From the repository's root `app.js`:

```js
const QR_LIBRARY_URL = './utility/qr-scanner.min.js';
```

- `app.js` loads the local module only when a QR scan or image decode is needed.
- That module dynamically loads `./qr-scanner-worker.min.js` from its own folder when necessary.
- Vercel serves both JavaScript files from SCANme-QR's domain. Decoding happens in the **phone/browser**, not on the Vercel server.
- `vercel.json` uses `script-src 'self'` and `connect-src 'self'`. `worker-src 'self' blob:` is kept because the QR worker uses an in-browser Blob worker internally.
- These files are third-party code; **do not manually edit their minified contents**. Replace them together only after review.

## 4. How to confirm nobody silently altered the copies

### Windows PowerShell (from repository root)

```powershell
Get-FileHash .\utility\qr-scanner.min.js -Algorithm SHA256
Get-FileHash .\utility\qr-scanner-worker.min.js -Algorithm SHA256
Get-FileHash .\utility\LICENSE -Algorithm SHA256
```

Compare the resulting values to the SHA-256 hashes above. **A mismatch means the bytes changed** and should trigger an investigation. A matching hash confirms file integrity relative to this record, **not** that the original library has no vulnerabilities.

### macOS / Linux

```bash
shasum -a 256 utility/qr-scanner.min.js utility/qr-scanner-worker.min.js utility/LICENSE
```

### Optional Git check (if Git is installed)

```bash
git hash-object utility/qr-scanner.min.js
git hash-object utility/qr-scanner-worker.min.js
```

These Git blob hashes must match the table. They can also be compared with the pinned upstream commit's Git blobs.

## 5. Check for patches or security issues later

A newer version or a newly reported vulnerability **cannot** be detected by local hashes alone. When asking ChatGPT to review this folder, or performing an occasional maintenance review:

1. Read **this README** to establish the exact installed version and pinned source commit. Verify the checked-in files still match these hashes.
2. Check [npm's `qr-scanner` page](https://www.npmjs.com/package/qr-scanner) for a newer published version and [upstream commits](https://github.com/nimiq/qr-scanner/commits/master) for changes after `abcfe1b...`.
3. Check [GitHub security advisories](https://github.com/nimiq/qr-scanner/security/advisories), [GitHub issues](https://github.com/nimiq/qr-scanner/issues), and relevant vulnerability databases (e.g. [OSV](https://osv.dev/)) for applicable findings. No reported advisory does **not** establish safety.
4. For proposed updates, review the **actual source diff** and licence, verify the new official release/version, and record the new commit, source URLs, download date, SHA-256 hashes, reason, and tests in this README.
5. Update the main file and matching worker **as a pair**. Do not silently upgrade one and leave the other behind.
6. Retest `Tap to Scan`, `Scan again`, document upload, flash, camera switch, camera stop, minimum zoom, and the result screen on actual Android Chrome / installed shortcut. If Node is available, run `node security/url-audit.test.mjs` from the repository root.
7. Confirm a browser's Network panel no longer requests `cdn.jsdelivr.net` or another unexpected JavaScript host. Inspect the deployed CSP and ensure the copied files are served as JavaScript with HTTP 200.
8. Only then approve and deploy the new release. Roll back to the previous verified files if functionality regresses.

**Maintenance policy:** Updates should be reviewed, **not automatic**. A patch decision should be based on applicable security fixes, compatibility, and testing, not solely on a different version number.

## 6. Instructions for a future GitHub audit

> Review `utility/README.md` before changing the decoder. Confirm installed file hashes and source commit, check upstream Nimiq GitHub/npm releases and relevant advisories **as of today's date**, identify any new patches and their impact, and report whether SCANme-QR should update. Do not modify or deploy until the user approves the change.

Keep this record committed in GitHub alongside the decoder and `utility/LICENSE` so the origin can be established years later.
