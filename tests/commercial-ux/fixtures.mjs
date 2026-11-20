import { test as base, expect } from '@playwright/test';
import { startCommercialSite } from '../helpers/commercial-http.mjs';

export const test = base.extend({
  app: async ({}, use) => {
    const app = await startCommercialSite();
    try { await use(app); } finally { await app.close(); }
  },
});
export { expect };
