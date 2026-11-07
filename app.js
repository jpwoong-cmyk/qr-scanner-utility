// QR Utility, Phase 1. Plain JavaScript; no build tools or backend required.
// The decoder is loaded only when a scan is requested. All decoding is local.
const QR_LIBRARY_URL = 'https://cdn.jsdelivr.net/npm/qr-scanner@1.4.2/qr-scanner.min.js';
const MAX_UPLOAD_BYTES = 15 * 1024 * 1024;

const $ = (selector) => document.querySelector(selector);
const elements = {
  nav: [...document.querySelectorAll('[data-view]')],
  panels: { camera: $('#camera-view'), upload: $('#upload-view'), result: $('#result-view') },
  frame: $('#camera-frame'),
  video: $('#camera-video'),
  cameraStatus: $('#camera-status'),
  cameraStatusText: $('#camera-status-text'),
  startCamera: $('#start-camera'),
  stopCamera: $('#stop-camera'),
  switchCamera: $('#switch-camera'),
  toggleFlash: $('#toggle-flash'),
  flashLabel: $('#flash-label'),
  dropzone: $('#upload-dropzone'),
  imageInput: $('#image-input'),
  imagePreviewWrap: $('#image-preview-wrap'),
  imagePreview: $('#image-preview'),
  uploadStatus: $('#upload-status'),
  resultType: $('#result-type'),
  resultSource: $('#result-source'),
  resultText: $('#result-text'),
  resultWarning: $('#result-warning'),
  openLink: $('#open-link'),
  toast: $('#toast'),
};

const state = {
  view: 'camera',
  scanner: null,
  running: false,
  starting: false,
  cameraRequest: 0,
  imageRequest: 0,
  facing: 'environment',
  result: null,
  previewUrl: null,
  toastTimer: null,
};
let modulePromise = null;

function showToast(message) {
  clearTimeout(state.toastTimer);
  elements.toast.textContent = message;
  elements.toast.hidden = false;
  state.toastTimer = setTimeout(() => { elements.toast.hidden = true; }, 2700);
}

function setCameraStatus(message, condition = 'idle') {
  elements.cameraStatus.dataset.state = condition;
  elements.cameraStatusText.textContent = message;
}

function setUploadStatus(message, condition = 'idle') {
  elements.uploadStatus.dataset.state = condition;
  elements.uploadStatus.textContent = message;
}

async function loadQrScanner() {
  if (!modulePromise) {
    modulePromise = import(QR_LIBRARY_URL)
      .then((module) => module.default)
      .catch((error) => {
        modulePromise = null; // Permit another attempt when the connection returns.
        throw error;
      });
  }
  return modulePromise;
}

function updateCameraControls() {
  elements.startCamera.hidden = state.running;
  elements.startCamera.disabled = state.starting;
  elements.startCamera.textContent = state.starting ? 'Starting camera…' : 'Start camera';
  if (!state.running && !state.starting) {
    // Rebuild the button label after a loading state, including its SVG icon.
    elements.startCamera.innerHTML = '<svg class="icon" aria-hidden="true"><use href="#i-camera"/></svg> Start camera';
  }
  elements.stopCamera.hidden = !state.running;
  if (!state.running) {
    elements.switchCamera.hidden = true;
    elements.toggleFlash.hidden = true;
    elements.toggleFlash.setAttribute('aria-pressed', 'false');
    elements.flashLabel.textContent = 'Flash off';
  }
}

function stopScanner(message = 'Camera stopped') {
  state.cameraRequest += 1; // Invalidates any pending start operation.
  state.running = false;
  state.starting = false;
  if (state.scanner) state.scanner.stop();
  elements.frame.classList.remove('is-live');
  updateCameraControls();
  setCameraStatus(message);
}

function clearUploadPreview() {
  if (state.previewUrl) URL.revokeObjectURL(state.previewUrl);
  state.previewUrl = null;
  elements.imagePreview.removeAttribute('src');
  elements.imagePreviewWrap.hidden = true;
  elements.imageInput.value = '';
}

function selectView(view) {
  if (view === 'result' && state.result === null) return;
  if (view !== 'camera' && (state.running || state.starting)) stopScanner();
  if (state.view === 'upload' && view !== 'upload') {
    state.imageRequest += 1;
    clearUploadPreview();
    $('#choose-image').disabled = false;
    $('#replace-image').disabled = false;
    setUploadStatus('Your image stays on your device during scanning.');
  }

  state.view = view;
  for (const [name, panel] of Object.entries(elements.panels)) panel.hidden = name !== view;
  for (const button of elements.nav) {
    const selected = button.dataset.view === view;
    button.classList.toggle('is-active', selected);
    button.setAttribute('aria-pressed', String(selected));
    if (button.dataset.view === 'result') button.disabled = state.result === null;
  }
}

