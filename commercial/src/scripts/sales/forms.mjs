import { el, action, link, formField, addField, minorUnits, amountOptions, productName, dayString, money } from './dom.mjs';

export const products = ['workslip', 'tradey', 'shippy'];
export const stages = ['lead', 'enquiry', 'contacted', 'demo', 'quote', 'won', 'lost'];
export const statuses = ['draft', 'sent', 'accepted', 'declined', 'expired'];
const choices = values => values.map(value => [value, value[0].toUpperCase() + value.slice(1)]);
function formShell(item, submitName, cancelView, cancelParams) {
  const form = el('form', { className: 'workspace-form' });
  if (item?.revision) form.append(el('input', { type: 'hidden', name: 'revision', value: item.revision }));
  const error = el('div', { className: 'form-error', hidden: true, role: 'alert', tabindex: '-1' });
  form.append(error);
  const finish = () => form.append(el('div', { className: 'form-actions' }, el('button', { type: 'submit', className: 'button primary' }, submitName), link('Cancel', cancelView, cancelParams, 'button secondary')));
  return { form, error, finish };
}
function wire(shell, onSave, read) {
  shell.form.addEventListener('submit', event => { event.preventDefault(); onSave(shell.form, shell.error, read); });
  shell.finish();
  return shell.form;
}
export function customerForm(item, onSave) {
  const shell = formShell(item, 'Save customer', item ? 'customer' : 'customers', item && { id: item.id });
  const form = shell.form;
  const name = addField(form, 'company', 'Company name', item?.name ?? '', { required: true, maxlength: 200, autocomplete: 'organization' });
  if (item?.cvr) form.append(el('p', { className: 'field-help' }, 'CVR number ' + item.cvr + ' (from the company register, cannot be changed)'));
  const contactArea = el('div', { className: 'contact-list' });
  const contacts = [];
  function addContact(contact = {}) {
    const index = contacts.length, number = index + 1;
    const group = el('fieldset', { className: 'contact-form' }, el('legend', {}, 'Contact ' + number));
    const prefix = index ? `Contact ${number}` : 'Contact';
    const fields = [
      formField('contact-' + number + '-name', prefix + ' name', contact.name ?? '', { maxlength: 100, autocomplete: 'name' }),
      formField('contact-' + number + '-email', prefix + ' email', contact.email ?? '', { type: 'email', maxlength: 254, autocomplete: 'email' }),
      formField('contact-' + number + '-phone', prefix + ' phone', contact.phone ?? '', { type: 'tel', maxlength: 50, autocomplete: 'tel' }),
    ];
    const entry = { group, fields };
    group.append(...fields.map(field => field.wrapper));
    group.append(action('Remove contact ' + number, () => { group.remove(); entry.removed = true; add.disabled = contacts.filter(c => !c.removed).length >= 20; }));
    contacts.push(entry); contactArea.append(group);
    add.disabled = contacts.filter(c => !c.removed).length >= 20;
  }
  const add = action('Add contact', () => addContact());
  form.append(contactArea, add);
  for (const contact of item?.contacts?.length ? item.contacts : [{}]) addContact(contact);
  const notes = addField(form, 'notes', 'Private notes', item?.notes ?? '', { type: 'textarea', maxlength: 4000, help: 'For your team. These notes never appear on a printed quote.' });
  return wire(shell, onSave, () => ({ name: name.value, contacts: contacts.filter(c => !c.removed).map(c => ({ name: c.fields[0].input.value, email: c.fields[1].input.value, phone: c.fields[2].input.value })).filter(c => c.name.trim() || c.email.trim() || c.phone.trim()), notes: notes.value, ...(item?.cvr ? { cvr: item.cvr } : {}), ...(item ? { revision: Number(form.elements.revision.value) } : {}) }));
}
export function opportunityForm(item, state, selectedCustomer, onSave) {
  const shell = formShell(item, 'Save opportunity', item ? 'opportunity' : selectedCustomer ? 'customer' : 'sales', item ? { id: item.id } : selectedCustomer ? { id: selectedCustomer } : undefined);
  const form = shell.form;
  const customer = addField(form, 'customer', 'Customer', item?.customerId ?? selectedCustomer ?? '', { type: 'select', required: true, choices: [['', 'Choose a customer'], ...state.customers.map(c => [c.id, c.name])] });
  const title = addField(form, 'title', 'Opportunity title', item?.title ?? '', { required: true, maxlength: 200 });
  const product = addField(form, 'product', 'Product', item?.product ?? 'workslip', { type: 'select', choices: products.map(p => [p, productName(p)]) });
  const stage = addField(form, 'stage', 'Stage', item?.stage ?? 'enquiry', { type: 'select', choices: choices(stages) });
  const followUp = addField(form, 'followup', 'Next follow-up', item?.nextFollowUp ?? '', { type: 'date', min: '1000-01-01', max: '9999-12-31' });
  const notes = addField(form, 'notes', 'Private notes', item?.notes ?? '', { type: 'textarea', maxlength: 4000 });
  return wire(shell, onSave, () => ({ customerId: customer.value, title: title.value, product: product.value, stage: stage.value, nextFollowUp: followUp.value || null, notes: notes.value, ...(item ? { revision: Number(form.elements.revision.value) } : {}) }));
}
export function quoteForm(state, selectedCustomer, selectedOpportunity, selectedProduct, onSave) {
  const shell = formShell(null, 'Save quote', selectedOpportunity ? 'opportunity' : selectedCustomer ? 'customer' : 'quotes', selectedOpportunity ? { id: selectedOpportunity } : selectedCustomer ? { id: selectedCustomer } : undefined);
  const form = shell.form;
  form.append(el('p', { className: 'form-intro' }, 'Save a fixed quote before printing. Customer details, package and amounts are kept as they are when you save. No email is sent.'));
  const initialOpportunity = state.opportunities.find(o => o.id === selectedOpportunity);
  const customer = addField(form, 'customer', 'Customer', selectedCustomer ?? initialOpportunity?.customerId ?? '', { type: 'select', required: true, choices: [['', 'Choose a customer'], ...state.customers.map(c => [c.id, c.name])] });
  const opportunity = addField(form, 'opportunity', 'Opportunity', '', { type: 'select', choices: [] });
  const product = addField(form, 'product', 'Product', initialOpportunity?.product ?? selectedProduct ?? 'workslip', { type: 'select', choices: products.map(p => [p, productName(p)]) });
  const pkg = addField(form, 'package', 'Package', '', { type: 'select', required: true, choices: [] });
  const priceField = formField('monthly', 'Agreed monthly price (DKK)', '', { ...amountOptions });
  const monthly = priceField.input;
  const priceHelp = el('p', { className: 'field-help', id: 'monthly-help' });
  monthly.setAttribute('aria-describedby', 'monthly-help');
  priceField.wrapper.append(priceHelp); form.append(priceField.wrapper);
  const setup = addField(form, 'setup', 'Setup amount (DKK)', '0', { ...amountOptions, required: true, help: 'One-time amount. Enter 0 if there is no setup charge.' });
  const validUntil = addField(form, 'validity', 'Valid until', dayString(30), { type: 'date', required: true, min: '1000-01-01', max: '9999-12-31' });
  const notes = addField(form, 'terms', 'Quote terms', '', { type: 'textarea', maxlength: 4000, help: 'Customer-facing terms or notes. These appear on the printed quote.' });
  function syncPrice() {
    const chosen = state.catalog.packages.find(p => p.id === pkg.value);
    const custom = chosen?.monthlyMinor === null;
    monthly.required = custom;
    monthly.value = '';
    monthly.placeholder = custom ? 'Enter agreed amount' : chosen ? (chosen.monthlyMinor / 100).toFixed(2) : '';
    priceHelp.textContent = custom ? 'Enter the monthly amount agreed with the customer.' : chosen ? `Current catalogue: ${money(chosen.monthlyMinor)} per month. Leave blank to use the catalogue price at the moment you save, or enter an agreed override.` : 'No active package is available for this product.';
  }
  function syncPackages() {
    pkg.replaceChildren(...state.catalog.packages.filter(p => p.active && p.product === product.value).map(p => el('option', { value: p.id }, p.name)));
    syncPrice();
  }
  function syncOpportunities(preselect = '') {
    opportunity.replaceChildren(el('option', { value: '' }, 'No linked opportunity'), ...state.opportunities.filter(o => o.customerId === customer.value).map(o => el('option', { value: o.id }, o.title)));
    opportunity.value = preselect;
  }
  customer.addEventListener('change', () => syncOpportunities());
  opportunity.addEventListener('change', () => { const chosen = state.opportunities.find(o => o.id === opportunity.value); if (chosen) { product.value = chosen.product; syncPackages(); } });
  product.addEventListener('change', syncPackages); pkg.addEventListener('change', syncPrice);
  syncOpportunities(selectedOpportunity); syncPackages();
  return wire(shell, onSave, () => {
    const agreed = minorUnits(monthly.value, 'Monthly price', !monthly.required);
    return { customerId: customer.value, opportunityId: opportunity.value || null, packageId: pkg.value, ...(agreed === undefined ? {} : { monthlyMinor: agreed }), setupMinor: minorUnits(setup.value, 'Setup amount'), validUntil: validUntil.value, notes: notes.value };
  });
}
export function catalogForm(item, catalog, kind, onSave) {
  const isPackage = kind === 'package';
  const shell = formShell(catalog, isPackage ? 'Save package' : 'Save demo', 'catalogue');
  const form = shell.form;
  const name = addField(form, 'name', isPackage ? 'Package name' : 'Demo title', isPackage ? item.name : item.title, { required: true, maxlength: 200 });
  const monthly = isPackage ? addField(form, 'monthly', 'Monthly price (DKK)', item.monthlyMinor === null ? '' : String(item.monthlyMinor / 100), { ...amountOptions, help: 'Leave blank for a price agreed with each customer. Existing quotes keep their saved amounts.' }) : null;
  const content = addField(form, 'content', isPackage ? 'Included features' : 'Demo summary', isPackage ? item.includes.join('\n') : item.summary, { type: 'textarea', required: !isPackage, maxlength: isPackage ? 6030 : 1000, help: isPackage ? 'One feature per line, up to 30 lines of 200 characters.' : undefined });
  const active = addField(form, 'active', isPackage ? 'Package visibility' : 'Demo visibility', item.active ? 'on' : 'off', { type: 'select', choices: [['on', isPackage ? 'Available' : 'Visible'], ['off', isPackage ? 'Unavailable' : 'Hidden']] });
  return wire(shell, onSave, () => {
    const updated = isPackage ? { id: item.id, product: item.product, name: name.value, monthlyMinor: minorUnits(monthly.value, 'Monthly price', true) ?? null, includes: content.value.split(/\r?\n/).map(line => line.trim()).filter(Boolean), active: active.value === 'on' } : { id: item.id, title: name.value, summary: content.value, active: active.value === 'on' };
    if (isPackage && (updated.includes.length > 30 || updated.includes.some(feature => feature.length > 200))) throw new Error('Use up to 30 included features, with at most 200 characters on each line.');
    return { revision: Number(form.elements.revision.value), packages: catalog.packages.map(p => isPackage && p.id === item.id ? updated : p), demos: catalog.demos.map(d => !isPackage && d.id === item.id ? updated : d) };
  });
}
