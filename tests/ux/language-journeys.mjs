export const languageJourneys = [
  { id: 'choose-danish', start: '/', link: 'Dansk', target: '/da/', language: 'da', heading: 'Software, der følger arbejdet.', budget: 1 },
  { id: 'choose-english', start: '/da/', link: 'English', target: '/', language: 'en', heading: 'One place for every order, shipment, document and approval.', budget: 1 },
  { id: 'danish-to-workslip', start: '/da/', selector: '#produkter .card[href="/products/workslip/"]', target: '/products/workslip/', language: 'en', budget: 1 },
  { id: 'danish-to-research', start: '/da/', link: 'Se research og de danske papers', target: '/research/', language: 'en', heading: 'Research behind the software.', budget: 1 },
  { id: 'danish-to-contact', start: '/da/', link: 'Skriv til os', target: '/da/#kontakt', language: 'da', heading: 'Fortæl os, hvor arbejdet går i stå.', budget: 1 },
];
