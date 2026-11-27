import { apiJson } from '../api.mjs';
import { action, addField, dateLabel, el, muted, pageHeading, section } from './dom.mjs';

const root = document.querySelector('#main');
const path = '/api/backoffice/newsletter';
const statusLabels = { draft: 'Draft', approved: 'Approved', dispatching: 'Submitting', accepted: 'Accepted by provider', uncertain: 'Needs reconciliation' };
let state, selected = '', busy = false;
const notice = el('p', { className: 'workspace-result', role: 'status', tabindex: '-1' });
const failure = el('p', { className: 'form-error', role: 'alert', hidden: true });
const container = el('div');

function disabled(value) {
  root.setAttribute('aria-busy', String(value));
  for (const button of container.querySelectorAll('button, input, textarea, select')) button.disabled = value || button.dataset.locked === 'true';
}
async function refresh() { state = await apiJson(path); }
async function run(callback, success) {
  if (busy) return;
  busy = true;
  failure.hidden = true;
  notice.textContent = '';
  disabled(true);
  try {
    const value = await callback();
    await refresh();
    draw();
    notice.textContent = typeof success === 'function' ? success(value) : success;
    notice.focus();
  } catch (error) {
    failure.textContent = error.message;
    failure.hidden = false;
  } finally { busy = false; disabled(false); }
}

