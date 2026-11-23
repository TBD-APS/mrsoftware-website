import { renderRelatedLinks } from './linking.js';
const danish = document.documentElement.lang === 'da';
const { graph, commercialAddresses = {} } = await import(danish ? './site-links.da.js' : './site-links.js');

for (const slot of document.querySelectorAll('[data-related-from]')) {
  slot.innerHTML = renderRelatedLinks(graph, slot.getAttribute('data-related-from'), { heading: slot.getAttribute('data-related-heading') ?? (danish ? window.MR_SOFTWARE_TRANSLATIONS['See also'] : undefined) });
  for (const link of slot.querySelectorAll('a')) {
    const external = commercialAddresses[link.getAttribute('href')];
    if (external) { link.href = external; link.hreflang = 'en'; }
  }
}
