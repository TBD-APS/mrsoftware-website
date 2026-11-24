import { el, action, link, href, formField, section, muted, dateLabel } from './dom.mjs';
import { products } from './forms.mjs';
import { employeeBands, leadPresets } from '../../../shared/lead-presets.mjs';
import { municipalities, regions } from '../../../shared/municipalities.mjs';

const bandLabel = new Map(employeeBands.map(band => [band.code, band.label]));
const list = (params, key) => (params.get(key) ?? '').split(',').map(part => part.trim()).filter(Boolean);
const presetCodes = product => leadPresets[product]?.codes ?? [];

// The API query for the search in this page's address. Codes are left out when they equal the
// product preset, so the address stays short.
export function leadQuery(params) {
  const query = new URLSearchParams();
  for (const key of ['product', 'codes', 'regions', 'municipalities', 'sizes']) if (params.get(key)) query.set(key, params.get(key));
  return query.toString();
}

// The next Monday–Friday after today, in local time, as YYYY-MM-DD.
export function nextWorkingDay(from = new Date()) {
  const date = new Date(from.getFullYear(), from.getMonth(), from.getDate() + 1);
  while (date.getDay() === 0 || date.getDay() === 6) date.setDate(date.getDate() + 1);
  return [date.getFullYear(), String(date.getMonth() + 1).padStart(2, '0'), String(date.getDate()).padStart(2, '0')].join('-');
}

function checkbox(name, value, label, checked) {
  const id = `field-${name}-${value}`;
  return el('div', { className: 'check-field' }, el('input', { type: 'checkbox', id, name, value, checked }), el('label', { for: id }, label));
}

export function leadSearchForm(params, onSearch) {
  const form = el('form', { className: 'workspace-form lead-search', role: 'search' });
  const error = el('div', { className: 'form-error', hidden: true, role: 'alert', tabindex: '-1' });
  const chosenProduct = products.includes(params.get('product')) ? params.get('product') : 'workslip';
  const product = formField('product', 'Product', chosenProduct, { type: 'select', choices: products.map(value => [value, leadPresets[value].label]) });
  const givenCodes = list(params, 'codes');
  const codes = formField('codes', 'Industry codes', (givenCodes.length ? givenCodes : presetCodes(chosenProduct)).join(', '), { help: 'Filled in from the product page. Separate codes with commas.', autocomplete: 'off' });
  product.input.addEventListener('change', () => { codes.input.value = presetCodes(product.input.value).join(', '); });
  const chosenRegions = list(params, 'regions');
  const regionSet = el('fieldset', { className: 'check-group' }, el('legend', {}, 'Regions'), regions.map(region => checkbox('regions', region.code, region.name, chosenRegions.includes(region.code))));
  const chosenMunicipalities = list(params, 'municipalities');
  const municipality = formField('municipalities', 'Municipalities (optional)', '', { type: 'select', multiple: true, size: 6, help: 'Add single municipalities outside the chosen regions.', choices: [...municipalities].sort((a, b) => a.name.localeCompare(b.name, 'da')).map(entry => [entry.code, entry.name]) });
  for (const option of municipality.input.options) option.selected = chosenMunicipalities.includes(option.value);
  const chosenSizes = list(params, 'sizes');
  const sizeSet = el('fieldset', { className: 'check-group' }, el('legend', {}, 'Company size (employees)'), muted('Leave all empty to include every size.'), employeeBands.map(band => checkbox('sizes', band.code, band.label, chosenSizes.includes(band.code))));
  const submit = el('button', { type: 'submit', className: 'button primary' }, 'Search');
  form.append(error, product.wrapper, codes.wrapper, regionSet, municipality.wrapper, sizeSet, el('div', { className: 'form-actions' }, submit));
  form.addEventListener('submit', event => {
    event.preventDefault();
    error.hidden = true; error.replaceChildren();
    const checked = name => [...form.querySelectorAll(`input[name="${name}"]:checked`)].map(input => input.value);
    const chosen = { product: product.input.value, regions: checked('regions').join(','), municipalities: [...municipality.input.selectedOptions].map(option => option.value).join(','), sizes: checked('sizes').join(',') };
    const typed = codes.input.value.split(/[\s,;]+/).filter(Boolean);
    if (!chosen.regions && !chosen.municipalities) {
      error.append(el('p', {}, 'Choose at least one region or municipality.')); error.hidden = false; error.focus();
      return;
    }
    if (typed.join(',') !== presetCodes(chosen.product).join(',')) chosen.codes = typed.join(',');
    onSearch(href('leads', chosen));
  });
  return form;
}