function campaignList() {
  return section('Drafts and activity', state.campaigns.length ? el('div', { className: 'record-grid' }, state.campaigns.map(item => el('article', { className: 'record-card' },
    el('h3', {}, item.subject), muted(statusLabels[item.status] + ' · ' + dateLabel(item.updatedAt)),
    action('Open ' + item.subject, () => { selected = item.id; failure.hidden = true; notice.textContent = ''; draw(); document.querySelector('#newsletter-editor-title')?.focus(); }, 'button secondary'),
  ))) : muted('No newsletters yet.'));
}
function editor() {
  const item = state.campaigns.find(record => record.id === selected);
  const form = el('form', { className: 'workspace-form' });
  const title = el('h2', { id: 'newsletter-editor-title', tabindex: '-1' }, item ? 'Edit newsletter' : 'New draft');
  const out = el('section', { className: 'workspace-section' }, title);
  const canEdit = !item || ['draft', 'approved'].includes(item.status);
  const preview = el('div', {});
  const detail = (subject, body) => preview.replaceChildren(el('h3', {}, subject || 'No subject yet'), el('p', { style: 'white-space: pre-wrap; overflow-wrap: anywhere' }, body || 'Your email text will appear here.'), muted('MR Software · Recipients get an unsubscribe link.'));
  if (canEdit) {
    const subject = addField(form, 'newsletter-subject', 'Subject', item?.subject ?? '', { maxlength: '140', required: true });
    const language = addField(form, 'newsletter-language', 'Language', item?.language ?? 'da', { type: 'select', choices: [['da', 'Danish'], ['en', 'English']] });
    const body = addField(form, 'newsletter-body', 'Email body', item?.body ?? '', { type: 'textarea', rows: '8', maxlength: '9000', required: true });
    form.append(el('button', { type: 'submit', className: 'button' }, 'Save draft'));
    const updatePreview = () => detail(subject.value, body.value);
    form.addEventListener('input', updatePreview);
    updatePreview();
    form.addEventListener('submit', event => {
      event.preventDefault();
      run(async () => {
        const result = await apiJson(path + '/campaigns' + (item ? '/' + item.id : ''), {
          method: item ? 'PUT' : 'POST', body: { subject: subject.value, body: body.value, language: language.value, ...(item ? { revision: item.revision } : {}) },
        });
        selected = result.item.id;
      }, 'Draft saved. Nothing was sent.');
    });
    if (item) form.addEventListener('input', () => {
      for (const button of out.querySelectorAll('[data-requires-saved]')) { button.dataset.locked = 'true'; button.disabled = true; }
    });
    out.append(form);
  } else detail(item.subject, item.body);
  out.append(el('h3', {}, 'Preview'), preview);

  if (item) {
    const controls = el('div', { className: 'heading-actions' },
      el('a', { className: 'button secondary', href: path + '/campaigns/' + item.id + '/export', download: true }, 'Download saved text'));
    if (item.status === 'draft') controls.append(el('button', { className: 'button secondary', type: 'button', 'data-requires-saved': true, onClick: () =>
      run(() => apiJson(path + '/campaigns/' + item.id + '/approve', { method: 'POST', body: { revision: item.revision } }), 'Approved. Nothing was sent.'), }, 'Approve saved draft'));
    if (item.status === 'approved') {
      out.append(muted('Approved for ' + item.approval.count + ' active subscribers. Editing the draft clears approval.'));
      if (state.sendingEnabled && item.approval.count > 0) {
        const check = el('input', { type: 'checkbox', required: true });
        const send = el('form', { className: 'workspace-form' }, el('label', {}, check, ' I confirm delivery to the approved audience.'), el('button', { type: 'submit', className: 'button', 'data-requires-saved': true }, 'Send newsletter'));
        send.addEventListener('submit', event => {
          event.preventDefault();
          if (!check.checked) return;
          run(() => apiJson(path + '/campaigns/' + item.id + '/send', { method: 'POST', body: { revision: item.revision, confirm: true } }), value => value.item.status === 'accepted' ? 'Provider accepted the newsletter. Recipient delivery is not confirmed.' : 'Delivery is uncertain. Do not resend; check with the provider.');
        });
        out.append(send);
      }
    }
    if (item.status === 'dispatching' || item.status === 'uncertain') out.append(muted('Do not resend. Reconcile this attempt with the provider.'));
    if (item.status === 'accepted') out.append(muted('Provider accepted ' + item.delivery.count + ' messages. Delivery is not confirmed.'));
    out.append(controls);
  }
  return out;
}
function subscribers() {
  const form = el('form', { className: 'workspace-form' });
  const email = addField(form, 'subscriber-email', 'Subscriber email', '', { type: 'email', maxlength: '254', required: true });
  const consentAt = addField(form, 'subscriber-consent-date', 'Consent date', '', { type: 'date', required: true });
  const reference = addField(form, 'subscriber-reference', 'Consent reference', '', { maxlength: '240', required: true, help: 'Record where explicit newsletter permission is documented. Do not paste private correspondence.' });
  const confirmed = el('input', { type: 'checkbox', required: true });
  form.append(el('label', {}, confirmed, ' I verified explicit permission to receive MR Software email newsletters.'), el('button', { type: 'submit', className: 'button' }, 'Record subscriber'));
  form.addEventListener('submit', event => {
    event.preventDefault();
    run(() => apiJson(path + '/subscribers', { method: 'POST', body: { email: email.value, consentAt: consentAt.value, consentReference: reference.value, confirmed: confirmed.checked } }), 'Subscriber recorded.');
  });
  const listing = el('ul', {}, state.subscribers.map(item => el('li', {},
    el('strong', {}, item.email), ' · ' + (item.unsubscribedAt ? 'Unsubscribed' : 'Active'), ' · consent ' + dateLabel(item.consentAt),
    el('p', { className: 'muted' }, 'Reference: ' + item.consentReference),
    item.unsubscribedAt ? null : action('Unsubscribe ' + item.email, () => run(() => apiJson(path + '/subscribers/' + item.id + '/unsubscribe', { method: 'POST', body: {} }), 'Subscriber suppressed.')),
  )));
  return section('Subscribers', muted(state.activeSubscribers + ' active subscribers. Only documented opt-ins, never sales leads.'), form, state.subscribers.length ? listing : muted('No subscribers yet.'));
}
function draw() {
  container.replaceChildren(
    pageHeading('Newsletter', 'Write, preview and approve MR Software newsletters.', [action('New draft', () => { selected = ''; failure.hidden = true; notice.textContent = ''; draw(); document.querySelector('#newsletter-editor-title')?.focus(); })]),
    el('p', { className: 'form-intro' }, state.sendingEnabled ? 'Sending is connected for up to ' + state.maxRecipients + ' subscribers per approved newsletter.' : 'Sending is not connected. Drafts, previews, approvals and downloads are available.'),
    campaignList(), editor(), subscribers(),
  );
}

try {
  const [session] = await Promise.all([apiJson('/api/backoffice/session'), refresh()]);
  document.querySelector('#session-email').textContent = session.email;
  root.replaceChildren(notice, failure, container);
  draw();
} catch (error) {
  root.replaceChildren(pageHeading('Newsletter'), el('p', { role: 'alert' }, error.message));
} finally { disabled(false); }
