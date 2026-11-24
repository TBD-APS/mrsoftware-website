import { readFileSync } from 'node:fs';
import { createCvrClient } from '../../commercial/server/cvr.mjs';

// A CVR client backed by the synthetic fixtures. Searches return every fixture hit (the real
// register filters on the server; the client filters again); company lookups match the number.
const searchFixture = JSON.parse(readFileSync(new URL('../fixtures/cvr/search-workslip.json', import.meta.url), 'utf8'));

export function fixtureCvrFetch(overrides = new Map()) {
  return async (url, init) => {
    const body = JSON.parse(init.body);
    const wanted = body.query?.term?.['Vrvirksomhed.cvrNummer'];
    if (wanted === undefined) return Response.json(searchFixture);
    const hit = overrides.get(String(wanted)) ?? searchFixture.hits.hits.find(entry => String(entry._source.Vrvirksomhed.cvrNummer) === String(wanted));
    return Response.json({ hits: { total: hit ? 1 : 0, hits: hit ? [hit] : [] } });
  };
}

export const fixtureCvrClient = (overrides) => () => createCvrClient({ endpoint: 'https://cvr.example.test/cvr-permanent/virksomhed/_search', username: 'synthetic-user', password: 'synthetic-secret', fetch: fixtureCvrFetch(overrides) });
