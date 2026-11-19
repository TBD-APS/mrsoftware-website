import { initialCatalog } from '../../shared/catalog.mjs';
import { products } from '../data/scenarios.mjs';
import { moneyLabel, enquiryContext } from '../data/pricing.mjs';
import { apiJson } from './api.mjs';

const status = document.querySelector('#catalog-status');
const retry = document.querySelector('#retry-catalog');
const form = document.querySelector('#enquiry-form');
const productSelect = form?.querySelector('#product');
const packageSelect = form?.querySelector('#package');
const result = document.querySelector('#enquiry-result');
let catalog = initialCatalog, pending, receipt;
const node = (tag, text, className) => { const element = document.createElement(tag); if (text !== undefined) element.textContent = text; if (className) element.className = className; return element; };
function packagesForProduct(selected = packageSelect?.value) {
  if (!form) return;
  const options = [new Option('Help me choose', ''), ...catalog.packages.filter(item => item.product === productSelect.value && item.active).map(item => new Option(`${item.name} · ${moneyLabel(item.monthlyMinor)}`, item.id))];
  packageSelect.replaceChildren(...options);
  if (options.some(option => option.value === selected)) packageSelect.value = selected;
}
function renderPackages() {
  const list = document.querySelector('#package-list');
  if (!list) return;
  const cards = catalog.packages.filter(item => item.active).map(item => {
    const card = node('article', undefined, 'package-card');
    card.append(node('p', products[item.product].name, 'eyebrow'), node('h2', item.name), node('p', moneyLabel(item.monthlyMinor), 'price'), node('p', item.monthlyMinor === null ? 'Price and scope confirmed in your quote' : 'per month · VAT and setup confirmed in your quote', 'fine'));
    const includes = node('ul'); includes.append(...item.includes.map(line => node('li', line))); card.append(includes);
    const link = node('a', `Choose ${item.product === 'workslip' ? 'Workslip ' : ''}${item.name}`, 'button secondary');
    link.href = `/pricing/?product=${encodeURIComponent(item.product)}&package=${encodeURIComponent(item.id)}#enquiry`;
    card.append(link); return card;
  });
  list.replaceChildren(...(cards.length ? cards : [node('p', 'No packages are available right now. You can still ask us about your business.')]));
}
function renderDemos() {
  const list = document.querySelector('#demo-list');
  if (!list) return;
  list.querySelectorAll('[data-demo]').forEach(card => {
    const demo = catalog.demos.find(item => item.id === card.dataset.demo);
    card.hidden = !demo?.active;
    if (demo) { card.querySelector('h2 a').textContent = demo.title; card.querySelector(':scope > p').textContent = demo.summary; }
  });
  let empty = list.querySelector('.empty-demos');
  if (!catalog.demos.some(item => item.active) && !empty) { empty = node('p', 'No demos are available right now. Please try again later.', 'empty-demos'); list.append(empty); }
  if (catalog.demos.some(item => item.active)) empty?.remove();
}
async function loadCatalog() {
  status.setAttribute('aria-busy', 'true'); retry.hidden = true;
  status.textContent = form ? 'Checking current prices…' : 'Checking available demos…';
  try {
    const response = await apiJson('/api/catalog');
    if (!response.catalog || !Array.isArray(response.catalog.packages) || !Array.isArray(response.catalog.demos)) throw new Error('catalog');
    catalog = response.catalog; renderPackages(); renderDemos(); packagesForProduct();
    status.textContent = form ? 'Current starting prices · final scope, VAT and setup are confirmed in your quote.' : 'Ready to try. No sign-in needed.';
  } catch {
    status.textContent = form ? 'Current prices could not be checked. The starting prices shown may have changed. Please try again or ask for a quote.' : 'Available demos could not be checked. You can still try the examples shown here.';
    retry.hidden = false;
  } finally { status.removeAttribute('aria-busy'); }
}
retry?.addEventListener('click', loadCatalog);

if (form) {
  const selected = enquiryContext(location.search, catalog);
  productSelect.value = selected.product; packagesForProduct(selected.packageId);
  // Only a reference and its product/package context are retained; contact
  // details stay in the form. A past receipt never claims a different request.
  const receiptKey = 'mrsoftware-enquiry-receipt:v1';
  try { receipt = JSON.parse(sessionStorage.getItem(receiptKey) ?? 'null'); } catch { /* Receipt still works in this page. */ }
  const showReceipt = reference => { result.hidden = false; result.textContent = `Request received · reference ${reference}. We will be in touch.`; result.dataset.received = 'true'; };
  if (receipt && /^[0-9a-f-]{36}$/i.test(receipt.reference) && receipt.product === selected.product && receipt.packageId === selected.packageId) showReceipt(receipt.reference);
  const updateContext = () => {
    const params = new URLSearchParams({ product: productSelect.value });
    if (packageSelect.value) params.set('package', packageSelect.value);
    history.replaceState(null, '', `/pricing/?${params}#enquiry`);
    result.hidden = true; delete result.dataset.received;
  };
  productSelect.addEventListener('change', () => { packagesForProduct(''); updateContext(); });
  packageSelect.addEventListener('change', updateContext);
  form.addEventListener('input', () => { if (result.dataset.received) { result.hidden = true; delete result.dataset.received; } });
  form.addEventListener('submit', async event => {
    event.preventDefault();
    if (form.getAttribute('aria-busy') === 'true') return;
    const fields = Object.fromEntries(new FormData(form));
    const fingerprint = JSON.stringify(fields);
    if (!pending || pending.fingerprint !== fingerprint) pending = { fingerprint, body: { requestId: crypto.randomUUID(), ...fields } };
    form.setAttribute('aria-busy', 'true'); const button = form.querySelector('button[type=submit]'); button.disabled = true;
    result.hidden = false; delete result.dataset.received; result.textContent = 'Sending your request…'; result.scrollIntoView({ block: 'start', behavior: 'instant' });
    try {
      const response = await apiJson('/api/enquiries', { method: 'POST', body: pending.body });
      if (response.received !== true || typeof response.reference !== 'string') throw new Error('receipt');
      receipt = { reference: response.reference, product: fields.product, packageId: fields.packageId };
      try { sessionStorage.setItem(receiptKey, JSON.stringify(receipt)); } catch { /* No contact details are saved. */ }
      form.reset(); productSelect.value = fields.product; packagesForProduct(fields.packageId);
      updateContext(); showReceipt(receipt.reference);
      pending = null;
    } catch (error) {
      const message = error.status === 429 ? 'Too many requests have been sent from this network. Please try again in an hour.' : error.status === 400 ? error.message : error.status === 409 ? 'This request changed while it was being sent. Please reload and try again.' : 'We could not confirm your request. Please try again with the same details; a retry will not create a second request.';
      result.textContent = message;
    } finally {
      form.removeAttribute('aria-busy'); button.disabled = false; result.scrollIntoView({ block: 'start', behavior: 'instant' }); result.focus({ preventScroll: true });
    }
  });
  // A package link opens this form directly, including after a shared link/reload.
  if (location.hash === '#enquiry') requestAnimationFrame(() => document.querySelector('#enquiry').scrollIntoView({ block: 'start', behavior: 'instant' }));
}
loadCatalog();
