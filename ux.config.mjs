import { startSite } from './tools/ux-site.mjs';
import { prepareContext } from './tests/ux/fixtures.mjs';

export default {
  start: startSite,
  prepare: ({ context, base }) => prepareContext(context, base),
  ready: page => page.waitForSelector('#development-overview', { timeout: 5_000 }),
  routes: async () => ['', '?development=tasks', '?development=mr-saasy', '?development=tradey'],
  records: async () => [
    { kind: 'Codebase', text: 'MR SAASy', route: '?development=mr-saasy', heading: '#development-view-title' },
    { kind: 'Codebase', text: 'Tradey', route: '?development=tradey', heading: '#development-view-title' },
  ],
  roots: ['main'],
  nav: '#development-overview nav a',
  heading: '#development-title',
  output: '.ux-gate',
};
