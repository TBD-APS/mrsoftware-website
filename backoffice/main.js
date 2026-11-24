import { createElement as h, useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { LinkEditor } from './linking-react.js';
import '../css/linking.css';

function pageId(graph) {
  const requested = new URLSearchParams(location.search).get('page');
  return graph.places.some(place => place.id === requested) ? requested : graph.places[0].id;
}

function address(id) {
  const next = new URL(location.href);
  next.searchParams.set('page', id);
  return `${next.pathname}${next.search}`;
}

function App() {
  const [graph, setGraph] = useState(null);
  const [fromId, setFromId] = useState('');
  const [status, setStatus] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [cta, setCta] = useState(null);
  const [ctaVersion, setCtaVersion] = useState('');
  const [ctaStatus, setCtaStatus] = useState('');
  const [ctaBusy, setCtaBusy] = useState(false);

  useEffect(() => {
    let gone = false;
    fetch('/api/links').then(async response => {
      if (!response.ok) throw new Error('The link catalogue could not be loaded.');
      const next = await response.json();
      if (gone) return;
      setGraph(next);
      setFromId(pageId(next));
    }).catch(reason => {
      if (!gone) setError(reason.message || 'The link catalogue could not be loaded.');
    });
    return () => { gone = true; };
  }, []);

  useEffect(() => {
    let gone = false;
    fetch('/api/site-content').then(async response => {
      if (!response.ok) throw new Error('Homepage content could not be loaded.');
      const next = await response.json();
      if (gone) return;
      setCta(next);
      setCtaVersion(response.headers.get('etag'));
    }).catch(reason => {
      if (!gone) setCtaStatus(reason.message || 'Homepage content could not be loaded.');
    });
    return () => { gone = true; };
  }, []);

  useEffect(() => {
    if (!graph) return undefined;
    const onPop = () => setFromId(pageId(graph));
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, [graph]);

  if (error) return h('p', { role: 'alert' }, error);
  if (!graph || !fromId) return h('p', { 'aria-busy': 'true' }, 'Loading the pages.');

  function openPage(id, event) {
    if (event.button || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    event.preventDefault();
    history.pushState(null, '', address(id));
    setFromId(id);
  }

  async function save() {
    setBusy(true);
    setStatus('Saving.');
    try {
      const result = await fetch('/api/links', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(graph),
      });
      const message = await result.text();
      if (!result.ok) throw new Error(message);
      setGraph(JSON.parse(message));
      setStatus('Saved. Publish the site for readers to see these links.');
    } catch (reason) {
      setStatus(reason.message || 'The links were not saved.');
    } finally {
      setBusy(false);
    }
  }

  async function saveCta() {
    if (!cta) return;
    setCtaBusy(true);
    setCtaStatus('Saving homepage CTA.');
    try {
      const result = await fetch('/api/site-content', {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'if-match': ctaVersion },
        body: JSON.stringify(cta),
      });
      const message = await result.text();
      if (!result.ok) throw new Error(message);
      setCta(JSON.parse(message));
      setCtaVersion(result.headers.get('etag'));
      setCtaStatus('Saved. Homepage CTA updated in index.html.');
    } catch (reason) {
      setCtaStatus(reason.message || 'Homepage CTA was not saved.');
    } finally {
      setCtaBusy(false);
    }
  }

  return h('div', null,
    h('section', { style: { marginBottom: '2rem', paddingBottom: '1.5rem', borderBottom: '1px solid #ddd' } },
      h('h2', null, 'Homepage CTA (new section)'),
      h('p', { style: { maxWidth: '60ch' } }, 'Edits the “Ready when you are” section on the homepage. Saved to data/site-content.json and written into index.html by the backoffice.'),
      cta ? h('div', { style: { display: 'grid', gap: '0.75rem', maxWidth: '60rem' } },
        h('label', null, 'Eyebrow', h('input', { value: cta.eyebrow, onChange: e => setCta({ ...cta, eyebrow: e.target.value }), style: { width: '100%' } })),
        h('label', null, 'Heading', h('input', { value: cta.heading, onChange: e => setCta({ ...cta, heading: e.target.value }), style: { width: '100%' } })),
        h('label', null, 'Lead text', h('textarea', { value: cta.lead, onChange: e => setCta({ ...cta, lead: e.target.value }), rows: 3, style: { width: '100%' } })),
        h('label', null, 'Primary button label', h('input', { value: cta.primaryLabel, onChange: e => setCta({ ...cta, primaryLabel: e.target.value }), style: { width: '100%' } })),
        h('label', null, 'Primary button href (mailto or URL)', h('input', { value: cta.primaryHref, onChange: e => setCta({ ...cta, primaryHref: e.target.value }), style: { width: '100%' } })),
        h('label', null, 'Secondary button label', h('input', { value: cta.secondaryLabel, onChange: e => setCta({ ...cta, secondaryLabel: e.target.value }), style: { width: '100%' } })),
        h('label', null, 'Secondary button href', h('input', { value: cta.secondaryHref, onChange: e => setCta({ ...cta, secondaryHref: e.target.value }), style: { width: '100%' } })),
        h('div', null,
          h('button', { type: 'button', onClick: saveCta, disabled: ctaBusy, 'aria-busy': ctaBusy ? 'true' : undefined }, 'Save homepage CTA'),
          h('p', { 'aria-live': 'polite' }, ctaStatus))
      ) : h('p', { 'aria-busy': ctaStatus ? undefined : 'true', role: ctaStatus ? 'alert' : undefined }, ctaStatus || 'Loading homepage CTA…')),
    h('h2', null, 'Link graph (related links)'),
    h('nav', { className: 'link-pages', 'aria-label': 'Pages' }, graph.places.map(place => h('a', {
      key: place.id,
      href: address(place.id),
      'aria-current': place.id === fromId ? 'page' : undefined,
      onClick: event => openPage(place.id, event),
    }, place.title))),
    h(LinkEditor, { key: fromId, graph, fromId, onChange: setGraph }),
    h('button', { type: 'button', onClick: save, disabled: busy, 'aria-busy': busy ? 'true' : undefined }, 'Save links'),
    h('p', { 'aria-live': 'polite' }, status));
}

createRoot(document.getElementById('root')).render(h(App));
