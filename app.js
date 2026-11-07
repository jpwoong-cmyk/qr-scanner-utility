// Browser-only QR scanner. Reuses Phase 1's decoder, camera/flash and image upload.
const QR_LIBRARY_URL = 'https://cdn.jsdelivr.net/npm/qr-scanner@1.4.2/qr-scanner.min.js';
const MAX_UPLOAD_BYTES = 10 * 1024 * 1024;
const MAX_IMAGE_PIXELS = 40_000_000;
const ALLOWED_IMAGE_FORMATS = new Set(['image/png', 'image/jpeg', 'image/webp']);
const $ = (selector) => document.querySelector(selector);

const ui = {
  scannerView: $('#scanner-view'), resultView: $('#result-view'),
  frame: $('#camera-frame'), video: $('#camera-video'),
  cameraStatus: $('#camera-status'), cameraStatusText: $('#camera-status-text'),
  start: $('#start-camera'), stop: $('#stop-camera'), flip: $('#switch-camera'), flash: $('#toggle-flash'),
  zoomContainer: $('#zoom-control'), zoom: $('#zoom-slider'), zoomValue: $('#zoom-value'),
  chooseImage: $('#choose-image'), imageInput: $('#image-input'),
  resultText: $('#result-text'), open: $('#open-link'), copy: $('#copy-text'), again: $('#scan-again'),
  toast: $('#toast'),
  consent: $('#permission-dialog'), consentTitle: $('#permission-title'),
  consentMessage: $('#permission-message'), consentConfirm: $('#confirm-permission'),
  consentCancel: $('#cancel-permission'), linkCaution: $('#link-caution'),
};
const state = {
  scanner: null, running: false, starting: false, facing: 'environment',
  request: 0, imageRequest: 0, zoomTrack: null, zoomWanted: null,
  zoomApplying: false, result: null, toastTimer: null, consentAction: null,
};
let decoderPromise = null;

function getDecoder() {
  if (!decoderPromise) decoderPromise = import(QR_LIBRARY_URL).then(m => m.default).catch(err => { decoderPromise = null; throw err; });
  return decoderPromise;
}
function toast(message) {
  clearTimeout(state.toastTimer);
  ui.toast.textContent = message;
  ui.toast.hidden = false;
  state.toastTimer = setTimeout(() => { ui.toast.hidden = true; }, 2600);
}
function status(message, kind = 'idle') {
  ui.cameraStatus.dataset.state = kind;
  ui.cameraStatusText.textContent = message;
}
function refreshCameraButtons() {
  ui.start.hidden = state.running;
  ui.start.disabled = state.starting;
  ui.start.querySelector('span').textContent = state.starting ? 'Starting…' : 'Scan QR';
  ui.stop.hidden = !state.running;
  if (!state.running) { ui.flip.hidden = true; ui.flash.hidden = true; }
}
function stopScanner(message = 'Camera off') {
  state.request++;
  state.running = false;
  state.starting = false;
  state.zoomTrack = null;
  state.zoomWanted = null;
  ui.zoomContainer.hidden = true;
  if (state.scanner) state.scanner.stop();
  // Explicitly end all camera tracks; do not retain an active camera stream.
  const stream = ui.video.srcObject;
  if (stream?.getTracks) stream.getTracks().forEach(track => track.stop());
  ui.video.srcObject = null;
  ui.frame.classList.remove('is-live');
  ui.flash.setAttribute('aria-pressed', 'false');
  ui.flash.setAttribute('aria-label', 'Turn flash on');
  refreshCameraButtons();
  status(message);
}
function cameraError(error) {
  if (error?.message === 'DECODER_UNAVAILABLE') return 'Scanner could not load. Check your internet connection.';
  switch (error?.name) {
    case 'NotAllowedError': case 'PermissionDeniedError': case 'SecurityError': return 'Camera permission denied. Allow access in browser settings.';
    case 'NotFoundError': case 'DevicesNotFoundError': return 'No camera found. Try Upload from documents.';
    case 'NotReadableError': case 'TrackStartError': return 'Camera is in use by another app.';
    default: return 'Unable to start the camera. Try again.';
  }
}

