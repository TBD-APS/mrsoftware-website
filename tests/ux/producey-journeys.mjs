// Agreed before the page: discover Producey from either product overview and
// reach the existing contact page. No demo, sign-up or warehouse action is offered.
export const produceyJourneys = [
  {
    id: 'find-producey',
    start: '/#solutions',
    selector: '#solutions article[aria-labelledby="producey-title"]',
    target: '/products/producey/',
    heading: 'From factory stock to dispatch.',
    budget: { clicks: 1, fields: 0 },
  },
  {
    id: 'find-producey-in-danish',
    start: '/da/#produkter',
    selector: '#produkter a[href="/products/producey/"]',
    target: '/products/producey/',
    heading: 'From factory stock to dispatch.',
    budget: { clicks: 1, fields: 0 },
  },
  {
    id: 'contact-about-producey',
    start: '/products/producey/',
    selector: '.product-hero .button-primary',
    target: '/contact/',
    heading: 'Tell us where the work gets stuck.',
    budget: { clicks: 1, fields: 0 },
  },
];
