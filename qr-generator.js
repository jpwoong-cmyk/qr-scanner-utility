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
    <h1 id="qrgen-result-title" tabindex="-1">Ok done. Save?</h1>
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
      <button id="qrgen-another" class="btn btn-secondary" type="button">
        Generate another
      </button>
      <button id="qrgen-back" class="btn btn-secondary" type="button">
        Back to Scan
      </button>
    </div>
    <p class="qrgen-save-note">On some phones, downloads are saved to Files.</p>`;
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
  const heading = el('#qrgen-result-title');
  let libraryPromise = null;
  let blobURL = null;
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
    return URL.createObjectURL(blob);
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
      const newBlobURL = await preparePNG(finalCanvas);
      if (generation !== activeGeneration || !dialog.open) {
        URL.revokeObjectURL(newBlobURL);
        return;
      }

      entry.hidden = true;
      building.hidden = false;
      await animateAssembly(qr, generation);
      if (generation !== activeGeneration || !dialog.open) {
        URL.revokeObjectURL(newBlobURL);
        return;
      }

      if (blobURL) URL.revokeObjectURL(blobURL);
      blobURL = newBlobURL;
      save.href = blobURL;
      // The link is displayed as plain text, never injected as HTML.
      el('#qrgen-result-link').textContent = link;
      finalCanvas.setAttribute('aria-label', `QR code for ${link}`);

      dialog.close();
      scannerView.hidden = true;
      result.hidden = false;
      result.classList.remove('entering');
      void result.offsetWidth; // Replay existing success check animation.
      result.classList.add('entering');
      heading.focus({ preventScroll: true });
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
  });
}
