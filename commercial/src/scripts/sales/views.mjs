import { el, action, link, href, productName, quoteName, money, dateLabel, titleCase, section, muted, recordCard, formField } from './dom.mjs';
import { statuses } from './forms.mjs';

const customerById = (state, id) => state.customers.find(c => c.id === id);
const customerLink = (state, id) => link(customerById(state, id)?.name ?? 'Customer', 'customer', { id });
const cards = children => el('div', { className: 'record-list' }, ...children);
const noRecords = (state, text) => muted(state.truncated ? 'No matching records in this recent page. Older records remain available at their saved links.' : text);
export function listWarning(state) {
  return state.truncated ? el('aside', { className: 'bounded-notice no-print' }, 'Latest records · Showing up to 100 recent records per list, plus records opened directly. Older records remain available at their saved links or by record ID. Activity may also be limited.') : null;
}
export function recordFinder(kind, view, navigate) {
  const form = el('form', { className: 'record-finder no-print' });
  const field = formField('record-id', 'Open ' + kind + ' by record ID', '', { required: true, pattern: '[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89aAbB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}', placeholder: 'Paste the ID from a saved link' });
  form.append(field.wrapper, el('button', { type: 'submit', className: 'button secondary' }, 'Open record'));
  form.addEventListener('submit', event => { event.preventDefault(); navigate(href(view, { id: field.input.value.trim() })); });
  return form;
}
function opportunityCard(op, state) {
  return recordCard(op.title, 'opportunity', op.id, [
    el('p', {}, customerLink(state, op.customerId)),
    el('p', { className: 'card-meta' }, productName(op.product), ' · ', titleCase(op.stage), op.nextFollowUp ? ' · Follow up ' + dateLabel(op.nextFollowUp) : ' · Set a next step'),
  ]);
}
function quoteCard(quote) {
  return recordCard(quoteName(quote), 'quote', quote.id, [
    el('p', {}, link(quote.snapshot.customer.name, 'customer', { id: quote.customerId })),
    el('p', { className: 'card-meta' }, titleCase(quote.status), ' · ', money(quote.monthlyMinor), '/month · Valid until ', dateLabel(quote.validUntil)),
  ]);
}
export function todayView(work, params) {
  const current = { date: work.date };
  for (const key of ['followUpsAfter', 'enquiriesAfter', 'quotesAfter']) if (params.has(key)) current[key] = params.get(key);
  const queue = (key, id, heading, label, empty, render) => {
    const page = work[key], cursorKey = key + 'After';
    const controls = [];
    if (current[cursorKey]) controls.push(link('First ' + label, 'today', { ...current, [cursorKey]: '', queue: id }, 'button secondary'));
    if (page.next) controls.push(link('More ' + label, 'today', { ...current, [cursorKey]: page.next, queue: id }, 'button secondary'));
    const node = section(heading, page.items.length ? cards(page.items.map(render)) : muted(current[cursorKey] ? 'No more ' + label + ' on this page. Return to the first page to check current work.' : empty),
      controls.length ? el('nav', { className: 'heading-actions', 'aria-label': heading + ' pages' }, ...controls) : null);
    node.id = 'today-' + id; node.tabIndex = -1;
    return node;
  };
  return el('div', { className: 'today-grid' },
    queue('followUps', 'follow-ups', 'Follow up', 'follow-ups', 'No follow-ups due. Add a next follow-up to an opportunity to keep it here.', o => opportunityCard(o, work)),
    queue('enquiries', 'enquiries', 'New enquiries', 'enquiries', 'No new enquiries. Requests from the public price page will appear here.', o => opportunityCard(o, work)),
    queue('quotes', 'quotes', 'Open quotes', 'quotes', 'No open quotes. Saved drafts and sent quotes will appear here.', quoteCard),
  );
}
export function customersView(state, navigate) {
  return [state.customers.length ? cards(state.customers.map(c => recordCard(c.name, 'customer', c.id, [el('p', { className: 'card-meta' }, c.contacts.length ? `${c.contacts.length} contact${c.contacts.length === 1 ? '' : 's'}` : 'Add a contact', ' · Updated ', dateLabel(c.updatedAt))]))) : noRecords(state, 'No customers yet. Save your first company and contact to get started.'), state.truncated && recordFinder('customer', 'customer', navigate)];
}
export function salesView(state, navigate) {
  return [state.opportunities.length ? cards(state.opportunities.map(o => opportunityCard(o, state))) : noRecords(state, 'No opportunities yet. Choose a customer and record the next step.'), state.truncated && recordFinder('opportunity', 'opportunity', navigate)];
}
export function quotesView(state, navigate) {
  return [state.quotes.length ? cards(state.quotes.map(quoteCard)) : noRecords(state, 'No quotes yet. Create a quote to save the customer details and agreed amounts.'), state.truncated && recordFinder('quote', 'quote', navigate)];
}
export function activityView(state, kind, id, relatedIds = []) {
  const events = state.events.filter(e => (e.recordType === kind && e.recordId === id) || relatedIds.includes(e.recordId));
  const body = events.length ? el('ol', { className: 'activity-list' }, events.map(event => el('li', {},
    el('span', {}, `${titleCase(event.recordType)} ${event.operation === 'statusChanged' ? 'status changed' : event.operation}`),
    el('span', { className: 'muted' }, ' · ', dateLabel(event.createdAt), ' · ', event.actor.type === 'public-enquiry' ? 'Public enquiry' : event.actor.email),
  ))) : muted(state.truncated ? 'No activity within the recent workspace records.' : 'No activity yet.');
  return el('section', { id: 'activity', className: 'workspace-section no-print' }, el('h2', {}, 'Recent activity'), body, state.truncated && muted('Older activity may be outside the recent workspace records.'));
}
export function customerView(item, state) {
  const opportunities = state.opportunities.filter(o => o.customerId === item.id);
  const quotes = state.quotes.filter(q => q.customerId === item.id);
  return [
    el('div', { className: 'detail-grid' }, section('Contacts', item.contacts.length ? el('div', { className: 'contact-details' }, item.contacts.map(c => el('div', {}, c.name && el('p', { className: 'contact-name' }, c.name), c.email && el('p', {}, c.email), c.phone && el('p', {}, c.phone)))) : muted('No contacts saved.')),
      section('Private notes', item.notes ? el('p', { className: 'preserve-text' }, item.notes) : muted('No private notes saved.'))),
    section('Opportunities', opportunities.length ? cards(opportunities.map(o => opportunityCard(o, state))) : noRecords(state, 'No opportunities for this customer yet.')),
    section('Quotes', quotes.length ? cards(quotes.map(quoteCard)) : noRecords(state, 'No quotes for this customer yet.')),
    activityView(state, 'customer', item.id, [...opportunities, ...quotes].map(record => record.id)),
  ];
}
export function opportunityView(item, state) {
  const quotes = state.quotes.filter(q => q.opportunityId === item.id);
  return [
    el('dl', { className: 'record-facts' },
      el('div', {}, el('dt', {}, 'Customer'), el('dd', {}, customerLink(state, item.customerId))),
      el('div', {}, el('dt', {}, 'Product'), el('dd', {}, productName(item.product))),
      el('div', {}, el('dt', {}, 'Stage'), el('dd', {}, titleCase(item.stage))),
      el('div', {}, el('dt', {}, 'Next follow-up'), el('dd', {}, dateLabel(item.nextFollowUp))),
    ),
    section('Private notes', item.notes ? el('p', { className: 'preserve-text' }, item.notes) : muted('No private notes saved.')),
    section('Quotes', quotes.length ? cards(quotes.map(quoteCard)) : noRecords(state, 'No quotes linked yet. Save a quote to keep the agreed amounts.')),
    activityView(state, 'opportunity', item.id, quotes.map(q => q.id)),
  ];
}
export function quoteView(item, state, saveStatus) {
  const customer = item.snapshot.customer, pkg = item.snapshot.package;
  const preview = el('article', { id: 'quote-preview', className: 'quote-paper' },
    el('div', { className: 'quote-letterhead' }, el('span', { className: 'quote-sender' }, 'MR Software'), el('span', {}, 'Quote · ', dateLabel(item.createdAt))),
    el('h2', {}, link(quoteName(item), 'quote', { id: item.id })),
    el('div', { className: 'quote-parties' }, el('div', {}, el('p', { className: 'eyebrow' }, 'Prepared for'), el('p', { className: 'quote-customer' }, link(customer.name, 'customer', { id: item.customerId })), customer.contacts.map(contact => el('p', {}, [contact.name, contact.email, contact.phone].filter(Boolean).join(' · ')))),
      el('dl', {}, el('dt', {}, 'Valid until'), el('dd', {}, dateLabel(item.validUntil)), el('dt', {}, 'Reference'), el('dd', { className: 'quote-reference' }, item.id), el('dt', {}, 'Status'), el('dd', {}, titleCase(item.status)))),
    el('div', { className: 'quote-package' }, el('h3', {}, link(productName(pkg.product) + (pkg.name.toLowerCase() === pkg.product ? '' : ' ' + pkg.name), 'package', { id: pkg.id })), el('ul', {}, pkg.includes.map(feature => el('li', {}, feature)))),
    el('dl', { className: 'quote-amounts' }, el('div', {}, el('dt', {}, 'Monthly amount'), el('dd', {}, money(item.monthlyMinor))), el('div', {}, el('dt', {}, 'One-time setup'), el('dd', {}, money(item.setupMinor)))),
    item.notes && el('section', { className: 'quote-terms' }, el('h3', {}, 'Terms'), el('p', { className: 'preserve-text' }, item.notes)),
    el('p', { className: 'quote-footnote' }, 'Amounts in DKK. VAT and payment terms are subject to agreement. This quote keeps the customer details, package and amounts saved on ', dateLabel(item.createdAt), '.'),
  );
  const statusForm = el('form', { className: 'status-form no-print' });
  const error = el('div', { role: 'alert', hidden: true, className: 'form-error', tabindex: '-1' });
  const field = formField('status', 'Quote status', item.status, { type: 'select', choices: statuses.map(status => [status, titleCase(status)]) });
  statusForm.append(error, el('input', { type: 'hidden', name: 'revision', value: item.revision }), field.wrapper, el('button', { type: 'submit', className: 'button secondary' }, 'Update status'), muted('This only records your choice. No email is sent.'));
  statusForm.addEventListener('submit', event => { event.preventDefault(); saveStatus(statusForm, error, () => ({ revision: Number(statusForm.elements.revision.value), status: field.input.value })); });
  const opportunity = state.opportunities.find(o => o.id === item.opportunityId);
  return [el('div', { className: 'quote-tools no-print' }, action('Print / save PDF', () => window.print(), 'button primary'), el('p', { className: 'muted' }, 'Print the saved quote, or choose Save as PDF in the print window.')), opportunity && el('p', { className: 'linked-opportunity no-print' }, 'Opportunity: ', link(opportunity.title, 'opportunity', { id: opportunity.id })), preview, section('Record a status change', statusForm), activityView(state, 'quote', item.id)];
}
export function catalogueView(catalog) {
  return [section('Packages', cards(catalog.packages.map(pkg => recordCard(productName(pkg.product) + (pkg.name.toLowerCase() === pkg.product ? '' : ' ' + pkg.name), 'package', pkg.id, [el('p', { className: 'card-meta' }, pkg.monthlyMinor === null ? 'Agreed price for each customer' : money(pkg.monthlyMinor) + '/month', ' · ', pkg.active ? 'Available' : 'Unavailable')])))),
    section('Public demos', cards(catalog.demos.map(demo => recordCard(productName(demo.id) + ' demo', 'demo', demo.id, [el('p', {}, demo.title), el('p', { className: 'card-meta' }, demo.active ? 'Visible' : 'Hidden')]))))];
}
