// Existing product pages: read a use case, inspect feature availability, then
// find the pricing destination. Each task starts on the product page.
export const productContentJourneys = [
  { id: 'use-cases', target: '#use-cases', budget: { clicks: 1, fields: 0 } },
  { id: 'features', target: '#product-features', budget: { clicks: 1, fields: 0 } },
  { id: 'pricing', target: '/pricing/', budget: { clicks: 1, fields: 0 } },
];