function cameraErrorMessage(error) {
  switch (error?.name) {
    case 'NotAllowedError':
    case 'PermissionDeniedError':
    case 'SecurityError': return 'Camera permission was denied. Allow camera access in browser settings, then try again.';
    case 'NotFoundError':
    case 'DevicesNotFoundError': return 'No camera was detected. You can still scan a saved image.';
    case 'NotReadableError':
    case 'TrackStartError': return 'The camera is busy or unavailable. Close other camera apps and try again.';
    case 'OverconstrainedError': return 'Your device could not use the selected camera. Try again.';
    default: return 'Could not start the camera. Check browser permissions and try again.';
  }
}

async function startScanner() {
  if (state.running || state.starting || state.view !== 'camera') return;
  if (!window.isSecureContext || !navigator.mediaDevices?.getUserMedia) {
    setCameraStatus('Camera needs a supported browser on HTTPS (or localhost). Upload an image instead.', 'error');
    return;
  }

  const request = ++state.cameraRequest;
  state.starting = true;
  updateCameraControls();
  setCameraStatus('Loading scanner and requesting camera access…');

  try {
    let QrScanner;
    try { QrScanner = await loadQrScanner(); }
    catch { throw new Error('DECODER_UNAVAILABLE'); }
    if (request !== state.cameraRequest || state.view !== 'camera') return;

    if (!state.scanner) {
      state.scanner = new QrScanner(elements.video, (result) => {
        if (state.running && state.view === 'camera') {
          showResult(result.data, 'camera');
        }
      }, { preferredCamera: state.facing, returnDetailedScanResult: true, maxScansPerSecond: 12 });
    }

    await state.scanner.start();
    if (request !== state.cameraRequest || state.view !== 'camera') {
      state.scanner.stop();
      return;
    }

    state.running = true;
    elements.frame.classList.add('is-live');
    setCameraStatus('Camera is live. Hold a QR code inside the frame.', 'live');

    // Both controls are optional: browsers are free not to support them.
    try {
      const canFlash = await state.scanner.hasFlash();
      if (state.running && request === state.cameraRequest) {
        elements.toggleFlash.hidden = !canFlash;
      }
    } catch { elements.toggleFlash.hidden = true; }
    try {
      const cameras = await QrScanner.listCameras();
      if (state.running && request === state.cameraRequest) {
        elements.switchCamera.hidden = cameras.length < 2;
      }
    } catch { elements.switchCamera.hidden = true; }
  } catch (error) {
    if (request === state.cameraRequest) {
      stopScanner(error.message === 'DECODER_UNAVAILABLE'
        ? 'Could not load the scanner library. Check your internet connection and try again.'
        : cameraErrorMessage(error));
      elements.cameraStatus.dataset.state = 'error';
    }
  } finally {
    if (request === state.cameraRequest) state.starting = false;
    updateCameraControls();
  }
}

async function flipCamera() {
  if (!state.running || !state.scanner) return;
  const next = state.facing === 'environment' ? 'user' : 'environment';
  elements.switchCamera.disabled = true;
  try {
    await state.scanner.setCamera(next);
    state.facing = next;
    setCameraStatus('Camera changed. Ready to scan.', 'live');
    const hasFlash = await state.scanner.hasFlash();
    elements.toggleFlash.hidden = !hasFlash;
    elements.toggleFlash.setAttribute('aria-pressed', 'false');
    elements.flashLabel.textContent = 'Flash off';
  } catch {
    setCameraStatus('Could not switch cameras. You can keep using the current camera.', 'live');
  } finally {
    elements.switchCamera.disabled = false;
  }
}

async function toggleFlash() {
  if (!state.scanner || !state.running) return;
  elements.toggleFlash.disabled = true;
  try {
    await state.scanner.toggleFlash();
    const on = state.scanner.isFlashOn();
    elements.toggleFlash.setAttribute('aria-pressed', String(on));
    elements.flashLabel.textContent = on ? 'Flash on' : 'Flash off';
  } catch {
    showToast('Flashlight is unavailable on this device.');
  } finally {
    elements.toggleFlash.disabled = false;
  }
}

