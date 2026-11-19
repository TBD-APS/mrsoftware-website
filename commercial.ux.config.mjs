import { startCommercialSite } from './tests/helpers/commercial-http.mjs';

export default {
  start: startCommercialSite,
  ready: page => page.waitForSelector('main h1', { timeout: 5_000 }),
  routes: async () => ['', 'pricing/', 'workslip/', 'tradey/', 'shippy/', 'workslip/install/', 'tradey/install/', 'shippy/install/'],
  records: async () => [
    { kind: 'Job', text: 'Kitchen service', route: 'workslip/jobs/ws-1042/', heading: 'h1' },
    { kind: 'Material', text: 'Copper pipe 15 mm', route: 'workslip/materials/mat-101/', heading: 'h1' },
    { kind: 'Offer', text: 'Summer produce offer', route: 'tradey/offers/offer-1048/', heading: 'h1' },
    { kind: 'Order', text: 'Summer produce order', route: 'tradey/orders/order-1048/', heading: 'h1' },
    { kind: 'Shipment', text: 'Aarhus delivery', route: 'shippy/shipments/shp-2048/', heading: 'h1' },
  ],
  everyRecordShows: { selector: '#history', what: 'its activity history' },
  roots: ['main'], nav: 'nav a', heading: 'main h1', output: '.ux-gate/commercial',
};
