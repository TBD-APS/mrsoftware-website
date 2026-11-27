import { apiJson } from '../api.mjs';
import { addField, el, muted, pageHeading, section } from './dom.mjs';

const route = '/backoffice/youtube/';
const endpoint = '/api/backoffice/youtube';
const studioUrl = 'https://studio.youtube.com/';
const products = ['MR Software', 'Workslip', 'Tradey', 'Shippy', 'Saassy'];
const main = document.querySelector('main');
const sessionEmail = document.querySelector('#session-email');
const toDraft = id => route + '?id=' + encodeURIComponent(id);
const buttonLink = (name, href, kind = 'secondary') => el('a', { href, className: 'button ' + kind }, name);
const externalLink = (name, href) => el('a', { href, target: '_blank', rel: 'noopener noreferrer', className: 'button secondary' }, name);
const followUp = 'Upload from the correct channel in YouTube Studio. This workspace does not upload videos or change their visibility.';

function timeLabel(value) {
  return new Intl.DateTimeFormat('en-GB', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'Europe/Copenhagen' }).format(new Date(value)) + ' Copenhagen time';
}

function showError(box, error) {
  box.hidden = false;
  box.replaceChildren(el('p', {}, error.status === 409 ? 'This draft changed elsewhere. Copy any unsaved edits, then reload before trying again.' : error.message));
  box.focus();
}

function makeForm(save) {
  const error = el('div', { className: 'form-error', role: 'alert', tabindex: '-1', hidden: true });
  const form = el('form', { className: 'workspace-form' });
  form.addEventListener('submit', async event => {
    event.preventDefault();
    error.hidden = true;
    const top = main.querySelector('#workspace-result');
    if (top) top.textContent = '';
    const controls = [...main.querySelectorAll('button,input,textarea,select')];
    const disabled = controls.map(node => node.disabled);
    controls.forEach(node => { node.disabled = true; });
    form.setAttribute('aria-busy', 'true');
    try { await save(); } catch (failure) { showError(error, failure); }
    finally {
      form.removeAttribute('aria-busy');
      controls.forEach((node, index) => { node.disabled = disabled[index]; });
    }
  });
  return { form, error };
}

function saveFile(item) {
  const text = `Title\n${item.title}\n\nDescription\n${item.description}\n\nTags\n${item.tags}\n`;
  const objectUrl = URL.createObjectURL(new Blob([text], { type: 'text/plain;charset=utf-8' }));
  const link = el('a', { href: objectUrl, download: 'youtube-video-metadata.txt', hidden: true });
  document.body.append(link); link.click(); link.remove();
  setTimeout(() => URL.revokeObjectURL(objectUrl), 10_000);
}

function renderList({ items, truncated }) {
  const drafts = items.length ? el('div', { className: 'record-list' }, items.map(item => el('article', { className: 'record-card' },
    el('h3', {}, el('a', { href: toDraft(item.id) }, item.title)),
    muted(item.product + ' · ' + (item.verification ? 'Link checked on YouTube' : 'No link checked')),
    muted('Updated ' + timeLabel(item.updatedAt))))) : muted('No drafts yet. Create one to prepare your first video.');
  main.replaceChildren(
    pageHeading('YouTube', 'Prepare video metadata, use Studio to upload, then check the video link.', [buttonLink('New YouTube draft', route + '?new=1', 'primary')]),
    muted(followUp), section('Video drafts', truncated && muted('Showing the 100 most recently updated drafts. Older drafts can still be opened by their saved links.'), drafts),
  );
}

