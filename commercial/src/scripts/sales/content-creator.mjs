import { action, el, muted, section } from './dom.mjs';
import { mountPublicElevenLabsWidget } from './vendor/elevenlabs-public-widget.mjs';

const contentCreatorAgent = 'agent_0001m8fhykpmfg498c55m3wxwjta';

export function contentCreator() {
  const frame = el('div', { className: 'content-creator-widget' });
  const status = el('p', { role: 'status' });
  const open = action('Open Content Creator', async () => {
    open.disabled = true;
    status.textContent = 'Loading Content Creator…';
    try {
      await mountPublicElevenLabsWidget(frame, contentCreatorAgent);
      status.textContent = '';
      open.remove();
    } catch {
      const reload = el('a', { href: location.pathname + location.search }, 'Reload and try again');
      status.replaceChildren('Content Creator could not load. Your drafts are unchanged. ', reload);
      open.remove();
      reload.focus();
    }
  });
  return section('Content Creator',
    muted('Brainstorm video ideas with ElevenLabs. Opening the widget does not start a call. Do not share customer details or passwords.'),
    open, status, frame);
}
