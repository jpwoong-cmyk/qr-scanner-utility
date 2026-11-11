/**
 * SCANme-QR: Generate QR Code add-on.
 * Requires only one extra module tag in index.html.
 * Uses the existing scanner's result styles and success tick.
 * QR generation is browser-side; input is never sent to a QR-generation API.
 */
const QR_LIBRARY_URL =
  'https://cdn.jsdelivr.net/npm/qrcode-generator@1.4.4/qrcode.min.js';

const scannerView = document.querySelector('#scanner-view');
const uploadButton = document.querySelector('#choose-image');
const appMain = document.querySelector('.app-shell main');

if (!scannerView || !uploadButton || !appMain) {
  console.error('QR generator: SCANme-QR scanner markup not found.');
} else {
  initializeGenerator();
}

function initializeGenerator() {
  // Keeping this as a separate module avoids modifying app.js or the scanner.
  const stylesheet = document.createElement('link');
  stylesheet.rel = 'stylesheet';
  stylesheet.href = './qr-generator.css';
  document.head.append(stylesheet);

  const trigger = document.createElement('button');
  trigger.id = 'qrgen-trigger';
  trigger.className = 'upload-button qrgen-trigger';
  trigger.type = 'button';
  trigger.innerHTML = `
    <svg class="icon" aria-hidden="true" viewBox="0 0 24 24"
         fill="none" stroke="currentColor" stroke-width="1.8"
         stroke-linecap="round" stroke-linejoin="round">
      <rect x="3" y="3" width="7" height="7" rx="1"/>
      <rect x="14" y="3" width="7" height="7" rx="1"/>
      <rect x="3" y="14" width="7" height="7" rx="1"/>
      <path d="M16 14v3h-3m5 0h3v4m-7 0h3"/>
    </svg>
    Generate QR Code`;
  uploadButton.insertAdjacentElement('afterend', trigger);

  // Dialog has the input and QR assembling stage.
  const dialog = document.createElement('dialog');
  dialog.id = 'qrgen-dialog';
  dialog.className = 'qrgen-dialog';
  dialog.setAttribute('aria-labelledby', 'qrgen-title');
  dialog.innerHTML = `
    <div class="qrgen-inner">
      <div class="qrgen-heading">
        <h2 id="qrgen-title">Generate QR Code</h2>
        <button id="qrgen-close" class="qrgen-close" type="button"
                aria-label="Close QR generator">&#215;</button>
      </div>
      <section id="qrgen-entry">
        <p id="qrgen-instruction">Put your link in the box below.</p>
        <form id="qrgen-form" novalidate>
          <label class="visually-hidden" for="qrgen-input">Website link</label>
          <div class="qrgen-input-row">
            <input id="qrgen-input" type="url" inputmode="url"
                   placeholder="https://example.com" autocapitalize="off"
                   autocomplete="url" spellcheck="false"
                   aria-describedby="qrgen-instruction qrgen-error"
                   maxlength="2048" required>
            <button id="qrgen-submit" class="qrgen-arrow" type="submit"
                    title="Generate QR" aria-label="Generate QR Code">
              <svg aria-hidden="true" viewBox="0 0 24 24" width="22" height="22"
                   fill="none" stroke="currentColor" stroke-width="2"
                   stroke-linecap="round" stroke-linejoin="round">
                <path d="M4 12h16m-7-7 7 7-7 7"/>
              </svg>
            </button>
          </div>
        </form>
        <p id="qrgen-error" class="qrgen-error" role="alert" hidden></p>
        <p class="qrgen-footnote">Creates a QR code on your device. No account needed.</p>
      </section>
      <section id="qrgen-building" class="qrgen-building" hidden
               role="status" aria-live="polite">
        <canvas id="qrgen-assembly" width="320" height="320"
                aria-label="QR code assembling"></canvas>
        <p>Assembling QR code…</p>
      </section>
    </div>`;
  document.body.append(dialog);

  // Separate screen, but uses the scanner's .result-view/.entering styling.
  // This keeps the existing Scan again behavior completely unchanged.
  const result = document.createElement('section');
  result.id = 'qrgen-result';
  result.className = 'result-view qrgen-result';
  result.hidden = true;
  result.setAttribute('aria-labelledby', 'qrgen-result-title');
  result.innerHTML = `
    <span class="result-success" aria-hidden="true">
      <svg class="drawn-check" viewBox="0 0 54 54" fill="none">
        <circle class="check-ring" cx="27" cy="27" r="23"
                stroke="currentColor" stroke-width="3"/>
        <path class="check-stroke" d="M15 27.5 23.5 36 40 19"
              stroke="currentColor" stroke-width="4"
              stroke-linecap="round" stroke-linejoin="round"/>
      </svg>
    </span>
    <h1 id="qrgen-result-title" tabindex="-1">Your QR is ready</h1>\n    <p class="qrgen-result-subtitle">Scan, save, or send it anywhere.</p>
    <div class="qrgen-preview">
      <canvas id="qrgen-final" width="1024" height="1024"
              role="img" aria-label="Generated QR code"></canvas>
    </div>
    <p class="qrgen-result-link" id="qrgen-result-link"></p>
    <div class="result-actions qrgen-actions">
      <a id="qrgen-save" class="btn btn-primary"
         download="SCANme-QR.png" href="#" aria-label="Save QR as PNG">
        Save as PNG
      </a>
      <button id="qrgen-copy" class="btn btn-secondary" type="button"><span aria-hidden="true">▣</span> Copy image</button>
      <button id="qrgen-share" class="btn btn-secondary" type="button"><span aria-hidden="true">↗</span> Share image</button>
      <button id="qrgen-another" class="btn btn-secondary" type="button">
        <span aria-hidden="true">↻</span> Generate another
      </button>
      <button id="qrgen-back" class="btn btn-secondary" type="button">
        <span aria-hidden="true">⌂</span> Back to Scan
      </button>
    </div>
    <p class="qrgen-save-note" id="qrgen-share-status" role="status" aria-live="polite">Copy the QR as an image, share it, or save the PNG.</p>`;
  appMain.append(result);

  const el = (selector) => document.querySelector(selector);
  const input = el('#qrgen-input');
  const form = el('#qrgen-form');
  const error = el('#qrgen-error');
  const entry = el('#qrgen-entry');
  const building = el('#qrgen-building');
  const assemblyCanvas = el('#qrgen-assembly');
  const finalCanvas = el('#qrgen-final');
  const save = el('#qrgen-save');
  const copyQR = el('#qrgen-copy');
  const shareQR = el('#qrgen-share');
  const shareStatus = el('#qrgen-share-status');
  const heading = el('#qrgen-result-title');
  let libraryPromise = null;
  let blobURL = null;
  let pngBlob = null;
  let activeGeneration = 0;
  let busy = false;

  function openDialog() {
    // Open only from the scanner idle screen.
    if (busy || !result.hidden || document.body.classList.contains('is-scanning')) return;
    error.hidden = true;
    entry.hidden = false;
    building.hidden = true;
    dialog.showModal();
    input.focus();
  }

  function showError(message) {
    error.textContent = message;
    error.hidden = false;
    input.setAttribute('aria-invalid', 'true');
    input.focus();
  }

  function normalizeLink(value) {
    const raw = value.trim();
    if (!raw) throw new Error('Enter a website link first.');
    if (/[\u0000-\u001F\u007F]/.test(raw))
      throw new Error('Please remove hidden characters from the link.');

    // Accept bare domains, but never turn another URL scheme into an HTTPS link.
    const text = /^https?:\/\//i.test(raw) ? raw
      : /^[a-z][a-z0-9+.-]*:/i.test(raw) ? raw
      : `https://${raw}`;
    let url;
    try { url = new URL(text); }
    catch { throw new Error('That does not look like a valid website link.'); }

    if (!['https:', 'http:'].includes(url.protocol) || !url.hostname)
      throw new Error('Only HTTP and HTTPS website links are supported.');
    if (url.username || url.password)
      throw new Error('Links with embedded usernames or passwords are not supported.');
    if (url.href.length > 2048)
      throw new Error('This link is too long for the generator.');
    return url.href;
  }

  function getLibrary() {
    if (typeof window.qrcode === 'function')
      return Promise.resolve(window.qrcode);
    if (libraryPromise) return libraryPromise;

    libraryPromise = new Promise((resolve, reject) => {
      const script = document.createElement('script');
      script.src = QR_LIBRARY_URL;
      script.async = true;
      script.referrerPolicy = 'no-referrer';
      script.onload = () => {
        if (typeof window.qrcode === 'function') resolve(window.qrcode);
        else reject(new Error('The QR generator library did not initialize.'));
      };
      script.onerror = () =>
        reject(new Error('Could not load QR generator. Check your internet connection.'));
      document.head.append(script);
    }).catch((err) => { libraryPromise = null; throw err; });
    return libraryPromise;
  }

  // Draw QR modules as solid pixels, including the mandatory four-module
  // white quiet zone. Integer sizing prevents thin anti-aliasing seams.
  function drawQR(canvas, qr, visibleModules = null) {
    const ctx = canvas.getContext('2d', { alpha: false });
    if (!ctx) throw new Error('Your browser cannot draw a QR image.');
    const n = qr.getModuleCount();
    const cells = n + 8;
    const pitch = Math.max(1, Math.floor(canvas.width / cells));
    const origin = Math.floor((canvas.width - cells * pitch) / 2);
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = '#000';
    if (visibleModules) {
      for (const [r, c] of visibleModules) {
        ctx.fillRect(origin + (c + 4) * pitch,
                     origin + (r + 4) * pitch, pitch, pitch);
      }
    } else {
      for (let r = 0; r < n; r++)
        for (let c = 0; c < n; c++)
          if (qr.isDark(r, c))
            ctx.fillRect(origin + (c + 4) * pitch,
                         origin + (r + 4) * pitch, pitch, pitch);
    }
  }

  // Animate the QR's ACTUAL dark modules rather than drawing fake QR art.
  function animateAssembly(qr, generation) {
    const n = qr.getModuleCount();
    const darkModules = [];
    for (let r = 0; r < n; r++)
      for (let c = 0; c < n; c++)
        if (qr.isDark(r, c)) darkModules.push([r, c]);

    for (let i = darkModules.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [darkModules[i], darkModules[j]] = [darkModules[j], darkModules[i]];
    }

    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      drawQR(assemblyCanvas, qr);
      return Promise.resolve();
    }

    return new Promise(resolve => {
      const duration = 950;
      let began = null;
      let lastPainted = -1;
      function frame(timestamp) {
        if (generation !== activeGeneration || !dialog.open) {
          resolve();
          return;
        }
        if (began === null) began = timestamp;
        const t = Math.min(1, (timestamp - began) / duration);
        const amount = Math.floor((1 - Math.pow(1 - t, 2)) * darkModules.length);
        if (amount !== lastPainted) {
          drawQR(assemblyCanvas, qr, darkModules.slice(0, amount));
          lastPainted = amount;
        }
        if (t < 1) requestAnimationFrame(frame);
        else resolve();
      }
      requestAnimationFrame(frame);
    });
  }

  async function preparePNG(canvas) {
    const blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/png'));
    if (!blob) throw new Error('PNG export is unavailable in this browser.');
    return { url: URL.createObjectURL(blob), blob };
  }

  // Keep the QR visually anchored while the modal yields to the result.
  // The transition layer is visual only and never intercepts the result actions.
  function revealGeneratedResult() {
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const origin = assemblyCanvas.getBoundingClientRect();
    const ghost = document.createElement('div');
    ghost.className = 'qrgen-reveal-ghost';
    const preview = document.createElement('canvas');
    preview.width = assemblyCanvas.width;
    preview.height = assemblyCanvas.height;
    preview.getContext('2d').drawImage(assemblyCanvas, 0, 0);
    ghost.append(preview);
    Object.assign(ghost.style, {
      left: `${origin.left}px`, top: `${origin.top}px`,
      width: `${origin.width}px`, height: `${origin.height}px`
    });
    if (!reduced) document.body.append(ghost);

    // Result is ready before closing the modal; no blank intermediate frame.
    scannerView.hidden = true;
    result.hidden = false;
    result.classList.remove('entering');
    dialog.close();
    void result.offsetWidth;
    result.classList.add('entering');

    if (reduced) {
      heading.focus({ preventScroll: true });
      return;
    }
    const destination = finalCanvas.getBoundingClientRect();
    requestAnimationFrame(() => {
      ghost.style.left = `${destination.left}px`;
      ghost.style.top = `${destination.top}px`;
      ghost.style.width = `${destination.width}px`;
      ghost.style.height = `${destination.height}px`;
      ghost.classList.add('is-completing');
    });
    ghost.addEventListener('transitionend', () => ghost.remove(), { once: true });
    setTimeout(() => ghost.remove(), 850);
    heading.focus({ preventScroll: true });
  }

  async function generate() {
    if (busy) return;
    error.hidden = true;
    input.removeAttribute('aria-invalid');

    let link;
    try { link = normalizeLink(input.value); }
    catch (err) { showError(err.message); return; }

    busy = true;
    const generation = ++activeGeneration;
    el('#qrgen-submit').disabled = true;

    try {
      const encode = await getLibrary();
      if (generation !== activeGeneration || !dialog.open) return;

      const qr = encode(0, 'M');
      qr.addData(link, 'Byte');
      qr.make();

      drawQR(finalCanvas, qr);
      const png = await preparePNG(finalCanvas);
      if (generation !== activeGeneration || !dialog.open) {
        URL.revokeObjectURL(png.url);
        return;
      }

      entry.hidden = true;
      building.hidden = false;
      await animateAssembly(qr, generation);
      if (generation !== activeGeneration || !dialog.open) {
        URL.revokeObjectURL(png.url);
        return;
      }

      if (blobURL) URL.revokeObjectURL(blobURL);
      blobURL = png.url;
      pngBlob = png.blob;
      save.href = blobURL;
      shareStatus.textContent = 'Copy the QR as an image, share it, or save the PNG.';
      shareQR.hidden = !navigator.share;
      // The link is displayed as plain text, never injected as HTML.
      el('#qrgen-result-link').textContent = link;
      finalCanvas.setAttribute('aria-label', `QR code for ${link}`);

      revealGeneratedResult();
    } catch (err) {
      if (generation === activeGeneration && dialog.open) {
        entry.hidden = false;
        building.hidden = true;
        showError(
          typeof err?.message === 'string'
            ? err.message : 'Unable to generate a QR for this link.'
        );
      }
    } finally {
      if (generation === activeGeneration) {
        busy = false;
        el('#qrgen-submit').disabled = false;
      }
    }
  }

  function returnToScanner() {
    result.hidden = true;
    result.classList.remove('entering');
    scannerView.hidden = false;
    trigger.focus();
  }

  copyQR.addEventListener('click', async () => {
    if (!pngBlob) return;
    if (!window.isSecureContext || !navigator.clipboard?.write || !window.ClipboardItem) {
      shareStatus.textContent = 'Image clipboard is unavailable here. Use Share or Save as PNG.';
      return;
    }
    copyQR.disabled = true;
    try {
      await navigator.clipboard.write([new ClipboardItem({ 'image/png': pngBlob })]);
      shareStatus.textContent = 'QR image copied. Paste into a supported app.';
    } catch {
      shareStatus.textContent = 'This browser blocked image copying. Try Share or Save as PNG.';
    } finally { copyQR.disabled = false; }
  });

  shareQR.addEventListener('click', async () => {
    if (!pngBlob || !navigator.share) return;
    const file = new File([pngBlob], 'SCANme-QR.png', { type: 'image/png' });
    const payload = { files: [file], title: 'SCANme-QR' };
    if (navigator.canShare && !navigator.canShare(payload)) {
      shareStatus.textContent = 'Sharing QR images is not supported here. Try Copy or Save as PNG.';
      return;
    }
    shareQR.disabled = true;
    try {
      await navigator.share(payload);
      shareStatus.textContent = 'QR image shared.';
    } catch (err) {
      if (err?.name !== 'AbortError') {
        shareStatus.textContent = 'Unable to share this QR image. Try Copy or Save as PNG.';
      }
    } finally { shareQR.disabled = false; }
  });

  trigger.addEventListener('click', openDialog);
  el('#qrgen-close').addEventListener('click', () => dialog.close());
  dialog.addEventListener('close', () => {
    activeGeneration++;
    busy = false;
    el('#qrgen-submit').disabled = false;
    entry.hidden = false;
    building.hidden = true;
    input.removeAttribute('aria-invalid');
    if (result.hidden) trigger.focus();
  });
  form.addEventListener('submit', (event) => {
    event.preventDefault();
    generate();
  });
  input.addEventListener('input', () => {
    error.hidden = true;
    input.removeAttribute('aria-invalid');
  });

  el('#qrgen-back').addEventListener('click', returnToScanner);
  el('#qrgen-another').addEventListener('click', () => {
    returnToScanner();
    openDialog();
    input.select();
  });
  window.addEventListener('pagehide', () => {
    activeGeneration++;
    if (blobURL) URL.revokeObjectURL(blobURL);
    pngBlob = null;
  });
}
