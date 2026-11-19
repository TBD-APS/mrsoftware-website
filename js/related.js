import { renderRelatedLinks } from './linking.js';
import { graph } from './site-links.js';

const slot = document.querySelector('[data-related-from]');
if (slot) slot.innerHTML = renderRelatedLinks(graph, slot.getAttribute('data-related-from'));
