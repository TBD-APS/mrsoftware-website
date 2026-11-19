import { startCommercialSite } from './tests/helpers/commercial-http.mjs';
import { customerInput, opportunityInput, quoteInput } from './tests/helpers/commercial.mjs';

export default {
  start: async () => {
    const app = await startCommercialSite();
    try {
      const customer = (await app.call('POST', '/api/backoffice/customers', { ...customerInput, name: 'Holm & Co' })).body.item;
      await app.call('POST', '/api/backoffice/opportunities', opportunityInput(customer.id, { title: 'Service team rollout', nextFollowUp: '2020-11-19' }));
      await app.call('POST', '/api/backoffice/quotes', quoteInput(customer.id));
      return { ...app, base: app.privateBase + 'backoffice/' };
    } catch (error) { await app.close(); throw error; }
  },
  ready: page => page.waitForSelector('main[data-ready="true"] h1'),
  routes: async ({ base }) => {
    const state = await (await fetch(new URL('/api/backoffice/state', base))).json();
    return ['', '?view=customers', '?view=customer-new', '?view=customer-edit&id=' + state.customers[0].id, '?view=sales', '?view=opportunity-new', '?view=opportunity-edit&id=' + state.opportunities[0].id, '?view=quotes', '?view=quote-new', '?view=catalogue', ...state.catalog.packages.map(pkg => '?view=package&id=' + pkg.id), ...state.catalog.demos.map(demo => '?view=demo&id=' + demo.id)];
  },
  records: async ({ base }) => {
    const state = await (await fetch(new URL('/api/backoffice/state', base))).json();
    return [
      { kind: 'Customer', text: 'Holm & Co', route: '?view=customer&id=' + state.customers[0].id, heading: 'h1' },
      { kind: 'Opportunity', text: 'Service team rollout', route: '?view=opportunity&id=' + state.opportunities[0].id, heading: 'h1' },
      { kind: 'Quote', text: 'Workslip Core quote', route: '?view=quote&id=' + state.quotes[0].id, heading: 'h1' },
    ];
  },
  everyRecordShows: { selector: '#activity', what: 'its activity history' },
  roots: ['main'], nav: '.workspace-nav a', heading: 'main h1', output: '.ux-gate/private',
};
