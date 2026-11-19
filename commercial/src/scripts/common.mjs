import { products } from '../data/scenarios.mjs';

document.addEventListener('click', event => {
  const card = event.target.closest('[data-href]');
  if (!card || event.target.closest('a,button,input,select,textarea,label')) return;
  if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
  location.assign(card.dataset.href);
});

const product = document.body.dataset.product;
if (products[product]) {
  const offline = document.querySelector('#offline-notice');
  const showConnection = () => { if (offline) offline.hidden = navigator.onLine; };
  showConnection();
  addEventListener('online', showConnection);
  addEventListener('offline', showConnection);
  const pwaStatus = document.querySelector('#pwa-status');
  const retryOffline = document.querySelector('#retry-offline');
  const pwaMessage = message => { if (pwaStatus) { pwaStatus.textContent = message; pwaStatus.removeAttribute('aria-busy'); } };
  const failedSaving = () => { pwaMessage('Offline saving could not finish. You can keep using the online demo, or try saving it again.'); if (retryOffline) retryOffline.hidden = false; };
  retryOffline?.addEventListener('click', () => location.reload());
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register(`/${product}/sw.js`, { scope: `/${product}/`, updateViaCache: 'none' }).then(async registration => {
      const ready = () => { pwaMessage('This example is ready to use offline on this device.'); if (retryOffline) retryOffline.hidden = true; };
      const offerUpdate = () => {
        const notice = document.querySelector('#update-notice');
        const button = document.querySelector('#update-demo');
        if (!notice || !button || !registration.waiting) return;
        notice.hidden = false;
        button.onclick = () => {
          if (!registration.waiting) { location.reload(); return; }
          button.disabled = true;
          registration.waiting.postMessage({ type: 'SKIP_WAITING' });
        };
      };
      const watch = worker => worker?.addEventListener('statechange', () => {
        if (worker.state === 'installed') { if (registration.active) offerUpdate(); else ready(); }
        if (worker.state === 'activated') ready();
        if (worker.state === 'redundant' && !registration.active) failedSaving();
      });
      offerUpdate();
      if (registration.active) ready();
      watch(registration.installing);
      registration.addEventListener('updatefound', () => watch(registration.installing));
      if (!registration.active && !registration.installing && !registration.waiting) failedSaving();
    }).catch(failedSaving);
    let controlled = Boolean(navigator.serviceWorker.controller);
    navigator.serviceWorker.addEventListener('controllerchange', () => {
      if (controlled) location.reload();
      controlled = true;
    });
  } else pwaMessage('Offline saving is unavailable in this browser. Use a bookmark to return to the demo.');

  let installPrompt;
  const installButton = document.querySelector('#install-demo');
  addEventListener('beforeinstallprompt', event => {
    event.preventDefault(); installPrompt = event;
    if (installButton) installButton.hidden = false;
  });
  installButton?.addEventListener('click', async () => {
    if (!installPrompt) return;
    installButton.disabled = true;
    try { await installPrompt.prompt(); await installPrompt.userChoice; }
    catch { pwaMessage('Installation could not finish. Use your browser menu to add the demo to your home screen.'); }
    finally { installPrompt = null; installButton.disabled = false; installButton.hidden = true; }
  });
  addEventListener('appinstalled', () => { pwaMessage('Demo installed. Open it from your home screen.'); if (installButton) installButton.hidden = true; });
}
