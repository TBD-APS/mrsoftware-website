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

  return h('div', null,
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
