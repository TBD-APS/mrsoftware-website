import { closeMore } from './sales/navigation.mjs';
import { apiJson, ApiError } from './api.mjs';
import { el, action, link, pageHeading, result, productName, quoteName, titleCase, dayString, dateLabel, href } from './sales/dom.mjs';
import { customerForm, opportunityForm, quoteForm, catalogForm } from './sales/forms.mjs';
import { listWarning, todayView, customersView, salesView, quotesView, customerView, opportunityView, quoteView, catalogueView } from './sales/views.mjs';
import { leadQuery, leadSearchForm, leadsView, leadView } from './sales/leads.mjs';

const main = document.querySelector('main');
const email = document.querySelector('#session-email');
const nav = document.querySelector('.workspace-nav');
const allowedViews = ['today', 'leads', 'lead', 'customers', 'customer', 'customer-new', 'customer-edit', 'sales', 'opportunity', 'opportunity-new', 'opportunity-edit', 'quotes', 'quote', 'quote-new', 'catalogue', 'package', 'demo'];
const collectionFor = { customer: 'customers', opportunity: 'opportunities', quote: 'quotes' };
let generation = 0;
let currentRequest;
let notice = '';
let currentRoute = location.pathname + location.search;

const moreToggle = nav.querySelector('.nav-more-toggle');

