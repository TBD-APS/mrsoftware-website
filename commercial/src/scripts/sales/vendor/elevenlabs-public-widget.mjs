// Browser-only adapter for an explicitly selected public ElevenLabs agent.
// The host authorizes this surface. This module does not issue a token, open a
// conversation, or substitute for the provider's own authentication or costs.
export const elevenLabsWidgetRelease = Object.freeze({
  url: 'https://unpkg.com/@elevenlabs/convai-widget-embed@0.28.0/dist/index.js',
  integrity: 'sha384-aFdeZof/V4ZE6hBo7c3gA8xD9NL9bm1FR3gXjv5iiwSizuJxkLwGsiDjDUERvdVw',
});

const tag = 'elevenlabs-convai';
const loads = new WeakMap();

function loadWidget(doc, registry) {
  const existing = loads.get(doc);
  if (existing) return existing;
  if (registry.get(tag)) return Promise.reject(new Error('Another voice widget has already registered.'));
  const script = doc.createElement('script');
  script.src = elevenLabsWidgetRelease.url;
  script.integrity = elevenLabsWidgetRelease.integrity;
  script.crossOrigin = 'anonymous';
  script.referrerPolicy = 'no-referrer';
  script.async = true;
  const loaded = new Promise((resolve, reject) => {
    const finish = error => {
      clearTimeout(timeout);
      script.onload = script.onerror = null;
      if (error) { script.remove(); reject(error); } else resolve();
    };
    const timeout = setTimeout(() => finish(new Error('Voice widget did not finish loading.')), 12_000);
    script.onload = () => finish(registry.get(tag) ? null : new Error('Voice widget did not register.'));
    script.onerror = () => finish(new Error('Voice widget could not load.'));
  });
  loads.set(doc, loaded);
  doc.head.append(script);
  return loaded;
}

export async function mountPublicElevenLabsWidget(container, agentId) {
  if (typeof agentId !== 'string' || !/^agent_[A-Za-z0-9_-]{1,180}$/.test(agentId)) {
    throw new TypeError('Invalid public ElevenLabs agent identifier.');
  }
  const doc = container?.ownerDocument;
  const registry = doc?.defaultView?.customElements;
  if (!registry || !container.isConnected) throw new TypeError('A connected browser element is required.');
  await loadWidget(doc, registry);
  if (!container.isConnected) return;
  if (container.querySelector(tag)) return;
  const widget = doc.createElement(tag);
  widget.setAttribute('agent-id', agentId);
  widget.setAttribute('layout', 'page');
  container.append(widget);
}
