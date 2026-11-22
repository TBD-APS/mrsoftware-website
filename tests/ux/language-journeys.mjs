// One-click language journeys keep the same full public site in either language.
export const languageJourneys = [
  { id: 'choose-danish', start: '/', link: 'Dansk', target: '/da/', language: 'da', heading: 'Software, der holder arbejdet i gang.', budget: 1 },
  { id: 'choose-english', start: '/da/', link: 'English', target: '/', language: 'en', heading: 'Software that keeps work moving.', budget: 1 },
  { id: 'danish-to-tradey', start: '/da/#solutions', selector: '#solutions article[aria-labelledby="tradey-title"]', target: '/da/products/tradey/', language: 'da', budget: 1 },
  { id: 'danish-to-research', start: '/da/', selector: '.site-footer a[href="/da/research/"]', target: '/da/research/', language: 'da', heading: 'Forskningen bag softwaren.', budget: 1 },
  { id: 'danish-to-contact', start: '/da/', selector: '.hero .hero-actions a[href="#contact"]', target: '/da/#contact', language: 'da', heading: 'Fortæl os, hvor arbejdet går i stå.', budget: 1 },
  { id: 'same-product-language', start: '/products/producey/#planned-workflow', link: 'Dansk', target: '/da/products/producey/#planned-workflow', language: 'da', result: '#planned-workflow', budget: 1 },
];
