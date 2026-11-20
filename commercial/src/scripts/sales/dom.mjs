// All API text enters the page as text, including saved customer/quote content.
export function el(tag, attrs = {}, ...children) {
  const node = document.createElement(tag);
  for (const [name, value] of Object.entries(attrs)) {
    if (value === undefined || value === null || value === false) continue;
    if (name.startsWith('on') && typeof value === 'function') node.addEventListener(name.slice(2).toLowerCase(), value);
    else if (name === 'className') node.className = value;
    else if (name === 'value') node.value = value;
    else node.setAttribute(name, value === true ? '' : String(value));
  }
  node.append(...children.flat(Infinity).filter(child => child !== null && child !== undefined && child !== false).map(child => child instanceof Node ? child : document.createTextNode(String(child))));
  return node;
}
export function href(view, params = {}) {
  const query = new URLSearchParams({ view, ...Object.fromEntries(Object.entries(params ?? {}).filter(([, value]) => value !== undefined && value !== null && value !== '')) });
  return '/backoffice/?' + query;
}
export const link = (text, view, params, className) => el('a', { href: href(view, params), className }, text);
export const action = (text, callback, className = 'button secondary') => el('button', { type: 'button', className, onClick: callback }, text);
export const productName = product => ({ workslip: 'Workslip', tradey: 'Tradey', shippy: 'Shippy' })[product] ?? 'Product';
export const titleCase = text => text ? text[0].toUpperCase() + text.slice(1) : '';
export const quoteName = quote => {
  const pkg = quote.snapshot.package;
  return (pkg.name.toLowerCase() === pkg.product ? pkg.name : productName(pkg.product) + ' ' + pkg.name) + ' quote';
};
export const money = value => 'DKK ' + new Intl.NumberFormat('en-GB', { minimumFractionDigits: value % 100 ? 2 : 0, maximumFractionDigits: 2 }).format(value / 100);
export const dateLabel = value => value ? new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }).format(new Date(value.slice(0, 10) + 'T12:00:00Z')) : 'No date set';
export const dayString = (offset = 0) => { const date = new Date(); date.setDate(date.getDate() + offset); return [date.getFullYear(), String(date.getMonth() + 1).padStart(2, '0'), String(date.getDate()).padStart(2, '0')].join('-'); };
export const section = (title, ...content) => el('section', { className: 'workspace-section' }, el('h2', {}, title), ...content);
export const muted = text => el('p', { className: 'muted' }, text);
export function pageHeading(title, description, actions = []) {
  return el('div', { className: 'page-heading' }, el('div', {}, el('p', { className: 'eyebrow' }, "William's workspace"), el('h1', {}, title), description && muted(description)), el('div', { className: 'heading-actions no-print' }, ...actions));
}
export function result(message) { return el('p', { id: 'workspace-result', className: 'workspace-result no-print', role: 'status' }, message); }
export function recordCard(name, view, id, content = []) {
  return el('article', { className: 'record-card', 'data-href': href(view, { id }) }, el('h3', {}, link(name, view, { id })), ...content);
}
export function formField(name, label, value = '', options = {}) {
  const { type = 'text', help, choices, ...attrs } = options;
  const id = 'field-' + name;
  const input = type === 'textarea' ? el('textarea', { id, name, rows: 4, ...attrs }, value)
    : type === 'select' ? el('select', { id, name, ...attrs }, choices.map(([value, label]) => el('option', { value }, label)))
    : el('input', { id, name, type, value, ...attrs });
  if (type === 'select') input.value = value;
  const wrapper = el('div', { className: 'field' }, el('label', { for: id }, label), input);
  if (help) { input.setAttribute('aria-describedby', id + '-help'); wrapper.append(el('p', { id: id + '-help', className: 'field-help' }, help)); }
  return { wrapper, input };
}
export const addField = (form, ...args) => { const field = formField(...args); form.append(field.wrapper); return field.input; };
export function minorUnits(value, label, optional = false) {
  const trimmed = value.trim();
  if (!trimmed && optional) return undefined;
  if (!/^\d+(?:\.\d{1,2})?$/.test(trimmed)) throw new Error(`${label}: enter an amount with up to two decimal places.`);
  const [whole, fraction = ''] = trimmed.split('.');
  const minor = Number(whole) * 100 + Number(fraction.padEnd(2, '0'));
  if (!Number.isSafeInteger(minor) || minor > 1_000_000_000) throw new Error(`${label}: enter an amount from 0 to 10,000,000 DKK.`);
  return minor;
}
export const amountOptions = { type: 'number', min: '0', max: '10000000', step: '.01', inputmode: 'decimal' };
