// Source: TBD-APS/boney packages/product-ui/src/links.js @ 70c52d6ec4f6. Keep this copy in step. LinkEditor is the Product UI component.
import { createElement as h, useEffect, useLayoutEffect, useState } from 'react';
import { changeLinks, linksOn, searchPlaces } from '../js/linking.js';

/** Public cards. An empty or invalid catalogue renders nothing. The host saves the catalogue. */
export function RelatedLinks({ graph, fromId, heading = 'See also' }) {
  let items;
  try { items = linksOn(graph, fromId); } catch { return null; }
  if (!items.length) return null;
  const headingId = `related-${fromId}`;
  return h('section', { className: 'related-links', 'aria-labelledby': headingId },
    h('h2', { id: headingId }, heading),
    h('ul', null, items.map(({ link, place }) => h('li', { key: link.id },
      h('a', { className: 'related-link', href: place.href },
        h('span', { className: 'related-link-title' }, (link.label ?? place.title).trim()),
        place.summary ? h('span', { className: 'related-link-summary' }, place.summary) : null)))));
}

function Words({ link, title, onCommit }) {
  const [value, setValue] = useState(link.label ?? '');
  useEffect(() => { setValue(link.label ?? ''); }, [link.label, link.id]);
  return h('label', null, 'Words on the link',
    h('input', {
      type: 'text',
      value,
      placeholder: title,
      maxLength: 80,
      'aria-label': `Words on the link to ${title}`,
      onChange: event => setValue(event.target.value),
      onBlur: () => onCommit(value),
    }));
}

/**
 * Editor for the links that start on one page.
 * onChange receives the next catalogue. The host saves it.
 */
export function LinkEditor({ graph, fromId, onChange }) {
  const [query, setQuery] = useState('');
  const [status, setStatus] = useState('');
  const [focus, setFocus] = useState('');

  useLayoutEffect(() => {
    if (!focus) return;
    document.querySelector(`[data-focus="${CSS.escape(focus)}"]`)?.focus();
    setFocus('');
  }, [focus]);

  let items;
  let found;
  let place;
  try {
    items = linksOn(graph, fromId);
    found = searchPlaces(graph, fromId, query);
    place = graph.places.find(item => item.id === fromId);
    if (!place) throw new Error('Choose a page from the list.');
  } catch (error) {
    return h('p', { role: 'alert' }, error.message);
  }

  function apply(action, message, nextFocus) {
    try {
      onChange?.(changeLinks(graph, action));
      if (action.type === 'add') setQuery('');
      setStatus(message);
      setFocus(nextFocus);
    } catch (error) {
      setStatus(error.message);
    }
  }

  const titleId = `link-editor-${fromId}`;
  return h('section', { className: 'link-editor', 'aria-labelledby': titleId },
    h('h2', { id: titleId }, `Links from ${place.title}`),
    h('p', { className: 'link-editor-address' }, place.href),
    h('ul', { className: 'link-editor-list' }, items.map(({ link, place: target }, index) => h('li', { key: link.id },
      h('a', { href: target.href }, (link.label ?? target.title).trim()),
      h('span', { className: 'link-editor-path' }, target.href),
      h(Words, {
        link,
        title: target.title,
        onCommit: label => apply({ type: 'relabel', fromId, linkId: link.id, label }, 'Updated the words.', ''),
      }),
      index > 0 ? h('button', {
        type: 'button',
        'data-focus': `up:${link.id}`,
        onClick: () => apply({ type: 'move', fromId, linkId: link.id, direction: -1 }, 'Moved up.', `up:${link.id}`),
      }, 'Move up') : null,
      index < items.length - 1 ? h('button', {
        type: 'button',
        'data-focus': `down:${link.id}`,
        onClick: () => apply({ type: 'move', fromId, linkId: link.id, direction: 1 }, 'Moved down.', `down:${link.id}`),
      }, 'Move down') : null,
      h('button', {
        type: 'button',
        'data-focus': `remove:${target.id}`,
        onClick: () => apply({ type: 'remove', fromId, linkId: link.id }, `Removed ${target.title}.`, 'find-page'),
      }, 'Remove')))),
    items.length ? null : h('p', { className: 'link-editor-empty' }, 'No links from this page yet.'),
    h('label', null, 'Find a page',
      h('input', {
        type: 'search',
        name: 'query',
        value: query,
        'aria-label': 'Find a page',
        autoComplete: 'off',
        'data-focus': 'find-page',
        onChange: event => setQuery(event.target.value),
      })),
    h('ul', { className: 'link-editor-matches' }, found.length
      ? found.map(candidate => h('li', { key: candidate.id },
        h('button', {
          type: 'button',
          'data-focus': `add:${candidate.id}`,
          onClick: () => apply({ type: 'add', fromId, toId: candidate.id }, `Added ${candidate.title}.`, `remove:${candidate.id}`),
        }, `Add ${candidate.title}`)))
      : h('li', null, query.trim() ? 'No page matches.' : 'Every other page is already linked.')),
    h('p', { className: 'link-editor-status', 'aria-live': 'polite' }, status),
    h('h3', null, 'On the page'),
    h('div', { className: 'link-editor-preview' }, h(RelatedLinks, { graph, fromId })));
}