function formatZoom(value) {
  return `${Number(value).toFixed(1).replace(/\.0$/, '')}×`;
}
// The slider changes the actual media track. CSS scaling would only enlarge pixels.
async function applyZoom() {
  if (state.zoomApplying) return;
  state.zoomApplying = true;
  const track = state.zoomTrack;
  try {
    while (track && state.running && state.zoomTrack === track && state.zoomWanted != null) {
      const target = state.zoomWanted;
      state.zoomWanted = null;
      try {
        await track.applyConstraints({ advanced: [{ zoom: target }] });
        if (state.zoomTrack === track) {
          const actual = track.getSettings?.().zoom;
          ui.zoomValue.textContent = formatZoom(Number.isFinite(actual) ? actual : target);
        }
      } catch {
        if (state.zoomTrack === track) {
          ui.zoomContainer.hidden = true;
          toast('Camera zoom is not supported on this device.');
        }
        break;
      }
    }
  } finally {
    state.zoomApplying = false;
    // A late slider input may have arrived just after the loop completed.
    if (state.zoomWanted != null && state.running && state.zoomTrack) applyZoom();
  }
}
async function configureZoom(request) {
  const track = ui.video.srcObject?.getVideoTracks?.()[0];
  state.zoomTrack = null;
  state.zoomWanted = null;
  ui.zoomContainer.hidden = true;
  if (!track || !track.getCapabilities || !track.applyConstraints) return;
  let range;
  try { range = track.getCapabilities().zoom; } catch { return; }
  if (!range || !Number.isFinite(range.min) || !Number.isFinite(range.max) || range.max <= range.min) return;
  if (!state.running || request !== state.request) return;
  const initialZoom = Math.min(range.max, Math.max(range.min, 1));
  ui.zoom.min = String(range.min);
  ui.zoom.max = String(range.max);
  ui.zoom.step = 'any';
  ui.zoom.value = String(initialZoom);
  ui.zoomValue.textContent = formatZoom(initialZoom);
  state.zoomTrack = track;
  // Attempt to reset the actual camera to 1x on each start / camera switch.
  try {
    await track.applyConstraints({ advanced: [{ zoom: initialZoom }] });
    if (!state.running || request !== state.request || state.zoomTrack !== track) return;
    const actual = track.getSettings?.().zoom;
    ui.zoomValue.textContent = formatZoom(Number.isFinite(actual) ? actual : initialZoom);
    ui.zoomContainer.hidden = false;
  } catch {
    if (state.zoomTrack === track) state.zoomTrack = null;
  }
}

