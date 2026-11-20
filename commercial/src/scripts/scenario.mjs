import { initialState, loadState, saveState, recordRoutes } from '../data/scenarios.mjs';

const product = document.body.dataset.product;
const record = document.querySelector('[data-scenario]');
if (record) {
  let storage;
  try { storage = localStorage; } catch { storage = null; }
  let { state, persistent } = loadState(product, storage);
  const notice = document.querySelector('#storage-notice');
  const result = document.querySelector('#scenario-result');
  const kind = record.dataset.scenario;
  const activity = entry => { state.history.unshift(entry); state.history = state.history.slice(0, 100); };
  const render = () => {
    notice.hidden = persistent;
    const list = document.querySelector('#history-list');
    list.replaceChildren(...state.history.map(item => { const li = document.createElement('li'); li.textContent = item; return li; }));
    if (state.result && (product !== 'workslip' || state.resultKind === kind)) result.textContent = state.result;
    if (product === 'workslip') {
      document.querySelectorAll('[data-check]').forEach(input => { input.checked = state.checked.includes(input.dataset.check); });
      const quantity = document.querySelector('#material-quantity');
      if (quantity) {
        quantity.textContent = state.quantity; document.querySelector('#quantity').max = state.quantity;
        document.querySelector('#quantity').disabled = state.quantity === 0;
        const button = document.querySelector('#quantity-form button');
        button.disabled = state.quantity === 0; button.textContent = state.quantity === 0 ? 'No material remaining' : 'Use material';
      }
      if (state.resultKind !== kind) result.textContent = kind === 'material' ? `${state.quantity} metres available` : state.minutes ? `${state.minutes} minutes saved · ${state.checked.length}/2 checks complete` : 'Job ready · complete the checklist';
    }
    if (product === 'tradey') {
      const approve = document.querySelector('#approve-offer');
      if (approve) { approve.disabled = state.approved; approve.textContent = state.approved ? 'Offer approved' : 'Approve offer'; }
      const order = document.querySelector('#existing-order');
      if (order) order.hidden = !state.approved;
      const note = document.querySelector('#order-note');
      if (note) note.textContent = state.approved ? 'Approved example · ready for fulfilment. No real order has been placed.' : 'This is a preview until the offer is approved.';
    }
    if (product === 'shippy') {
      document.querySelector('#receiver').value = state.receivedBy;
      document.querySelector('#delivery-step').textContent = state.delivered ? 'Delivered · proof recorded' : 'Delivery pending';
      const button = document.querySelector('#delivery-form button');
      button.disabled = state.delivered;
      button.textContent = state.delivered ? 'Delivery complete' : 'Complete delivery';
    }
  };
  const persist = () => { persistent = saveState(product, state, storage); render(); };
  const showResult = message => {
    state.result = message; if (product === 'workslip') state.resultKind = kind; persist();
    result.scrollIntoView({ block: 'start', behavior: 'instant' }); result.focus({ preventScroll: true });
  };
  document.querySelectorAll('[data-check]').forEach(input => input.addEventListener('change', () => {
    state.checked = [...document.querySelectorAll('[data-check]:checked')].map(item => item.dataset.check);
    if (state.checked.length === 2) { activity('Checklist complete · both checks passed'); showResult('Checklist complete · ready to save time'); }
    else { state.result = 'Checklist updated'; state.resultKind = kind; persist(); }
  }));
  document.querySelector('#time-form')?.addEventListener('submit', event => {
    event.preventDefault();
    const minutes = Number(document.querySelector('#minutes').value);
    if (!Number.isInteger(minutes) || minutes < 1 || minutes > 1440) return;
    state.minutes = minutes; activity(`${minutes} minutes recorded on the job`); showResult(`${minutes} minutes saved · ${state.checked.length}/2 checks complete`);
  });
  document.querySelector('#quantity-form')?.addEventListener('submit', event => {
    event.preventDefault();
    const quantity = Number(document.querySelector('#quantity').value);
    if (!Number.isInteger(quantity) || quantity < 1 || quantity > state.quantity) return;
    state.quantity -= quantity; activity(`${quantity} metres used · ${state.quantity} metres remaining`); showResult(`Material updated · ${state.quantity} metres available`);
  });
  document.querySelector('#approve-offer')?.addEventListener('click', () => {
    if (state.approved) return;
    state.approved = true; state.result = 'Order created · ORDER-1048'; activity('Offer approved · example order created'); persist(); location.assign(recordRoutes.order);
  });
  document.querySelector('#delivery-form')?.addEventListener('submit', event => {
    event.preventDefault();
    const receivedBy = document.querySelector('#receiver').value.trim();
    if (!receivedBy || receivedBy.length > 100 || state.delivered) return;
    state.receivedBy = receivedBy; state.delivered = true; activity(`Proof of delivery · received by ${receivedBy}`); showResult(`Delivered to ${receivedBy} · proof of delivery recorded`);
  });
  document.querySelector('#reset-demo').addEventListener('click', () => { state = initialState(product); document.querySelectorAll('form').forEach(form => form.reset()); showResult('Demo reset · the original example is ready'); });
  render();
}
