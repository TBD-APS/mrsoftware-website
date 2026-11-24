export const publicOrigin = 'https://demos.mrsoftware.dk';
export const scenarioVersion = 1;
export const products = {
  workslip: { name: 'Workslip', number: '01', category: 'Field service', summary: 'From checklist to hours and materials, while you are on the job.', route: '/workslip/jobs/ws-1042/', code: 'WS-1042', title: 'Kitchen service', detail: 'Holm & Co · Aarhus · 2 checklist items', action: 'Finish the checklist and save your time.' },
  tradey: { name: 'Tradey', number: '02', category: 'Food trade', summary: 'Review an offer with everything in one place. Turn it into an order.', route: '/tradey/offers/offer-1048/', code: 'OFFER-1048', title: 'Summer produce offer', detail: 'Nordic Kitchen · 120 kg · DKK 2,400', action: 'Check the quantities and approve the example offer.' },
  shippy: { name: 'Shippy', number: '03', category: 'Shipping', summary: 'Follow a shipment to its destination and keep the proof of delivery.', route: '/shippy/shipments/shp-2048/', code: 'SHP-2048', title: 'Aarhus delivery', detail: 'Nordic Kitchen · 2 pallets · Aarhus', action: 'Record who received the shipment and complete delivery.' },
};
export const recordRoutes = {
  job: '/workslip/jobs/ws-1042/', material: '/workslip/materials/mat-101/',
  offer: '/tradey/offers/offer-1048/', order: '/tradey/orders/order-1048/',
  shipment: '/shippy/shipments/shp-2048/',
};
export const productRoutes = product => [`/${product}/`, `/${product}/install/`, ...Object.values(recordRoutes).filter(route => route.startsWith(`/${product}/`))];
export const stateKey = product => `mrsoftware-demo:${product}:v${scenarioVersion}`;
export function initialState(product) {
  if (product === 'workslip') return { checked: [], minutes: 0, quantity: 12, history: ['Job ready · example data'], result: '', resultKind: '' };
  if (product === 'tradey') return { approved: false, history: ['Offer ready · example data'], result: '' };
  if (product === 'shippy') return { receivedBy: '', delivered: false, history: ['Shipment in transit · example data'], result: '' };
  throw new Error('Unknown demo.');
}
export function validState(product, value) {
  if (!value || !Array.isArray(value.history) || value.history.length > 100 || !value.history.every(item => typeof item === 'string' && item.length <= 300) || typeof value.result !== 'string' || value.result.length > 300) return false;
  if (product === 'workslip') return ['', 'job', 'material'].includes(value.resultKind) && Array.isArray(value.checked) && value.checked.every(id => ['supply', 'connections'].includes(id)) && Number.isInteger(value.minutes) && value.minutes >= 0 && value.minutes <= 1440 && Number.isInteger(value.quantity) && value.quantity >= 0 && value.quantity <= 999;
  if (product === 'tradey') return typeof value.approved === 'boolean';
  if (product === 'shippy') return typeof value.delivered === 'boolean' && typeof value.receivedBy === 'string' && value.receivedBy.length <= 100;
  return false;
}
export function loadState(product, storage) {
  try {
    const raw = storage.getItem(stateKey(product));
    const value = raw ? JSON.parse(raw) : initialState(product);
    return { state: validState(product, value) ? value : initialState(product), persistent: true };
  } catch { return { state: initialState(product), persistent: false }; }
}
export function saveState(product, state, storage) {
  try { storage.setItem(stateKey(product), JSON.stringify(state)); return true; } catch { return false; }
}
// A scanned link can only resolve to this seeded material. Production QR labels
// use the owned canonical hostname; loopback/current-origin links also work.
export function materialPath(input, currentOrigin) {
  const code = input.trim();
  if (code.toUpperCase() === 'MAT-101') return recordRoutes.material;
  try {
    const url = new URL(code);
    if (![publicOrigin, currentOrigin].includes(url.origin) || url.username || url.password || url.search || url.hash) return null;
    return url.pathname === recordRoutes.material ? recordRoutes.material : null;
  } catch { return null; }
}
