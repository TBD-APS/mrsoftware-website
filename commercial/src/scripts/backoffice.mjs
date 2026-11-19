import { apiJson, ApiError } from './api.mjs';
import { el, action, link, pageHeading, result, productName, quoteName, titleCase, dayString, href } from './sales/dom.mjs';
import { customerForm, opportunityForm, quoteForm, catalogForm } from './sales/forms.mjs';
import { listWarning, todayView, customersView, salesView, quotesView, customerView, opportunityView, quoteView, catalogueView } from './sales/views.mjs';

const main = document.querySelector('main');
const email = document.querySelector('#session-email');
const nav = document.querySelector('.workspace-nav');
const allowedViews = ['today', 'customers', 'customer', 'customer-new', 'customer-edit', 'sales', 'opportunity', 'opportunity-new', 'opportunity-edit', 'quotes', 'quote', 'quote-new', 'catalogue', 'package', 'demo'];
const collectionFor = { customer: 'customers', opportunity: 'opportunities', quote: 'quotes' };
let generation = 0;
let currentRequest;
let notice = '';
let currentRoute = location.pathname + location.search;

function navigate(url) {
  if (url === location.pathname + location.search) return;
  history.pushState(null, '', url);
  notice = '';
  load();
}
function showError(error) {
  const access = error instanceof ApiError && [401, 403].includes(error.status);
  main.replaceChildren(pageHeading(access ? 'Sign in to continue' : error.status === 404 ? 'Record not found' : 'Could not load your workspace'),
    el('div', { className: 'load-error', role: 'alert' }, el('p', {}, error.message), action('Try again', () => load()), link('Today', 'today')));
}
function markReady() { main.setAttribute('data-ready', 'true'); main.removeAttribute('aria-busy'); }
function setNavigation(view) {
  const section = view.startsWith('customer') ? 'customers' : view.startsWith('opportunity') || view === 'sales' ? 'sales' : view.startsWith('quote') ? 'quotes' : ['catalogue', 'package', 'demo'].includes(view) ? 'catalogue' : 'today';
  for (const anchor of nav.querySelectorAll('a')) {
    if (anchor.dataset.section === section) anchor.setAttribute('aria-current', 'page'); else anchor.removeAttribute('aria-current');
  }
}
function formSave(path, method, destination, success) {
  return async (form, errorBox, read) => {
    // A form may be left while its request is in flight. It must not navigate a
    // later screen, and detached controls still leave their busy state in finally.
    const screen = generation;
    const controls = [...form.querySelectorAll('button,input,select,textarea')];
    const disabled = controls.map(control => control.disabled);
    errorBox.hidden = true; errorBox.replaceChildren();
    form.setAttribute('aria-busy', 'true');
    let data;
    try {
      data = read();
      controls.forEach(control => { control.disabled = true; });
      const response = await apiJson(path, { method, body: data });
      if (screen !== generation) return;
      notice = typeof success === 'function' ? success(data) : success;
      const target = destination(response);
      if (target !== location.pathname + location.search) history.pushState(null, '', target);
      await load();
    } catch (error) {
      if (screen !== generation) return;
      errorBox.append(el('p', {}, error.status === 409 ? 'This record has changed elsewhere. Your entries are still here. Reload the latest saved version before editing again.' : error.message));
      if (error.status === 409) errorBox.append(action('Reload latest', () => { notice = ''; load(); }));
      errorBox.hidden = false;
      errorBox.scrollIntoView({ block: 'start' }); errorBox.focus({ preventScroll: true });
    } finally {
      form.removeAttribute('aria-busy'); controls.forEach((control, index) => { control.disabled = disabled[index]; });
    }
  };
}
function upsert(state, kind, item) {
  const index = state[kind].findIndex(record => record.id === item.id);
  if (index < 0) state[kind].push(item); else state[kind][index] = item;
  return item;
}
async function load() {
  const run = ++generation;
  currentRoute = location.pathname + location.search;
  currentRequest?.abort(); currentRequest = new AbortController();
  const signal = currentRequest.signal;
  main.setAttribute('aria-busy', 'true'); main.removeAttribute('data-ready');
  // Remove the previous record immediately so a failed load cannot present stale
  // private data as a fresh result or turn it into a false empty workspace.
  main.replaceChildren(pageHeading('Sales workspace'), el('p', { role: 'status' }, 'Loading your workspace…'));
  try {
    const params = new URLSearchParams(location.search);
    const view = params.get('view') || 'today';
    if (!allowedViews.includes(view)) throw new ApiError('This page was not found. Open Today to continue.', 404);
    setNavigation(view);
    const [session, state] = await Promise.all([apiJson('/api/backoffice/session', { signal }), apiJson('/api/backoffice/state', { signal })]);
    const getRecord = async (kind, id) => {
      if (!id) throw new ApiError('A record ID is needed to open this page.', 404);
      const { item } = await apiJson(`/api/backoffice/${kind}/${encodeURIComponent(id)}`, { signal });
      return upsert(state, kind, item);
    };
    const ensure = async (kind, id) => id ? state[kind].find(item => item.id === id) ?? await getRecord(kind, id) : null;
    const recordType = view.replace(/-edit$/, '');
    const item = collectionFor[recordType] ? await getRecord(collectionFor[recordType], params.get('id')) : null;
    let selectedCustomer = params.get('customer') || '';
    let selectedOpportunity = params.get('opportunity') || '';
    if (view === 'quote-new' && selectedOpportunity) {
      const opportunity = await getRecord('opportunities', selectedOpportunity);
      selectedCustomer = opportunity.customerId;
    }
    if (selectedCustomer) await ensure('customers', selectedCustomer);
    if (item?.customerId) await ensure('customers', item.customerId);
    if (item?.opportunityId) await ensure('opportunities', item.opportunityId);
    // State is bounded independently for each collection. A visible opportunity
    // can refer to a customer beyond that bound, so fetch that customer directly.
    const missingCustomers = [...new Set(state.opportunities.map(op => op.customerId))].filter(id => !state.customers.some(customer => customer.id === id));
    await Promise.all(missingCustomers.map(id => getRecord('customers', id)));
    if (run !== generation) return;
    email.textContent = session.email;
    let title, description = '', actions = [], content = [], savedMessage = '';
    switch (view) {
      case 'today':
        title = 'Today'; description = 'The conversations and next steps that need your attention.';
        actions = [link('New customer', 'customer-new', {}, 'button primary')]; content = [todayView(state, dayString())]; break;
      case 'customers':
        title = 'Customers'; description = 'Companies, contacts and the work you are discussing.';
        actions = [link('New customer', 'customer-new', {}, 'button primary')]; content = customersView(state, navigate); break;
      case 'customer-new':
      case 'customer-edit':
        title = item ? 'Edit customer' : 'New customer';
        content = [customerForm(item, formSave('/api/backoffice/customers' + (item ? '/' + item.id : ''), item ? 'PUT' : 'POST', response => href('customer', { id: response.item.id }), 'Customer saved.'))]; break;
      case 'customer':
        title = item.name; savedMessage = 'Customer saved · Contact details and private notes';
        actions = [link('New opportunity', 'opportunity-new', { customer: item.id }, 'button primary'), link('New quote', 'quote-new', { customer: item.id }, 'button secondary'), link('Edit customer', 'customer-edit', { id: item.id }, 'button secondary')];
        content = customerView(item, state); break;
      case 'sales':
        title = 'Sales'; description = 'Keep each opportunity moving with a clear next step.';
        actions = [link('New opportunity', 'opportunity-new', {}, 'button primary')]; content = salesView(state, navigate); break;
      case 'opportunity-new':
      case 'opportunity-edit':
        title = item ? 'Edit opportunity' : 'New opportunity';
        content = [opportunityForm(item, state, selectedCustomer, formSave('/api/backoffice/opportunities' + (item ? '/' + item.id : ''), item ? 'PUT' : 'POST', response => href('opportunity', { id: response.item.id }), 'Opportunity saved.'))]; break;
      case 'opportunity':
        title = item.title; savedMessage = 'Opportunity saved · ' + titleCase(item.stage);
        actions = [link('New quote', 'quote-new', { customer: item.customerId, opportunity: item.id }, 'button primary'), link('Edit opportunity', 'opportunity-edit', { id: item.id }, 'button secondary')];
        content = opportunityView(item, state); break;
      case 'quotes':
        title = 'Quotes'; description = 'Saved quotes keep the customer, package and amounts agreed at the time.';
        actions = [link('New quote', 'quote-new', {}, 'button primary')]; content = quotesView(state, navigate); break;
      case 'quote-new':
        title = 'New quote';
        content = [quoteForm(state, selectedCustomer, selectedOpportunity, ['workslip', 'tradey', 'shippy'].includes(params.get('product')) ? params.get('product') : 'workslip', formSave('/api/backoffice/quotes', 'POST', response => href('quote', { id: response.item.id }), 'Quote saved. The preview shows the saved details. No email was sent.'))]; break;
      case 'quote':
        title = quoteName(item); savedMessage = 'Quote saved · ' + titleCase(item.status);
        content = quoteView(item, state, formSave('/api/backoffice/quotes/' + item.id, 'PUT', () => href('quote', { id: item.id }), data => 'Status changed to ' + titleCase(data.status) + '. No email was sent.')); break;
      case 'catalogue':
        title = 'Catalogue'; description = 'Manage packages and public demos. Existing quotes keep their saved details.';
        content = catalogueView(state.catalog); break;
      case 'package':
      case 'demo': {
        const catalogItem = (view === 'package' ? state.catalog.packages : state.catalog.demos).find(entry => entry.id === params.get('id'));
        if (!catalogItem) throw new ApiError('This catalogue entry was not found.', 404);
        title = view === 'package' ? productName(catalogItem.product) + (catalogItem.name.toLowerCase() === catalogItem.product ? '' : ' ' + catalogItem.name) : productName(catalogItem.id) + ' demo';
        description = view === 'package' ? 'Update the offer for future customers and quotes.' : 'Choose what visitors can see in the public demo directory.';
        if (state.catalog.revision > 1) savedMessage = view === 'package' ? 'Package saved · Current catalogue' : 'Demo saved · Current catalogue';
        content = [catalogForm(catalogItem, state.catalog, view, formSave('/api/backoffice/catalog', 'PUT', () => href(view, { id: catalogItem.id }), view === 'package' ? 'Package saved. Existing quotes keep their amounts.' : 'Demo saved.'))]; break;
      }
    }
    document.title = title + ' | MR Software sales';
    main.replaceChildren(pageHeading(title, description, actions), ...(notice || savedMessage ? [result(notice || savedMessage)] : []), ...(listWarning(state) ? [listWarning(state)] : []), ...content.flat(Infinity).filter(Boolean));
    window.scrollTo({ top: 0, behavior: 'instant' });
  } catch (error) {
    if (run === generation) showError(error);
  } finally { if (run === generation) markReady(); }
}

document.addEventListener('click', event => {
  if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
  const anchor = event.target.closest('a[href]');
  if (anchor) {
    const target = new URL(anchor.href, location.href);
    if (anchor.hasAttribute('download') || anchor.target || target.href.includes('#') || target.origin !== location.origin || target.pathname !== '/backoffice/') return;
    event.preventDefault(); navigate(target.pathname + target.search); return;
  }
  const card = event.target.closest('[data-href]');
  if (card && !event.target.closest('button,input,select,textarea,label')) navigate(card.dataset.href);
});
addEventListener('popstate', () => {
  // Same-document fragments keep the browser's native focus/scroll behavior.
  if (location.pathname + location.search === currentRoute) return;
  notice = ''; load();
});
// A restored browser page must read authoritative data again. Never persist a
// private record to browser storage or register a private offline worker.
addEventListener('pageshow', event => { if (event.persisted) { notice = ''; load(); } });
load();