async function refreshHardwareControls(request) {
  try {
    const supported = await state.scanner.hasFlash();
    if (state.running && request === state.request) ui.flash.hidden = !supported;
  } catch { ui.flash.hidden = true; }
  try {
    const QrScanner = await getDecoder();
    const cameras = await QrScanner.listCameras();
    if (state.running && request === state.request) ui.flip.hidden = cameras.length < 2;
  } catch { ui.flip.hidden = true; }
}
async function startScanner() {
  if (state.running || state.starting || !ui.resultView.hidden) return;
  if (!window.isSecureContext || !navigator.mediaDevices?.getUserMedia) {
    status('Camera requires HTTPS or localhost. Upload from documents instead.', 'error');
    return;
  }
  const request = ++state.request;
  state.starting = true;
  refreshCameraButtons();
  status('Requesting camera access…');
  try {
    const QrScanner = await getDecoder().catch(() => { throw new Error('DECODER_UNAVAILABLE'); });
    if (request !== state.request) return;
    if (!state.scanner) {
      state.scanner = new QrScanner(ui.video, result => {
        if (state.running && ui.resultView.hidden) showResult(result.data);
      }, { preferredCamera: state.facing, returnDetailedScanResult: true, maxScansPerSecond: 12 });
    }
    await state.scanner.start();
    if (request !== state.request || !ui.resultView.hidden) { state.scanner.stop(); return; }
    state.running = true;
    ui.frame.classList.add('is-live');
    status('Point your camera at a QR code', 'live');
    await configureZoom(request);
    if (request !== state.request) return;
    await refreshHardwareControls(request);
  } catch (err) {
    if (request === state.request) {
      const message = cameraError(err);
      stopScanner(message);
      ui.cameraStatus.dataset.state = 'error';
    }
  } finally {
    if (request === state.request) state.starting = false;
    refreshCameraButtons();
  }
}
async function flipCamera() {
  if (!state.running || !state.scanner) return;
  ui.flip.disabled = true;
  const request = state.request;
  const next = state.facing === 'environment' ? 'user' : 'environment';
  try {
    state.zoomTrack = null;
    ui.zoomContainer.hidden = true;
    await state.scanner.setCamera(next);
    if (request !== state.request) return;
    state.facing = next;
    await configureZoom(request);
    await refreshHardwareControls(request);
    ui.flash.setAttribute('aria-pressed', 'false');
    ui.flash.setAttribute('aria-label', 'Turn flash on');
  } catch { if (request === state.request) status('Could not switch camera', 'error'); }
  finally { ui.flip.disabled = false; }
}
async function toggleFlash() {
  if (!state.running || !state.scanner) return;
  ui.flash.disabled = true;
  try {
    await state.scanner.toggleFlash();
    const on = state.scanner.isFlashOn();
    ui.flash.setAttribute('aria-pressed', String(on));
    ui.flash.setAttribute('aria-label', on ? 'Turn flash off' : 'Turn flash on');
  } catch { toast('Flash is not supported on this device.'); }
  finally { ui.flash.disabled = false; }
}
function webUrl(text) {
  const value = text.trim();
  if (!/^https?:\/\//i.test(value)) return null;
  try {
    const url = new URL(value);
    return ['http:', 'https:'].includes(url.protocol) && !url.username && !url.password ? url.href : null;
  } catch { return null; }
}
function showResult(text) {
  if (typeof text !== 'string' || !text.length) return;
  state.result = text;
  const url = webUrl(text);
  stopScanner();
  ui.resultText.textContent = text; // Scanned data is never interpreted as HTML.
  ui.linkCaution.hidden = !url;
  ui.open.hidden = !url;
  ui.copy.hidden = !!url;
  if (url) ui.open.href = url; else ui.open.removeAttribute('href');
  ui.scannerView.hidden = true;
  ui.resultView.hidden = false;
  $('#result-title').focus({ preventScroll: true });
}
// The file picker only exposes the image the user selects. Never request directory access.
// "accept" is only a picker hint, so validate content before passing it to the decoder.
async function verifyImage(file) {
  if (!(file instanceof File) || file.size === 0 || file.size > MAX_UPLOAD_BYTES) {
    throw new Error('Choose an image smaller than 10 MB.');
  }
  const header = new Uint8Array(await file.slice(0, 16).arrayBuffer());
  const signature = (bytes) => bytes.every((v, i) => header[i] === v);
  let format = null;
  if (signature([0x89,0x50,0x4e,0x47,0x0d,0x0a,0x1a,0x0a])) format = 'image/png';
  else if (signature([0xff,0xd8,0xff])) format = 'image/jpeg';
  else if (signature([0x52,0x49,0x46,0x46]) &&
           String.fromCharCode(...header.slice(8,12)) === 'WEBP') format = 'image/webp';
  if (!ALLOWED_IMAGE_FORMATS.has(format) || (file.type && file.type !== format)) {
    throw new Error('Only PNG, JPG and WebP images are allowed.');
  }
  if ('createImageBitmap' in window) {
    let bitmap;
    try {
      bitmap = await createImageBitmap(file);
      if (!bitmap.width || !bitmap.height || bitmap.width * bitmap.height > MAX_IMAGE_PIXELS) {
        throw new Error('Image resolution is too large.');
      }
    } catch (err) {
      if (err.message === 'Image resolution is too large.') throw err;
      throw new Error('This image could not be read.');
    } finally { bitmap?.close?.(); }
  }
}
async function scanImage(file) {
  if (!file) return;
  const request = ++state.imageRequest;
  if (state.running || state.starting) stopScanner();
  ui.chooseImage.disabled = true;
  status('Checking image…');
  try {
    await verifyImage(file);
    if (request !== state.imageRequest) return;
    status('Scanning image…');
    const QrScanner = await getDecoder().catch(() => { throw new Error('DECODER_UNAVAILABLE'); });
    if (request !== state.imageRequest) return;
    const result = await QrScanner.scanImage(file, { returnDetailedScanResult: true });
    if (request === state.imageRequest) showResult(result.data);
  } catch (err) {
    if (request === state.imageRequest) {
      const knownError = err.message?.startsWith('Only PNG') || err.message?.startsWith('Choose an image') ||
                         err.message?.startsWith('Image resolution') || err.message?.startsWith('This image');
      status(knownError ? err.message : err.message === 'DECODER_UNAVAILABLE'
        ? 'Scanner could not load. Check your connection.'
        : 'No QR code found. Try a clearer image.', 'error');
    }
  } finally {
    ui.imageInput.value = '';
    ui.chooseImage.disabled = false;
  }
}

async function copyText() {
  try {
    if (navigator.clipboard?.writeText && window.isSecureContext) await navigator.clipboard.writeText(state.result);
    else {
      const field = document.createElement('textarea');
      field.value = state.result;
      field.style.position = 'fixed'; field.style.opacity = '0';
      document.body.appendChild(field);
      field.select();
      if (!document.execCommand('copy')) throw new Error('Unable to copy');
      field.remove();
    }
    toast('Copied');
  } catch { toast('Copy failed. Select the text to copy it.'); }
}

// A per-action confirmation is under our control; browser permission persistence is not.
// Never call camera APIs or open a file picker until the user confirms the dialog.
function askConsent(action) {
  if (ui.consent.open || state.starting) return;
  state.consentAction = action;
  if (action === 'camera') {
    ui.consentTitle.textContent = 'Use camera?';
    ui.consentMessage.textContent = 'Paiseh ah, need your permission first.';
    ui.consentCancel.textContent = 'Not now';
    ui.consentConfirm.textContent = 'Ok can';
  } else {
    ui.consentTitle.textContent = 'Want upload ah?';
    ui.consentMessage.textContent = 'Ok loh, choose image from documents.';
    ui.consentCancel.textContent = "Don't want";
    ui.consentConfirm.textContent = 'Ok Choose';
  }
  ui.consent.showModal();
  ui.consentCancel.focus();
}
ui.consentConfirm.addEventListener('click', () => {
  const action = state.consentAction;
  state.consentAction = null;
  ui.consent.close();
  if (action === 'camera') startScanner();
  if (action === 'documents') { ui.imageInput.value = ''; ui.imageInput.click(); }
});
ui.consentCancel.addEventListener('click', () => ui.consent.close());
ui.consent.addEventListener('close', () => { state.consentAction = null; });

ui.start.addEventListener('click', () => askConsent('camera'));
ui.stop.addEventListener('click', () => stopScanner());
ui.flip.addEventListener('click', flipCamera);
ui.flash.addEventListener('click', toggleFlash);
ui.zoom.addEventListener('input', () => {
  if (!state.zoomTrack || !state.running) return;
  const target = Number(ui.zoom.value);
  if (!Number.isFinite(target)) return;
  ui.zoomValue.textContent = formatZoom(target);
  state.zoomWanted = target;
  applyZoom();
});
ui.chooseImage.addEventListener('click', () => askConsent('documents'));
ui.imageInput.addEventListener('change', () => scanImage(ui.imageInput.files?.[0]));
ui.copy.addEventListener('click', copyText);
ui.again.addEventListener('click', () => {
  state.result = null;
  ui.resultText.textContent = '';
  ui.open.removeAttribute('href');
  ui.linkCaution.hidden = true;
  ui.resultView.hidden = true;
  ui.scannerView.hidden = false;
  status('Camera off');
  // Deliberately no auto-start. A new scan needs another consent action.
  ui.start.focus({ preventScroll: true });
});
document.addEventListener('visibilitychange', () => {
  if (document.hidden && (state.running || state.starting)) stopScanner('Camera paused. Tap Start camera to resume.');
});
window.addEventListener('pagehide', () => {
  if (state.running || state.starting) stopScanner();
  if (state.scanner) state.scanner.destroy();
  state.scanner = null;
  state.result = null;
  ui.resultText.textContent = '';
});
refreshCameraButtons();