function renderDraft(initial) {
  let item = initial;
  const success = el('p', { id: 'workspace-result', className: 'workspace-result', role: 'status' });
  const previewTitle = el('h3', {}, initial?.title || 'Untitled video');
  const previewDescription = el('p', { style: 'white-space:pre-wrap;overflow-wrap:anywhere' }, initial?.description || 'No description yet.');
  const previewTags = muted(initial?.tags ? 'Tags: ' + initial.tags : 'No tags entered.');
  const { form, error } = makeForm(async () => {
    const creating = !item;
    const body = { title: title.value, description: description.value, tags: tags.value, product: product.value, ...(!creating && { revision: item.revision }) };
    const response = await apiJson(creating ? endpoint : endpoint + '/' + item.id, { method: creating ? 'POST' : 'PUT', body });
    item = response.item;
    if (creating) history.replaceState(null, '', toDraft(item.id));
    updateHandoff();
    success.textContent = 'Draft saved. Nothing was sent to YouTube.';
  });
  const title = addField(form, 'title', 'Video title', initial?.title, { required: true, maxlength: 100 });
  const description = addField(form, 'description', 'Video description', initial?.description, { type: 'textarea', maxlength: 5000, rows: 6 });
  const tags = addField(form, 'tags', 'Tags', initial?.tags, { maxlength: 500, help: 'Optional. Separate tags with commas.' });
  const product = addField(form, 'product', 'Product', initial?.product ?? products[0], { type: 'select', choices: products.map(name => [name, name]) });
  const updatePreview = () => {
    previewTitle.textContent = title.value || 'Untitled video';
    previewDescription.textContent = description.value || 'No description yet.';
    previewTags.textContent = tags.value ? 'Tags: ' + tags.value : 'No tags entered.';
  };
  form.addEventListener('input', updatePreview);
  form.append(error, el('button', { type: 'submit', className: 'button primary' }, 'Save YouTube draft'));

  const handoff = el('div');
  const receipt = el('div', { 'aria-live': 'polite' });
  const paintReceipt = () => {
    const check = item?.verification;
    receipt.replaceChildren(...(check ? [
      el('article', { className: 'record-card' }, el('h3', {}, 'Link checked on YouTube'), el('p', {}, check.title + ' · ' + check.channel),
        muted('Checked ' + timeLabel(check.checkedAt)), externalLink('Open checked video', check.url),
        muted('This is the last successful link check. It does not establish the visibility setting, channel ownership, or playback for every viewer.')),
    ] : [muted('No successful link check yet.')]));
  };
  function updateHandoff() {
    if (!item) {
      handoff.replaceChildren(muted('Save the draft to download its metadata and attach a checked YouTube link.'));
      return;
    }
    const { form: checkForm, error: checkError } = makeForm(async () => {
      const result = await apiJson(endpoint + '/' + item.id + '/check', { method: 'POST', body: { revision: item.revision, videoUrl: videoUrl.value } });
      item = result.item;
      videoUrl.value = item.verification.url;
      paintReceipt();
      success.textContent = 'Link checked. Nothing was uploaded or published by this workspace.';
    });
    const videoUrl = addField(checkForm, 'video-url', 'YouTube video link', item.verification?.url, {
      type: 'url', required: true, maxlength: 500, help: 'Paste a watch, Shorts, live or youtu.be link after uploading. Checking sends the video link to YouTube.',
    });
    checkForm.append(checkError, el('button', { type: 'submit', className: 'button secondary' }, 'Check YouTube link'));
    const download = el('button', { type: 'button', className: 'button secondary', onClick: () => saveFile(item) }, 'Download saved metadata');
    handoff.replaceChildren(
      el('p', { className: 'form-actions' }, download, externalLink('Open YouTube Studio', studioUrl)),
      checkForm, receipt,
    );
    paintReceipt();
  }

  updateHandoff();
  main.replaceChildren(
    pageHeading(initial ? 'Edit YouTube draft' : 'New YouTube draft', 'Private draft. Use your approved copy and video file in YouTube Studio.', [buttonLink('All YouTube drafts', route)]),
    success, section('Video details', form), section('Metadata preview', previewTitle, previewDescription, previewTags),
    section('Studio handoff', muted(followUp), handoff),
  );
}

async function load() {
  try {
    const query = new URLSearchParams(location.search);
    const id = query.get('id');
    const [session, data] = await Promise.all([apiJson('/api/backoffice/session'),
      id ? apiJson(endpoint + '/' + encodeURIComponent(id)) : query.has('new') ? null : apiJson(endpoint)]);
    sessionEmail.textContent = session.email;
    if (data && !id) renderList(data);
    else renderDraft(data?.item);
  } catch (error) {
    main.replaceChildren(pageHeading('YouTube'), el('div', { className: 'load-error', role: 'alert' }, el('p', {}, error.message), buttonLink('Back to YouTube drafts', route)));
  } finally {
    main.setAttribute('data-ready', 'true');
    main.removeAttribute('aria-busy');
  }
}

load();