function websiteUrl(value) {
  if (typeof value !== 'string' || !/^(https?:\/\/)?[a-z0-9æøå.-]+\.[a-z]{2,}(\/\S*)?$/i.test(value)) return null;
  return /^https?:\/\//i.test(value) ? value : 'https://' + value;
}

function saveForm(lead, product, onSave) {
  const form = el('form', { className: 'lead-save' });
  const error = el('div', { className: 'form-error', hidden: true, role: 'alert', tabindex: '-1' });
  const date = formField('nextFollowUp', 'Next follow-up', nextWorkingDay(), { type: 'date', required: true, help: 'The lead appears in Today on this date.' });
  const cancel = action('Cancel', () => form.remove());
  form.append(error, date.wrapper, el('div', { className: 'form-actions' }, el('button', { type: 'submit', className: 'button primary' }, 'Save lead'), cancel));
  form.addEventListener('submit', event => {
    event.preventDefault();
    onSave(form, error, () => {
      if (!date.input.value) throw new Error('Choose the date for the next follow-up.');
      return { cvr: lead.cvr, product, nextFollowUp: date.input.value };
    });
  });
  return form;
}

// Buttons and links for one company. "Save as lead" opens the follow-up form below them; only
// one such form is open on the page at a time.
function leadActions(lead, product, onSave) {
  const holder = el('div', { className: 'lead-actions' });
  const open = el('button', { type: 'button', className: 'button primary', 'aria-label': `Save ${lead.name} as lead`, onClick: () => {
    document.querySelectorAll('form.lead-save').forEach(form => form.remove());
    const form = saveForm(lead, product, onSave);
    holder.after(form);
    form.querySelector('input')?.focus();
  } }, 'Save as lead');
  const website = websiteUrl(lead.website);
  // Native append would print a missing website as the text "null"; keep only real nodes.
  holder.append(...[
    lead.customerId ? link('Already in backoffice', 'customer', { id: lead.customerId }, 'button secondary') : open,
    el('a', { className: 'button secondary', href: lead.linkedinUrl, target: '_blank', rel: 'noopener noreferrer', 'aria-label': `Find ${lead.name} on LinkedIn` }, 'Find on LinkedIn'),
    website && el('a', { className: 'button secondary', href: website, target: '_blank', rel: 'noopener noreferrer', 'aria-label': `Open the website of ${lead.name}` }, 'Website'),
  ].filter(Boolean));
  return holder;
}

const facts = lead => [`CVR ${lead.cvr}`, lead.industryText && `${lead.industryText} (${lead.industryCode})`, bandLabel.has(lead.employees) && `${bandLabel.get(lead.employees)} employees`, lead.city].filter(Boolean).join(' · ');

export function leadsView(search, error, product, onSave, retry, download = null) {
  if (error) return section('Results', el('div', { className: 'load-error', role: 'alert' }, el('p', {}, error.message), action('Try again', retry)));
  if (!search) return section('Results', muted('Choose a product and at least one region, then search.'));
  const { results, total } = search;
  if (!results.length) return section('Results', muted('No companies match. Try more regions or sizes.'));
  const summary = `${results.length} ${results.length === 1 ? 'company' : 'companies'}, best first.` + (Number.isFinite(total) && total > results.length ? ` About ${total} match in the register; choose sizes to see others.` : '');
  return section('Results', el('div', { className: 'results-head' }, muted(summary), download), el('div', { className: 'record-list' }, results.map(lead => el('article', { className: 'record-card lead-card', 'data-href': href('lead', { cvr: lead.cvr, product }) },
    el('h3', {}, link(lead.name, 'lead', { cvr: lead.cvr, product })),
    el('p', { className: 'card-meta' }, facts(lead)),
    el('p', { className: 'lead-score' }, el('strong', {}, `Score ${lead.score}`), ' · ', lead.reason),
    leadActions(lead, product, onSave)))));
}

export function leadView(lead, product, onSave) {
  const address = [lead.address, [lead.postcode, lead.city].filter(Boolean).join(' ')].filter(Boolean).join(', ');
  const rows = [['CVR number', lead.cvr], ['Industry', lead.industryText && `${lead.industryText} (${lead.industryCode})`], ['Employees', bandLabel.get(lead.employees)], ['Address', address], ['Founded', lead.founded && dateLabel(lead.founded)], ['Phone', lead.phone], ['Email', lead.email]].filter(([, value]) => value);
  return [
    section('Why it fits', el('p', { className: 'lead-score' }, el('strong', {}, `Score ${lead.score}`), ' · ', lead.reason), leadActions(lead, product, onSave)),
    section('From the company register', el('dl', { className: 'record-facts' }, rows.map(([term, value]) => el('div', {}, el('dt', {}, term), el('dd', {}, value))))),
  ];
}
