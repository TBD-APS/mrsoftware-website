import jsQR from 'jsqr';
import { materialPath } from '../data/scenarios.mjs';

const result = document.querySelector('#scan-result');
const imageInput = document.querySelector('#qr-image');
const cameraButton = document.querySelector('#start-camera');
const stopButton = document.querySelector('#stop-camera');
const video = document.querySelector('#qr-video');
const canvas = document.createElement('canvas');
const context = canvas.getContext('2d', { willReadFrequently: true });
let stream, timer, frame, scanning = false, session = 0;
const show = message => { result.textContent = message; result.hidden = false; result.scrollIntoView({ block: 'start', behavior: 'instant' }); result.focus({ preventScroll: true }); };
function stop() {
  session++; scanning = false; clearTimeout(timer); cancelAnimationFrame(frame);
  stream?.getTracks().forEach(track => track.stop()); stream = null;
  video.srcObject = null; video.hidden = true; stopButton.hidden = true;
  cameraButton.disabled = false; cameraButton.removeAttribute('aria-busy');
}
function openCode(value) {
  const path = materialPath(value, location.origin);
  if (!path) { show('This is not an example material code. Use MAT-101 or the example QR label below.'); return false; }
  stop(); location.assign(path); return true;
}
function decode(source, width, height) {
  const scale = Math.min(1, 1600 / Math.max(width, height));
  canvas.width = Math.max(1, Math.round(width * scale)); canvas.height = Math.max(1, Math.round(height * scale));
  context.drawImage(source, 0, 0, canvas.width, canvas.height);
  const data = context.getImageData(0, 0, canvas.width, canvas.height);
  return jsQR(data.data, data.width, data.height)?.data;
}
document.querySelector('#manual-lookup').addEventListener('submit', event => { event.preventDefault(); openCode(document.querySelector('#material-code').value); });
imageInput.addEventListener('change', async () => {
  const file = imageInput.files?.[0];
  if (!file) return;
  stop(); imageInput.setAttribute('aria-busy', 'true');
  let bitmap;
  try {
    if (!file.type.startsWith('image/') || file.size > 8 * 1024 * 1024) throw new Error('image');
    bitmap = await createImageBitmap(file);
    const value = decode(bitmap, bitmap.width, bitmap.height);
    if (value) openCode(value);
    else show('No QR code was found in that image. Try the example label or enter MAT-101.');
  } catch { show('That image could not be read. Choose another QR image or enter MAT-101.'); }
  finally { bitmap?.close(); imageInput.removeAttribute('aria-busy'); imageInput.value = ''; }
});
cameraButton.addEventListener('click', async () => {
  stop();
  if (!navigator.mediaDevices?.getUserMedia) { show('Camera scanning is unavailable. Choose a QR image or enter MAT-101.'); return; }
  const attempt = session;
  scanning = true; cameraButton.disabled = true; cameraButton.setAttribute('aria-busy', 'true'); stopButton.hidden = false;
  // A browser permission prompt may remain unanswered; always provide a way out.
  timer = setTimeout(() => { stop(); show('Camera scanning stopped. Choose a QR image or enter MAT-101.'); }, 20_000);
  try {
    const acquired = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: 'environment' } }, audio: false });
    if (attempt !== session) { acquired.getTracks().forEach(track => track.stop()); return; }
    stream = acquired; video.srcObject = stream; video.hidden = false;
    await video.play(); cameraButton.removeAttribute('aria-busy');
    let lastFrame = 0;
    const scan = (time = 0) => {
      if (!scanning) return;
      if (video.readyState >= 2 && video.videoWidth && time - lastFrame >= 120) {
        lastFrame = time;
        try {
          const value = decode(video, video.videoWidth, video.videoHeight);
          if (value) { stop(); openCode(value); return; }
        } catch { stop(); show('Camera scanning stopped. Choose a QR image or enter MAT-101.'); return; }
      }
      frame = requestAnimationFrame(scan);
    };
    scan();
  } catch { if (attempt === session) { stop(); show('Camera access was not available. Choose a QR image or enter MAT-101.'); } }
});
stopButton.addEventListener('click', () => { stop(); show('Camera stopped. You can choose an image or enter MAT-101.'); });
addEventListener('pagehide', stop);