// Downloads go through fetch so a failed download, or an expired sign-in, is shown on the page
// instead of disappearing into the browser's download list. The button is busy until it ends.
function downloadButton(path) {
  const status = el('p', { className: 'download-error', role: 'alert', hidden: true });
  const button = el('button', { type: 'button', className: 'button secondary' }, 'Download CSV');
  const signIn = 'Could not download the file. Reload the page to sign in again, then try again.';
  button.addEventListener('click', async () => {
    status.hidden = true; status.replaceChildren();
    button.disabled = true; button.setAttribute('aria-busy', 'true');
    try {
      let response;
      try { response = await fetch(path, { credentials: 'same-origin', signal: AbortSignal.timeout(30_000) }); }
      catch { throw new ApiError(signIn); }
      if (!response.ok) {
        let message = 'Could not download the file. Please try again.';
        try { const body = await response.json(); if (typeof body.error === 'string') message = body.error; } catch { /* keep the plain message */ }
        throw new ApiError(message, response.status);
      }
      if (!(response.headers.get('Content-Type') ?? '').startsWith('text/csv')) throw new ApiError(signIn);
      const name = /filename="([^"]+)"/.exec(response.headers.get('Content-Disposition') ?? '')?.[1] ?? 'download.csv';
      const url = URL.createObjectURL(await response.blob());
      const save = el('a', { href: url, download: name, hidden: true });
      document.body.append(save); save.click(); save.remove();
      setTimeout(() => URL.revokeObjectURL(url), 10_000);
    } catch (error) {
      if ([401, 403].includes(error.status)) { showError(error); return; }
      status.append(error.message); status.hidden = false;
    } finally { button.disabled = false; button.removeAttribute('aria-busy'); }
  });
  return el('span', { className: 'download' }, button, status);
}

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
  const section = view.startsWith('lead') ? 'leads' : view.startsWith('customer') ? 'customers' : view.startsWith('opportunity') || view === 'sales' ? 'sales' : view.startsWith('quote') ? 'quotes' : ['catalogue', 'package', 'demo'].includes(view) ? 'catalogue' : 'today';
  closeMore();
  moreToggle?.toggleAttribute('aria-current', false);
  if (moreToggle?.dataset.sections.split(' ').includes(section)) moreToggle.setAttribute('aria-current', 'page');
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
      notice = typeof success === 'function' ? success(data, response) : success;
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
    const queueQuery = new URLSearchParams({ date: params.get('date') ?? dayString() });
    for (const key of ['followUpsAfter', 'enquiriesAfter', 'quotesAfter']) if (params.has(key)) queueQuery.set(key, params.get(key));
    // Today reads its filtered queues directly, and the lead screens read CVR, independently of recent lists.
    const ownData = view === 'today' || view.startsWith('lead');
    const [session, data] = await Promise.all([apiJson('/api/backoffice/session', { signal }), view.startsWith('lead') ? null : apiJson(view === 'today' ? '/api/backoffice/today?' + queueQuery : '/api/backoffice/state', { signal })]);
    const state = ownData ? { customers: [], opportunities: [], quotes: [], events: [], truncated: false } : data;
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
    const product = ['workslip', 'tradey', 'shippy'].includes(params.get('product')) ? params.get('product') : 'workslip';
    // A register that fails or is not connected is shown beside the search form, never as an empty result.
    let leads = null, leadsError = null, lead = null;
    if (view === 'leads' && params.has('product')) {
      try { leads = await apiJson('/api/backoffice/leads?' + leadQuery(params), { signal }); }
      catch (error) { if (signal.aborted || [401, 403].includes(error.status)) throw error; leadsError = error; }
    }
    if (view === 'lead') {
      if (!/^\d{8}$/.test(params.get('cvr') ?? '')) throw new ApiError('This company was not found in the register.', 404);
      lead = (await apiJson(`/api/backoffice/leads/${params.get('cvr')}?product=${product}`, { signal })).lead;
    }
    const saveLead = formSave('/api/backoffice/leads', 'POST', response => response.created ? href('opportunity', { id: response.opportunity.id }) : href('customer', { id: response.customer.id }),
      (data, response) => response.created ? 'Lead saved. It is in Today on ' + dateLabel(data.nextFollowUp) + '.' : 'Already in backoffice. Nothing new was saved.');
    // A website check reads up to three pages through Firecrawl, so it may take longer than a save.
    const checkWebsite = cvr => apiJson(`/api/backoffice/leads/${cvr}/website`, { method: 'POST', body: {}, timeoutMs: 60_000 })
      .catch(error => { if ([401, 403].includes(error.status)) showError(error); throw error; });
    if (run !== generation) return;
    email.textContent = session.email;
    let title, description = '', actions = [], content = [], savedMessage = '';
    switch (view) {
      case 'today':
        title = 'Today'; description = 'Follow-ups due by ' + dateLabel(data.date) + '. New enquiries and open quotes that need your attention.';
        actions = [link('New customer', 'customer-new', {}, 'button primary')]; content = [todayView(data, params)]; break;
      case 'leads':
        title = 'Find leads'; description = 'Companies from the Danish company register that fit a product. Companies that do not want marketing are never shown.';
        content = [leadSearchForm(params, navigate), leadsView(leads, leadsError, product, saveLead, () => load(), downloadButton('/api/backoffice/leads.csv?' + leadQuery(params)), checkWebsite)]; break;
      case 'lead':
        title = lead.name; description = 'From the Danish company register. Nothing is saved until you save it as a lead.';
        content = leadView(lead, product, saveLead, checkWebsite); break;
      case 'customers':
        title = 'Customers'; description = 'Companies, contacts and the work you are discussing.';
        actions = [link('New customer', 'customer-new', {}, 'button primary'), downloadButton('/api/backoffice/customers.csv')]; content = customersView(state, navigate); break;
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
        actions = [link('New opportunity', 'opportunity-new', {}, 'button primary'), downloadButton('/api/backoffice/opportunities.csv')]; content = salesView(state, navigate); break;
      case 'opportunity-new':
      case 'opportunity-edit':
        title = item ? 'Edit opportunity' : 'New opportunity';
        content = [opportunityForm(item, state, selectedCustomer, formSave('/api/backoffice/opportunities' + (item ? '/' + item.id : ''), item ? 'PUT' : 'POST', response => href('opportunity', { id: response.item.id }), 'Opportunity saved.'))]; break;
      case 'opportunity':
        title = item.title; savedMessage = item.stage === 'lead' ? 'Lead saved · Follow up ' + dateLabel(item.nextFollowUp) : 'Opportunity saved · ' + titleCase(item.stage);
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
    const queue = view === 'today' && ['follow-ups', 'enquiries', 'quotes'].includes(params.get('queue')) ? document.getElementById('today-' + params.get('queue')) : null;
    if (queue) { queue.scrollIntoView({ block: 'start', behavior: 'instant' }); queue.focus({ preventScroll: true }); }
    else window.scrollTo({ top: 0, behavior: 'instant' });
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
  // A form inside a card (Save as lead) keeps its clicks, including on its help and error text.
  if (card && !event.target.closest('button,input,select,textarea,label,form')) navigate(card.dataset.href);
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
