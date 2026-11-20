import { readFile } from 'node:fs/promises';
import QRCode from 'qrcode';
import { test, expect } from './fixtures.mjs';

const generatedLabel = new URL('../../commercial/public/workslip/qr/mat-101.png', import.meta.url);
async function cameraImage(page, buffer) {
  await page.addInitScript(async data => {
    navigator.mediaDevices.getUserMedia = async () => {
      const image = new Image(); image.src = data; await image.decode();
      const canvas = document.createElement('canvas'); canvas.width = image.width; canvas.height = image.height;
      const context = canvas.getContext('2d'); context.drawImage(image, 0, 0);
      const stream = canvas.captureStream(10), track = stream.getVideoTracks()[0];
      const original = track.stop.bind(track);
      track.stop = () => { sessionStorage.setItem('synthetic-camera-stopped', 'yes'); original(); };
      const redraw = setInterval(() => { if (track.readyState === 'ended') clearInterval(redraw); else context.drawImage(image, 0, 0); }, 100);
      return stream;
    };
  }, `data:image/png;base64,${buffer.toString('base64')}`);
}
test('a generated canonical QR image decodes locally and opens the exact material', async ({ page, app }) => {
  const requests = [];
  page.on('request', request => requests.push(request.url()));
  await page.goto(app.base + 'workslip/');
  await page.getByLabel('Choose QR image').setInputFiles({ name: 'example-label.png', mimeType: 'image/png', buffer: await readFile(generatedLabel) });
  await expect(page).toHaveURL(app.base + 'workslip/materials/mat-101/');
  await expect(page.locator('h1')).toHaveText('Copper pipe 15 mm');
  expect(requests.every(url => url.startsWith(app.base))).toBe(true);
});

test('invalid QR images and foreign QR links keep the manual fallback usable', async ({ page, app }) => {
  await page.goto(app.base + 'workslip/');
  const upload = page.getByLabel('Choose QR image');
  await upload.setInputFiles({ name: 'foreign.png', mimeType: 'image/png', buffer: await QRCode.toBuffer('https://example.org/workslip/materials/mat-101/') });
  await expect(page.locator('#scan-result')).toContainText('Use MAT-101');
  await upload.setInputFiles({ name: 'no-qr.png', mimeType: 'image/png', buffer: await readFile(new URL('../../commercial/public/workslip/icons/icon-192.png', import.meta.url)) });
  await expect(page.locator('#scan-result')).toContainText('No QR code was found');
  await upload.setInputFiles({ name: 'broken.png', mimeType: 'image/png', buffer: Buffer.from('not an image') });
  await expect(page.locator('#scan-result')).toContainText('could not be read');
  await expect(upload).not.toHaveAttribute('aria-busy', 'true');
  await page.getByLabel('Material code or demo link').fill('MAT-101');
  await page.getByRole('button', { name: 'Find material' }).click();
  await expect(page.locator('h1')).toHaveText('Copper pipe 15 mm');
});

test('camera denial ends its busy state and leaves image and manual choices', async ({ page, app }) => {
  await page.addInitScript(() => { navigator.mediaDevices.getUserMedia = async () => { throw new DOMException('Denied', 'NotAllowedError'); }; });
  await page.goto(app.base + 'workslip/');
  await page.getByRole('button', { name: 'Scan with camera' }).click();
  await expect(page.locator('#scan-result')).toContainText('Camera access was not available');
  await expect(page.locator('#start-camera')).toBeEnabled();
  await expect(page.locator('#start-camera')).not.toHaveAttribute('aria-busy', 'true');
  await expect(page.locator('#qr-video')).toBeHidden();
  await page.getByLabel('Material code or demo link').fill('MAT-101');
  await page.getByRole('button', { name: 'Find material' }).click();
  await expect(page).toHaveURL(app.base + 'workslip/materials/mat-101/');
});

test('camera video frames decode the generated example and stop the camera', async ({ page, app }) => {
  await cameraImage(page, await readFile(generatedLabel));
  await page.goto(app.base + 'workslip/');
  await page.getByRole('button', { name: 'Scan with camera' }).click();
  await expect(page).toHaveURL(app.base + 'workslip/materials/mat-101/');
  await expect(page.locator('h1')).toHaveText('Copper pipe 15 mm');
  expect(await page.evaluate(() => sessionStorage.getItem('synthetic-camera-stopped'))).toBe('yes');
});

test('a foreign QR detected by the camera stops scanning and offers manual entry', async ({ page, app }) => {
  await cameraImage(page, await QRCode.toBuffer('https://example.org/workslip/materials/mat-101/'));
  await page.goto(app.base + 'workslip/');
  await page.getByRole('button', { name: 'Scan with camera' }).click();
  await expect(page.locator('#scan-result')).toContainText('Use MAT-101');
  await expect(page.locator('#stop-camera')).toBeHidden();
  await expect(page.locator('#start-camera')).toBeEnabled();
  await page.getByLabel('Material code or demo link').fill('MAT-101');
  await page.getByRole('button', { name: 'Find material' }).click();
  await expect(page.locator('h1')).toHaveText('Copper pipe 15 mm');
});

test('cancelling an unanswered camera request stops a stream that arrives late', async ({ page, app }) => {
  await page.addInitScript(() => { navigator.mediaDevices.getUserMedia = () => new Promise(resolve => { window.resolveTestCamera = resolve; }); });
  await page.goto(app.base + 'workslip/');
  await page.getByRole('button', { name: 'Scan with camera' }).click();
  await expect(page.locator('#start-camera')).toBeDisabled();
  await page.getByRole('button', { name: 'Stop camera' }).click();
  await page.evaluate(() => {
    window.testCameraStream = document.createElement('canvas').captureStream(1);
    window.resolveTestCamera(window.testCameraStream);
  });
  await expect.poll(() => page.evaluate(() => window.testCameraStream.getTracks()[0].readyState)).toBe('ended');
  await expect(page.locator('#start-camera')).toBeEnabled();
  await expect(page.locator('[aria-busy="true"]')).toHaveCount(0);
});
