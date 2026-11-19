import { mountLinkEditor } from '/js/linking.js';

const response = await fetch('/api/links');
if (!response.ok) throw new Error('The link catalogue could not be loaded.');
let graph = await response.json();

function pageId() {
  const requested = new URLSearchParams(location.search).get('page');
  return graph.places.some(place => place.id === requested) ? requested : graph.places[0].id;
}

let fromId = pageId();

function address(id) {
  const next = new URL(location.href);
  next.searchParams.set('page', id);
  return `${next.pathname}${next.search}`;
}

function renderNav() {
  const nav = document.querySelector('#pages');
  nav.replaceChildren();
  for (const place of graph.places) {
    const link = document.createElement('a');
    link.href = address(place.id);
    link.textContent = place.title;
    if (place.id === fromId) link.setAttribute('aria-current', 'page');
    link.addEventListener('click', event => {
      if (event.button || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
      event.preventDefault();
      fromId = place.id;
      history.pushState(null, '', link.getAttribute('href'));
      renderNav();
      mount();
    });
    nav.append(link);
  }
}

function mount() {
  mountLinkEditor(document.querySelector('#editor'), {
    graph,
    fromId,
    onChange(next) { graph = next; },
  });
}

renderNav();
mount();
window.addEventListener('popstate', () => {
  fromId = pageId();
  renderNav();
  mount();
});

document.querySelector('#save').addEventListener('click', async () => {
  const button = document.querySelector('#save');
  const status = document.querySelector('#status');
  button.disabled = true;
  button.setAttribute('aria-busy', 'true');
  status.textContent = 'Saving.';
  try {
    const result = await fetch('/api/links', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(graph),
    });
    const message = await result.text();
    if (!result.ok) throw new Error(message);
    graph = JSON.parse(message);
    status.textContent = 'Saved. Publish the site for readers to see these links.';
    mount();
  } catch (error) {
    status.textContent = error.message || 'The links were not saved.';
  } finally {
    button.disabled = false;
    button.removeAttribute('aria-busy');
  }
});
