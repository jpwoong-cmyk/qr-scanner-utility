// SCANme-QR. Only QR decoding happens in the camera; links are audited locally before result display.
import { auditQrText } from './security/url-audit.js';
import { inspectSite } from './security/site-inspector.js';
const QR_LIBRARY_URL = './utility/qr-scanner.min.js';
const MAX_UPLOAD_BYTES = 10 * 1024 * 1024;
const MAX_IMAGE_PIXELS = 40_000_000;
const ALLOWED_IMAGE_FORMATS = new Set(['image/png', 'image/jpeg', 'image/webp']);
const $ = (selector) => document.querySelector(selector);

const ui = {
  scannerView: $('#scanner-view'), resultView: $('#result-view'),
  frame: $('#camera-frame'), video: $('#camera-video'),
  cameraSwitchPreview: $('#camera-switch-preview'),
  cameraStatus: $('#camera-status'), cameraStatusText: $('#camera-status-text'),
  start: $('#start-camera'), stop: $('#stop-camera'),
  flip: $('#switch-camera'), flash: $('#toggle-flash'),
  cameraCycle: $('#select-camera'), cameraNumber: $('#camera-number'),
  liveControls: $('#live-controls'), shortcutButton: $('#add-shortcut'), shortcutDialog: $('#shortcut-dialog'),
  shortcutMessage: $('#shortcut-message'), shortcutClose: $('#close-shortcut'),
  zoomContainer: $('#zoom-control'), zoom: $('#zoom-slider'), zoomValue: $('#zoom-value'),
  chooseImage: $('#choose-image'), imageInput: $('#image-input'),
  resultText: $('#result-text'), open: $('#open-link'), copy: $('#copy-text'), again: $('#scan-again'),
  toast: $('#toast'),
  consent: $('#permission-dialog'), consentTitle: $('#permission-title'),
  consentMessage: $('#permission-message'), consentConfirm: $('#confirm-permission'),
  consentCancel: $('#cancel-permission'), linkCaution: $('#link-caution'),
  securityPill: $('#security-pill'), reviewLink: $('#review-link'),
  riskDialog: $('#risk-dialog'), riskMessage: $('#risk-message'), riskOpen: $('#risk-open'),
  riskCancel: $('#risk-cancel'), freeze: $('#freeze-frame'), transition: $('#scan-transition'),
  inspector: $('#site-inspector'), inspectorStatus: $('#inspector-status'),
  inspectorHeadline: $('#inspector-headline'), inspectorDomain: $('#inspector-domain'),
  inspectorFindings: $('#inspector-findings'), inspectorDisclaimer: $('#inspector-disclaimer'),
};
const state = {
  scanner: null, running: false, starting: false, facing: 'environment',
  request: 0, imageRequest: 0, zoomTrack: null, zoomWanted: null,
  zoomApplying: false, zoomRange: null, result: null, toastTimer: null, consentAction: null,
  processing: false, flow: 0, audit: null,
  cameras: [], cameraSwitching: false, cameraTransition: 0,
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
  ui.cameraStatus.hidden = (kind === 'idle' && message === 'Camera off');
}
function refreshCameraButtons() {
  ui.start.hidden = state.running || state.processing;
  ui.start.disabled = state.starting;
  ui.start.querySelector('span').textContent = state.starting ? 'Opening…' : 'Tap to Scan';
  ui.liveControls.hidden = !state.running || state.processing;
  document.body.classList.toggle('is-scanning', state.running);
  if (!state.running) {
    ui.flip.hidden = true;
    ui.flash.hidden = true;
    ui.cameraCycle.hidden = true;
  }
}
function stopScanner(message = 'Camera off') {
  state.request++;
  state.running = false;
  state.starting = false;
  state.zoomTrack = null;
  state.zoomRange = null;
  state.zoomWanted = null;
  state.cameras = [];
  state.cameraTransition++; // Invalidate an unfinished camera reveal.
  state.cameraSwitching = false;
  ui.flip.disabled = false;
  ui.cameraCycle.disabled = false;
  resetCameraSwitchPreview();
  ui.cameraCycle.hidden = true;
  ui.zoomContainer.hidden = true;
  if (state.scanner) state.scanner.stop();
  // Explicitly end all camera tracks; do not retain an active camera stream.
  const stream = ui.video.srcObject;
  if (stream?.getTracks) stream.getTracks().forEach(track => track.stop());
  ui.video.srcObject = null;
  ui.frame.classList.remove('is-live', 'is-opening');
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

// UI "0" means zero added digital zoom. The camera's true minimum can be
// 0.5x, 1x or higher depending on lens/OS, never literal 0x optics.
function zoomLabel(actual, min) {
  const extra = Math.max(0, actual - min);
  return extra < 0.05 ? '0' : `+${extra.toFixed(1).replace(/\.0$/, '')}×`;
}
async function applyZoom() {
  if (state.zoomApplying) return;
  state.zoomApplying = true;
  const track = state.zoomTrack;
  try {
    while (track && state.running && state.zoomTrack === track && state.zoomWanted !== null) {
      const target = state.zoomWanted;
      state.zoomWanted = null;
      try {
        await track.applyConstraints({ advanced: [{ zoom: target }] });
        if (state.zoomTrack === track) {
          const actual = track.getSettings?.().zoom;
          ui.zoomValue.textContent = zoomLabel(Number.isFinite(actual) ? actual : target, state.zoomRange.min);
        }
      } catch {
        if (state.zoomTrack === track) {
          ui.zoomContainer.hidden = true;
          toast('Zoom unavailable on this camera.');
          state.zoomWanted = null;
        }
        break;
      }
    }
  } finally {
    state.zoomApplying = false;
    if (state.zoomWanted !== null && state.running && state.zoomTrack) applyZoom();
  }
}
async function configureZoom(request) {
  const track = ui.video.srcObject?.getVideoTracks?.()[0];
  state.zoomTrack = null;
  state.zoomRange = null;
  state.zoomWanted = null;
  ui.zoomContainer.hidden = true;
  if (!track || !track.getCapabilities || !track.applyConstraints) return;
  let range;
  try { range = track.getCapabilities().zoom; } catch { return; }
  if (!range || !Number.isFinite(range.min) || !Number.isFinite(range.max) || range.max <= range.min) return;
  if (!state.running || request !== state.request) return;
  ui.zoom.min = '0'; ui.zoom.max = '100'; ui.zoom.step = '1'; ui.zoom.value = '0';
  ui.zoomValue.textContent = '0';
  ui.zoom.setAttribute('aria-valuetext', '0 extra zoom');
  state.zoomTrack = track;

const baseZoom = Math.min(range.max, Math.max(range.min, 1));
state.zoomRange = { min: baseZoom, max: range.max };

try {
  // Start at 1x when supported, otherwise use the nearest allowed zoom.
  await track.applyConstraints({
    advanced: [{ zoom: baseZoom }]
  });

    if (!state.running || request !== state.request || state.zoomTrack !== track) return;
    ui.zoomContainer.hidden = false;
  } catch { if (state.zoomTrack === track) { state.zoomTrack = null; state.zoomRange = null; } }
}

async function refreshHardwareControls(request) {
  try {
    const supported = await state.scanner.hasFlash();

    if (state.running && request === state.request) {
      ui.flash.hidden = !supported;
    }
  } catch {
    if (request === state.request) {
      ui.flash.hidden = true;
    }
  }

  try {
    const QrScanner = await getDecoder();
    const cameras = await QrScanner.listCameras();

    if (!state.running || request !== state.request) return;

    state.cameras = cameras.filter(camera => camera.id);

    ui.flip.hidden = state.cameras.length < 2;
    ui.cameraCycle.hidden = state.cameras.length < 2;

    const track = ui.video.srcObject?.getVideoTracks?.()[0];
    const activeId = track?.getSettings?.().deviceId;

    const index = state.cameras.findIndex(
      camera => camera.id === activeId
    );

    ui.cameraNumber.textContent = String(
      index >= 0 ? index + 1 : 1
    );

    ui.cameraCycle.title =
      `Next camera (${state.cameras.length} detected)`;

  } catch {
    if (request === state.request) {
      state.cameras = [];
      ui.flip.hidden = true;
      ui.cameraCycle.hidden = true;
    }
  }
}
function waitForCameraPicture(request) {
  const video = ui.video;
  if (video.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA && video.videoWidth) {
    return Promise.resolve();
  }
  return new Promise(resolve => {
    let settled = false;
    const finish = () => {
      if (settled) return;
      settled = true;
      video.removeEventListener('loadeddata', finish);
      video.removeEventListener('playing', finish);
      clearTimeout(timeout);
      resolve();
    };
    video.addEventListener('loadeddata', finish, { once: true });
    video.addEventListener('playing', finish, { once: true });
    const timeout = setTimeout(finish, 700);
    if (request !== state.request) finish();
  });
}

async function startScanner() {
  if (state.running || state.starting || state.processing || !ui.resultView.hidden) return;
  if (!window.isSecureContext || !navigator.mediaDevices?.getUserMedia) {
    status('Camera requires HTTPS or localhost. Upload from documents instead.', 'error');
    return;
  }
  const request = ++state.request;
  state.starting = true;
  ui.frame.classList.add('is-opening');
  refreshCameraButtons();
  status('Requesting camera access…');
  try {
    const QrScanner = await getDecoder().catch(() => { throw new Error('DECODER_UNAVAILABLE'); });
    if (request !== state.request) return;
    if (!state.scanner) {
      state.scanner = new QrScanner(ui.video, result => {
        if (state.running && !state.processing && ui.resultView.hidden) handleDecoded(result.data);
      }, { preferredCamera: state.facing, returnDetailedScanResult: true, maxScansPerSecond: 12 });
    }
    await state.scanner.start();
    if (request !== state.request || !ui.resultView.hidden) { state.scanner.stop(); return; }
    // Reveal live video after a frame is available, rather than flashing black.
    await waitForCameraPicture(request);
    if (request !== state.request || !ui.resultView.hidden) { state.scanner.stop(); return; }
    state.running = true;
    ui.frame.classList.remove('is-opening');
    ui.frame.classList.add('is-live');
    status('Scanning', 'live');
    refreshCameraButtons();
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
    if (request === state.request) ui.frame.classList.remove('is-opening');
    if (request === state.request) state.starting = false;
    refreshCameraButtons();
  }
}

// Keep the previous frame over the video until the replacement lens starts producing frames.
function resetCameraSwitchPreview() {
  const canvas = ui.cameraSwitchPreview;
  canvas.hidden = true;
  canvas.classList.remove('is-switching', 'is-revealing');
  canvas.width = 0;
  canvas.height = 0;
}

function captureCameraSwitchFrame(transition) {
  const video = ui.video;
  const canvas = ui.cameraSwitchPreview;
  if (!video.videoWidth || !video.videoHeight) return false;

  try {
    const scale = Math.min(1, 1280 / video.videoWidth);
    canvas.width = Math.max(1, Math.round(video.videoWidth * scale));
    canvas.height = Math.max(1, Math.round(video.videoHeight * scale));
    canvas.getContext('2d', { alpha: false }).drawImage(
      video, 0, 0, canvas.width, canvas.height
    );
    canvas.classList.remove('is-switching', 'is-revealing');
    canvas.hidden = false;

    requestAnimationFrame(() => {
      if (state.cameraTransition === transition && !canvas.hidden) {
        canvas.classList.add('is-switching');
      }
    });
    return true;
  } catch {
    resetCameraSwitchPreview();
    return false;
  }
}

function waitForNewCameraFrame(video) {
  return new Promise(resolve => {
    let settled = false;
    let frameId = null;
    let timeoutId;

    const finish = () => {
      if (settled) return;
      settled = true;
      clearTimeout(timeoutId);
      video.removeEventListener('loadeddata', onLoaded);
      if (frameId !== null && video.cancelVideoFrameCallback) {
        video.cancelVideoFrameCallback(frameId);
      }
      resolve();
    };
    const onLoaded = () => requestAnimationFrame(() => requestAnimationFrame(finish));

    // Don't hold an old frame forever if a camera never becomes ready.
    timeoutId = setTimeout(finish, 1000);
    if (typeof video.requestVideoFrameCallback === 'function') {
      frameId = video.requestVideoFrameCallback(finish);
    } else if (video.readyState >= 2 && video.videoWidth > 0) {
      onLoaded();
    } else {
      video.addEventListener('loadeddata', onLoaded, { once: true });
    }
  });
}

async function switchCamera(target) {
  if (!state.running || !state.scanner || state.cameraSwitching) {
    return false;
  }

  const request = state.request;
  const transition = ++state.cameraTransition;
  state.cameraSwitching = true;
  ui.flip.disabled = true;
  ui.cameraCycle.disabled = true;
  const captured = captureCameraSwitchFrame(transition);
  let switched = false;

  try {
    state.zoomTrack = null;
    state.zoomWanted = null;
    ui.zoomContainer.hidden = true;

    await state.scanner.setCamera(target);
    if (!state.running || request !== state.request) return false;

    const track = ui.video.srcObject?.getVideoTracks?.()[0];
    const label = track?.label || '';
    if (/front|user|face/i.test(label)) {
      state.facing = 'user';
    } else if (/rear|back|environment/i.test(label)) {
      state.facing = 'environment';
    } else if (target === 'user' || target === 'environment') {
      state.facing = target;
    }

    await configureZoom(request);
    if (!state.running || request !== state.request) return false;
    await refreshHardwareControls(request);

    ui.flash.setAttribute('aria-pressed', 'false');
    ui.flash.setAttribute('aria-label', 'Turn flash on');
    switched = true;
    return true;
  } catch {
    if (state.running && request === state.request) {
      toast('Could not switch camera.');
    }
    return false;
  } finally {
    const current = () => state.running && request === state.request &&
      transition === state.cameraTransition;

    if (captured && switched && current()) {
      await waitForNewCameraFrame(ui.video);
      if (current() && !reduceMotion()) {
        ui.cameraSwitchPreview.classList.add('is-revealing');
        await new Promise(resolve => setTimeout(resolve, 380));
      }
    }

    if (transition === state.cameraTransition) {
      resetCameraSwitchPreview();
      state.cameraSwitching = false;
      ui.flip.disabled = false;
      ui.cameraCycle.disabled = false;
    }
  }
}
async function flipCamera() {
  const next = state.facing === 'environment'
    ? 'user'
    : 'environment';

  await switchCamera(next);
}

async function cycleCamera() {
  if (
    !state.running ||
    state.cameraSwitching ||
    state.cameras.length < 2
  ) {
    return;
  }

  const track = ui.video.srcObject?.getVideoTracks?.()[0];
  const activeId = track?.getSettings?.().deviceId;

  const current = state.cameras.findIndex(
    camera => camera.id === activeId
  );

  const nextIndex = (current + 1) % state.cameras.length;
  const next = state.cameras[nextIndex];

  if (next) {
    await switchCamera(next.id);
  }
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
function reduceMotion() { return window.matchMedia('(prefers-reduced-motion: reduce)').matches; }
function freezeLastFrame() {
  const video = ui.video, canvas = ui.freeze;
  try {
    if (!video.videoWidth || !video.videoHeight) return;
    const ratio = Math.min(1, 1280 / video.videoWidth);
    canvas.width = Math.round(video.videoWidth * ratio);
    canvas.height = Math.round(video.videoHeight * ratio);
    canvas.getContext('2d', { alpha: false }).drawImage(video, 0, 0, canvas.width, canvas.height);
    canvas.hidden = false;
  } catch { canvas.hidden = true; }
}
function clearTransition() {
  ui.transition.hidden = true;
  ui.freeze.hidden = true;
  ui.freeze.width = 0;
  ui.freeze.height = 0;
  ui.frame.classList.remove('is-transitioning', 'is-checking-upload');
  document.body.classList.remove('is-scanning');
}
function showInspection(audit) {
  const report = inspectSite(audit);
  ui.inspector.hidden = !report;
  if (!report) return;
  ui.inspector.dataset.verdict = report.status;
  ui.inspectorStatus.textContent = report.status === 'blocked' ? 'Blocked'
    : report.status === 'caution' ? 'Caution' : 'Checked locally';
  ui.inspectorHeadline.textContent = report.headline;
  ui.inspectorDomain.textContent = report.domain;
  ui.inspectorDisclaimer.textContent = report.caveat;
  ui.inspectorFindings.replaceChildren();
  for (const finding of report.findings) {
    const row = document.createElement('div');
    row.className = 'inspector-row';
    const label = document.createElement('span');
    label.className = 'inspector-label';
    label.textContent = finding.label;
    const value = document.createElement('span');
    value.className = `inspector-value ${finding.level}`;
    value.textContent = finding.value;
    row.append(label,value);
    ui.inspectorFindings.append(row);
  }
}

function presentResult(text, audit) {
  state.result = text;
  state.audit = audit;
  showInspection(audit);
  ui.resultText.textContent = text; // Plain text, never HTML.
  // Keep useful warnings, but don't show a badge on ordinary results.
  ui.securityPill.hidden = !['caution', 'blocked'].includes(audit.severity);
  ui.securityPill.className = `security-pill ${audit.severity}`;
  ui.securityPill.textContent = audit.severity === 'caution' ? 'Check this address'
    : audit.severity === 'blocked' ? 'Opening blocked' : '';
  ui.linkCaution.hidden = !['caution','blocked'].includes(audit.severity);
  ui.linkCaution.textContent = audit.message || '';
  $('#result-title').textContent = audit.severity === 'blocked' || audit.severity === 'caution'
    ? 'Eh, careful.' : audit.kind === 'text' ? 'Ok done.' : 'Ok done. Open?';
  ui.open.hidden = audit.severity !== 'review';
  ui.reviewLink.hidden = audit.severity !== 'caution';
  ui.copy.hidden = audit.kind === 'link' && audit.severity === 'review';
  if (audit.severity === 'review' && audit.href) ui.open.href = audit.href;
  else ui.open.removeAttribute('href');
  ui.riskOpen.removeAttribute('href');
  // Mount the destination before releasing the scan overlay.
  ui.resultView.hidden = false;
  ui.scannerView.hidden = true;
  clearTransition();
  ui.resultView.classList.remove('entering');
  void ui.resultView.offsetWidth;
  ui.resultView.classList.add('entering');
  $('#result-title').focus({ preventScroll: true });
}
async function handleDecoded(text) {
  if (typeof text !== 'string' || !text.length || state.processing || !ui.resultView.hidden) return;
  state.processing = true;
  const flow = ++state.flow;
  const wasLive = state.running;
  if (wasLive) freezeLastFrame();
  stopScanner(); // Shut the camera down as soon as QR content is captured.
  if (wasLive) document.body.classList.add('is-scanning');
  ui.frame.classList.add(wasLive ? 'is-transitioning' : 'is-checking-upload');
  ui.transition.hidden = false;
  // Keep the fullscreen view through the check; no sudden jump back to idle layout.
  ui.liveControls.hidden = true;
  ui.start.hidden = true;
  // Local checks complete immediately; the short delay makes scanning -> result readable.
  const audit = auditQrText(text);
  await new Promise(resolve => setTimeout(resolve, reduceMotion() ? 0 : 380));
  if (flow !== state.flow || document.hidden) { clearTransition(); state.processing = false; return; }
  state.processing = false;
  presentResult(text, audit);
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
  if (!file || state.processing) return;
  const request = ++state.imageRequest;
  state.flow++; state.processing = false; clearTransition();
  if (state.running || state.starting) stopScanner();
  ui.chooseImage.disabled = true;
  ui.frame.classList.add('is-upload-processing');
  status('Checking image…');
  try {
    await verifyImage(file);
    if (request !== state.imageRequest) return;
    status('Scanning image…');
    const QrScanner = await getDecoder().catch(() => { throw new Error('DECODER_UNAVAILABLE'); });
    if (request !== state.imageRequest) return;
    const result = await QrScanner.scanImage(file, { returnDetailedScanResult: true });
    if (request === state.imageRequest) await handleDecoded(result.data);
  } catch (err) {
    if (request === state.imageRequest) {
      const knownError = err.message?.startsWith('Only PNG') || err.message?.startsWith('Choose an image') ||
                         err.message?.startsWith('Image resolution') || err.message?.startsWith('This image');
      status(knownError ? err.message : err.message === 'DECODER_UNAVAILABLE'
        ? 'Scanner could not load. Check your connection.'
        : 'No QR code found. Try a clearer image.', 'error');
    }
  } finally {
    ui.frame.classList.remove('is-upload-processing');
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
  if (ui.consent.open || state.starting || state.processing) return;
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
// Home screen shortcut: browser decides whether native installation is supported.
// iOS relies on its Share menu; we never pretend an icon was installed automatically.
let deferredInstallPrompt = null;
const installedMode = () => window.matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;
function refreshShortcutButton() {
  ui.shortcutButton.hidden = installedMode();
}
window.addEventListener('beforeinstallprompt', (event) => {
  event.preventDefault();
  deferredInstallPrompt = event;
  refreshShortcutButton();
});
window.addEventListener('appinstalled', () => {
  deferredInstallPrompt = null;
  ui.shortcutDialog.close?.();
  refreshShortcutButton();
});
function shortcutHelpText() {
  const isIOS = /iPad|iPhone|iPod/i.test(navigator.userAgent) ||
    (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  const isAndroid = /Android/i.test(navigator.userAgent);
  if (isIOS) return 'Tap Share, then Add to Home Screen, then Add.';
  if (isAndroid) return 'Tap ⋮ in your browser, then Add to Home screen or Install app.';
  return 'Open your browser menu and choose Install app or Create shortcut.';
}
ui.shortcutButton.addEventListener('click', async () => {
  if (installedMode()) { toast('Already on your Home Screen.'); return; }
  if (deferredInstallPrompt) {
    const promptEvent = deferredInstallPrompt;
    deferredInstallPrompt = null;
    try {
      // Browser-owned native prompt, only in response to a real user tap.
      await promptEvent.prompt();
      const decision = await promptEvent.userChoice;
      if (decision?.outcome === 'accepted') return;
    } catch { /* Browser may not support a prompt after all; show manual steps. */ }
  }
  ui.shortcutMessage.textContent = shortcutHelpText();
  ui.shortcutDialog.showModal();
});
ui.shortcutClose.addEventListener('click', () => ui.shortcutDialog.close());
refreshShortcutButton();

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
ui.stop.addEventListener('click', () => { state.flow++; state.processing = false; clearTransition(); stopScanner(); });
ui.flip.addEventListener('click', flipCamera);
ui.cameraCycle.addEventListener('click', cycleCamera);
ui.flash.addEventListener('click', toggleFlash);
ui.zoom.addEventListener('input', () => {
  if (!state.zoomTrack || !state.zoomRange || !state.running) return;
  const pct = Number(ui.zoom.value);
  if (!Number.isFinite(pct)) return;
  const { min, max } = state.zoomRange;
  const target = min + (pct / 100) * (max - min);
  ui.zoomValue.textContent = zoomLabel(target, min);
  ui.zoom.setAttribute('aria-valuetext', `${ui.zoomValue.textContent} extra zoom`);
  state.zoomWanted = target;
  applyZoom();
});
ui.reviewLink.addEventListener('click', () => {
  if (state.audit?.severity !== 'caution' || !state.audit.href) return;
  ui.riskMessage.textContent = `${state.audit.message}. Still want to open?`;
  ui.riskOpen.href = state.audit.href;
  ui.riskDialog.showModal();
  ui.riskCancel.focus();
});
ui.riskCancel.addEventListener('click', () => ui.riskDialog.close());
ui.riskOpen.addEventListener('click', () => ui.riskDialog.close());
ui.chooseImage.addEventListener('click', () => askConsent('documents'));
ui.imageInput.addEventListener('change', () => scanImage(ui.imageInput.files?.[0]));
ui.copy.addEventListener('click', copyText);
ui.again.addEventListener('click', () => {
  state.flow++;
  state.imageRequest++; // Invalidate unfinished image scans too.
  state.processing = false;
  clearTransition();
  stopScanner();
  state.result = null; state.audit = null;
  ui.resultText.textContent = '';
  ui.open.removeAttribute('href');
  ui.linkCaution.hidden = true;
  ui.securityPill.hidden = true;
  ui.resultView.classList.remove('entering');
  ui.resultView.hidden = true;
  ui.scannerView.hidden = false;
  ui.scannerView.classList.remove('returning');
  void ui.scannerView.offsetWidth;
  ui.scannerView.classList.add('returning');
  refreshCameraButtons(); // Restore Tap to Scan if the user declines permission.
  // Scan again starts a NEW scan, not the idle/upload screen.
  // Retain the per-session permission confirmation requested for security.
  askConsent('camera');
});
document.addEventListener('visibilitychange', () => {
  if (document.hidden) {
    state.flow++; state.processing = false; clearTransition();
    if (state.running || state.starting) stopScanner('Camera paused. Tap to Scan to resume.');
  }
});
window.addEventListener('pagehide', () => {
  state.flow++; state.processing = false; clearTransition();
  if (state.running || state.starting) stopScanner();
  if (state.scanner) state.scanner.destroy();
  state.scanner = null;
  state.result = null;
  ui.resultText.textContent = '';
});
refreshCameraButtons();
status('Camera off');
