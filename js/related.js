import { renderRelatedLinks } from './linking.js';
import { graph } from './site-links.js';

for (const slot of document.querySelectorAll('[data-related-from]')) {
  slot.innerHTML = renderRelatedLinks(graph, slot.getAttribute('data-related-from'), { heading: slot.getAttribute('data-related-heading') ?? undefined });
}