function safeWebUrl(content) {
  const value = content.trim();
  if (!/^https?:\/\//i.test(value)) return null;
  try {
    const url = new URL(value);
    return url.protocol === 'https:' || url.protocol === 'http:' ? url.href : null;
  } catch { return null; }
}

function showResult(content, source) {
  if (typeof content !== 'string' || content.length === 0) return;
  const webUrl = safeWebUrl(content);
  state.result = content;
  elements.resultText.textContent = content; // Never interpret scanned content as HTML.
  elements.resultType.textContent = webUrl ? 'Website URL' : 'Text / other data';
  elements.resultSource.textContent = source === 'camera' ? 'Scanned with camera' : 'Scanned from image';
  elements.resultWarning.textContent = webUrl
    ? 'Check the website address carefully before opening unfamiliar links.'
    : 'QR codes can contain messages, contact details or other text. Review the content before using it.';
  elements.openLink.hidden = !webUrl;
  if (webUrl) elements.openLink.href = webUrl;
  else elements.openLink.removeAttribute('href');
  selectView('result');
  $('#result-title').focus({ preventScroll: true });
}

async function processImage(file) {
  if (!file) return;
  const supportedImage = file.type.startsWith('image/') || /\.(png|jpe?g|webp|gif|bmp|avif|heic|heif)$/i.test(file.name);
  if (!supportedImage) {
    setUploadStatus('Please select an image file, such as a PNG or JPG.', 'error');
    return;
  }
  if (file.size > MAX_UPLOAD_BYTES) {
    setUploadStatus('Image is over 15 MB. Please choose a smaller file.', 'error');
    return;
  }

  const request = ++state.imageRequest;
  clearUploadPreview();
  if (file.type && file.type !== 'image/svg+xml') {
    state.previewUrl = URL.createObjectURL(file);
    elements.imagePreview.src = state.previewUrl;
    elements.imagePreviewWrap.hidden = false;
  }
  setUploadStatus(`Scanning ${file.name}…`);
  $('#choose-image').disabled = true;
  $('#replace-image').disabled = true;

  try {
    let QrScanner;
    try { QrScanner = await loadQrScanner(); }
    catch { throw new Error('DECODER_UNAVAILABLE'); }
    if (request !== state.imageRequest || state.view !== 'upload') return;
    const result = await QrScanner.scanImage(file, { returnDetailedScanResult: true });
    if (request !== state.imageRequest || state.view !== 'upload') return;
    showResult(result.data, 'upload');
  } catch (error) {
    if (request !== state.imageRequest || state.view !== 'upload') return;
    if (error.message === 'DECODER_UNAVAILABLE') {
      setUploadStatus('Could not load the scanner library. Check your internet connection and try again.', 'error');
    } else {
      setUploadStatus('No readable QR code found. Try a clearer picture with the full code visible.', 'error');
    }
  } finally {
    if (request === state.imageRequest) {
      $('#choose-image').disabled = false;
      $('#replace-image').disabled = false;
    }
  }
}

async function copyResult() {
  if (state.result === null) return;
  try {
    if (navigator.clipboard?.writeText && window.isSecureContext) {
      await navigator.clipboard.writeText(state.result);
    } else {
      // Fallback for older mobile browsers without the Clipboard API.
      const input = document.createElement('textarea');
      input.value = state.result;
      input.style.position = 'fixed';
      input.style.opacity = '0';
      document.body.appendChild(input);
      input.select();
      const copied = document.execCommand('copy');
      input.remove();
      if (!copied) throw new Error('Copy failed');
    }
    showToast('Copied to clipboard');
  } catch {
    showToast('Copy unavailable. Select the result text to copy it.');
  }
}

// UI wiring
for (const button of elements.nav) button.addEventListener('click', () => selectView(button.dataset.view));
elements.startCamera.addEventListener('click', startScanner);
elements.stopCamera.addEventListener('click', () => stopScanner());
elements.switchCamera.addEventListener('click', flipCamera);
elements.toggleFlash.addEventListener('click', toggleFlash);
$('#choose-image').addEventListener('click', () => elements.imageInput.click());
$('#replace-image').addEventListener('click', () => elements.imageInput.click());
elements.imageInput.addEventListener('change', () => processImage(elements.imageInput.files?.[0]));
$('#copy-result').addEventListener('click', copyResult);
$('#scan-again').addEventListener('click', () => { selectView('camera'); startScanner(); });
$('#upload-another').addEventListener('click', () => selectView('upload'));

for (const name of ['dragenter', 'dragover']) {
  elements.dropzone.addEventListener(name, (event) => {
    event.preventDefault();
    if (state.view === 'upload') elements.dropzone.classList.add('is-dragging');
  });
}
for (const name of ['dragleave', 'drop']) {
  elements.dropzone.addEventListener(name, (event) => {
    event.preventDefault();
    elements.dropzone.classList.remove('is-dragging');
  });
}
elements.dropzone.addEventListener('drop', (event) => {
  if (state.view === 'upload') processImage(event.dataTransfer?.files?.[0]);
});

document.addEventListener('visibilitychange', () => {
  if (document.hidden && (state.running || state.starting)) {
    stopScanner('Camera paused because the page went into the background. Tap Start camera to resume.');
  }
});
window.addEventListener('pagehide', () => {
  if (state.scanner) state.scanner.destroy();
  state.scanner = null;
  clearUploadPreview();
});

updateCameraControls();
selectView('camera');
