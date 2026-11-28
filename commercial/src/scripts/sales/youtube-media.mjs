import { apiJson } from '../api.mjs';
import { action, addField, el, muted, section } from './dom.mjs';

const names = { image: 'Thumbnail', video: 'Video clip' };
const states = { submitting: 'Submitting', pending: 'Generating', completed: 'Ready', failed: 'Failed', uncertain: 'Needs review' };

export function mediaPanel(endpoint, revision) {
  const status = el('p', { role: 'status', 'aria-label': 'Media request status' });
  const list = el('div', { className: 'record-list' });
  const form = el('form', { className: 'workspace-form', hidden: true });
  const kind = addField(form, 'media-kind', 'Media type', 'image', { type: 'select', choices: Object.entries(names) });
  const prompt = addField(form, 'media-prompt', 'Media prompt', '', { type: 'textarea', required: true, maxlength: 1500, rows: 4 });
  const go = el('button', { type: 'submit', className: 'button primary' }, 'Approve and generate');
  form.append(muted('One 16:9 image or a four-second clip. Approving sends only the prompt to ElevenLabs and uses workspace credits. Nothing is published to YouTube.'), go);
  const jobs = new Map();
  let requestId;
  let previous;
  let available = false;
  let busy = false;
  const show = () => {
    list.replaceChildren(...[...jobs.values()].map(job => {
      const statusCheck = action('Check status', async () => {
        statusCheck.disabled = true;
        try {
          jobs.set(job.id, (await apiJson(endpoint + '/' + job.id)).job);
          show();
        } catch (error) { status.textContent = error.message; }
        finally { statusCheck.disabled = false; }
      });
      return el('article', { className: 'record-card' },
        el('h3', {}, names[job.kind] + ' · ' + states[job.state]),
        muted(job.prompt),
        job.state === 'pending' || job.state === 'submitting' ? statusCheck : null,
        job.state === 'completed' ? el('a', { href: endpoint + '/' + job.id + '/file', target: '_blank', rel: 'noopener noreferrer', className: 'button secondary' }, 'Download generated file') : null,
        ['uncertain', 'submitting'].includes(job.state) ? muted('If this does not progress, ask an operator to verify the request before trying again.') : null);
    }));
  };
  form.addEventListener('submit', async event => {
    event.preventDefault();
    if (busy || !available) return;
    const values = { kind: kind.value, prompt: prompt.value.trim(), revision: revision() };
    const key = JSON.stringify(values);
    if (previous !== key || !requestId) requestId = crypto.randomUUID();
    previous = key;
    busy = true; go.disabled = true; kind.disabled = true; prompt.disabled = true;
    form.setAttribute('aria-busy', 'true');
    status.textContent = 'Sending to ElevenLabs…';
    try {
      const { job } = await apiJson(endpoint, { method: 'POST', body: { ...values, requestId } });
      jobs.set(job.id, job);
      show();
      status.textContent = job.state === 'failed' ? 'ElevenLabs rejected this request. No file was created.' :
        job.state === 'uncertain' ? 'Could not confirm submission. No automatic retry was made.' : 'Media request saved. Check status when you are ready.';
      if (job.state === 'failed') requestId = undefined;
    } catch (error) { status.textContent = error.message; }
    finally { busy = false; go.disabled = false; kind.disabled = false; prompt.disabled = false; form.removeAttribute('aria-busy'); }
  });
  const refresh = action('Reload media jobs', async () => load());
  async function load() {
    refresh.disabled = true;
    try {
      const result = await apiJson(endpoint);
      available = result.available;
      form.hidden = !available;
      jobs.clear();
      for (const job of result.jobs) jobs.set(job.id, job);
      show();
      status.textContent = available ? '' : 'Media generation is not connected yet.';
    } catch (error) { status.textContent = error.message; }
    finally { refresh.disabled = false; }
  }
  const element = section('Generate media', status, form, refresh, list);
  void load();
  return { element, propose({ kind: type, prompt: text } = {}) {
    if (busy || !Object.hasOwn(names, type) || typeof text !== 'string' || !text.trim() || text.length > 1500) return 'Proposal not accepted.';
    if (!available) return 'Media generation is not connected in this workspace.';
    kind.value = type;
    prompt.value = text.trim();
    status.textContent = 'Prompt ready for your approval. Nothing was generated.';
    prompt.focus();
    return 'Prompt prepared. The operator must approve before a file is generated.';
  } };
}
