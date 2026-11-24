# Lead Finder Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** William searches CVR from the sales backoffice by product, region and size, sees scored companies with a CVR-only reason, saves chosen ones as leads that appear in Today, and downloads CSVs.

**Architecture:** A small CVR client (`commercial/server/cvr.mjs`) builds an Elasticsearch query and maps hits to a flat company shape; pure scoring turns a company plus a product preset into a score and reason. New private API routes in `commercial/server/application.mjs` call the client (injected like `verifyIdentity`, so tests use fixtures), the store saves leads atomically with a CVR duplicate guard, and a new Leads screen in the vanilla backoffice UI drives it. CSV is one pure writer used by three GET routes.

**Tech Stack:** Cloudflare Worker (ES modules), D1, Astro 7 static pages with vanilla DOM scripts, `node:test` with the Miniflare D1 harness, Playwright UX gates.

**Spec:** `docs/superpowers/specs/2026-11-23-lead-finder-voice-assistant-design.md` (sections "Lead finder" and "Slices" 2–4). The voice assistant (slices 5–7) gets its own plan.

## Global Constraints

- Everything in "Binding constraints" of `docs/superpowers/specs/2026-11-19-demos-pricing-sales.md` applies: Access identity on every private request, `private, no-store`, same-origin JSON writes with `X-Requested-With: MRSoftware`, revision checks with 409, addressable records, 1440 px and 390 px, busy states that always end, load errors shown apart from empty results.
- English UI, code and docs; plain words (`AGENTS.md`).
- Companies with advertising protection (`reklamebeskyttet`) never appear in results, saved leads or the results CSV. Not switchable.
- Only limited-liability company forms appear (allowlist, fails closed): no sole proprietorships or other forms carried in a person's own name.
- Products are exactly `workslip`, `tradey`, `shippy`.
- Reason lines contain only CVR facts. No language model.
- At most 100 results per search. Nothing from CVR is stored until a lead is saved.
- CVR credentials only from Worker secrets `CVR_USERNAME`, `CVR_PASSWORD`; endpoint from `CVR_ENDPOINT`, which must start with `https://`. Missing or non-HTTPS settings make lead routes answer 503 "Company search is not connected yet." Credentials never reach the browser, logs, events or CSVs.
- No live CVR calls in tests. Fixtures are synthetic.
- CSV: UTF-8 with BOM, `;` separator, CRLF, formula guard on cells starting with `=`, `+`, `-`, `@`, tab or CR.
- Phone nav has at most five items: Today, Leads, Customers, Sales, More (Quotes, Catalogue). Desktop shows all six.
- Never `--no-verify`. Each PR keeps `npm test` and `npm run ux-gate:private` green.

## Review Focus

1. CVR down, slow or answering garbage: the search shows a plain error (not "no results"), the busy state ends, nothing is saved. Tests in Task 3 and Task 5.
2. Company names with `;`, `"`, line breaks, æøå or a leading `=`: CSV opens with the right cells and no formula. Test in Task 6.
3. Double-clicked or concurrent "Save as lead" for one CVR number, or a company that is already a customer: exactly one customer exists, and the second answer points to it. Test in Task 4.
4. Editing a saved lead's customer in the normal form keeps its CVR number. Test in Task 4.
5. A company that registered advertising protection between search and save: the save is refused with the reason, nothing is written. Test in Task 4.

## PR stack

- PR 1 (spec slice 2): Tasks 1–3, search only, no UI.
- PR 2 (spec slice 3): Tasks 4 and 5, save as lead and the screen.
- PR 3 (spec slice 4): Task 6, CSV.

Follow `pr-stack`; PR 2 sits on PR 1, PR 3 on PR 2.

---

### Task 1: Presets, municipalities and scoring

**Files:**
- Create: `commercial/shared/lead-presets.mjs`
- Create: `commercial/shared/municipalities.mjs`
- Create: `commercial/server/lead-scoring.mjs`
- Test: `tests/commercial-lead-scoring.test.mjs`

**Interfaces:**
- Produces:
  - `leadPresets: Record<'workslip'|'tradey'|'shippy', { label: string, codes: string[], sweetSpot: string[], adjacent: string[], source: string }>`. `codes` are 2–6 digit DB07 prefixes. `source` is the public product page URL the codes come from.
  - `employeeBands: Array<{ code: string, label: string }>` in order: `ANTAL_1_1` "1", `ANTAL_2_4` "2–4", `ANTAL_5_9` "5–9", `ANTAL_10_19` "10–19", `ANTAL_20_49` "20–49", `ANTAL_50_99` "50–99", `ANTAL_100_199` "100–199", `ANTAL_200_499` "200–499", `ANTAL_500_999` "500–999", `ANTAL_1000_999999` "1000+".
  - `allowedCompanyForms: string[]` — CVR short forms: `A/S`, `APS`, `IVS`, `P/S`, `K/S`, `AMBA`, `FMBA`, `SMBA`.
  - `regions: Array<{ code: string, name: string }>` (1081 Nordjylland, 1082 Midtjylland, 1083 Syddanmark, 1084 Hovedstaden, 1085 Sjælland) and `municipalities: Array<{ code: string, name: string, region: string }>` (all 98, three-digit codes as strings, e.g. `'751'` Aarhus in `'1082'`).
  - `municipalityCodes(regionCodes: string[], municipalityCodes: string[]): string[]` — union, sorted, unknown codes dropped.
  - `scoreLead(company: CvrCompany, preset, today: string /* YYYY-MM-DD */): { score: number, reason: string }`.

Proposed preset values (William reviews them in PR 1): Workslip codes `41`, `43`; sweet spot `ANTAL_5_9`, `ANTAL_10_19`, `ANTAL_20_49`; adjacent `ANTAL_2_4`, `ANTAL_50_99`. Shippy codes `4941`, `5229`, `5320`; sweet spot `ANTAL_5_9` to `ANTAL_50_99`; adjacent `ANTAL_2_4`, `ANTAL_100_199`. Tradey codes `463`; sweet spot `ANTAL_2_4` to `ANTAL_20_49`; adjacent `ANTAL_1_1`, `ANTAL_50_99`. Before committing, check each against the product pages in `data/links.json` and adjust; cite the page in `source`.

Score points: main industry code matches a preset prefix 45, else any secondary code matches 20; employee band in sweet spot 30, adjacent 15; founded at least two years before `today` 15; website or phone listed 10. Max 100.

Reason: comma-joined facts in this order, only those present: `"<industryText> (<industryCode>)"`, `"<label> employees"`, `"<city>"`, `"founded <yyyy>"`, `"website listed"` or `"phone listed"`.

- [ ] **Step 1: Write the failing tests**

```js
test('a carpenter with 10–19 staff in the Workslip sweet spot scores 100', () => {
  const company = carpenter({ founded: '2014-03-01', website: 'www.lund-toemrer.dk' });
  assert.deepEqual(scoreLead(company, leadPresets.workslip, '2026-11-24'), {
    score: 100,
    reason: 'Tømrerforretninger (433200), 10–19 employees, Aarhus C, founded 2014, website listed',
  });
});
test('only a secondary industry match, adjacent size, young and no contact scores 35', () => {
  assert.equal(scoreLead(carpenter({ industryCode: '471100', secondaryCodes: ['433200'], employees: 'ANTAL_2_4', founded: '2025-06-01', website: '', phone: '' }), leadPresets.workslip, '2026-11-24').score, 35);
});
test('a missing employee band adds no points and no size text', () => { /* employees: null → reason has no "employees" part */ });
test('municipalityCodes expands Midtjylland and drops unknown codes', () => {
  const codes = municipalityCodes(['1082'], ['999', '101']);
  assert.ok(codes.includes('751') && codes.includes('101') && !codes.includes('999'));
  assert.equal(municipalities.length, 98);
});
```

`carpenter(overrides)` is a test-local factory returning a `CvrCompany` (shape in Task 2) for "Lund Tømrer ApS", CVR `'12345678'`, code `'433200'`, text "Tømrerforretninger", `ANTAL_10_19`, city "Aarhus C", municipality `'751'`.

- [ ] **Step 2: Run** `node --test tests/commercial-lead-scoring.test.mjs` — expect FAIL (modules missing).
- [ ] **Step 3: Implement the three modules** with the values above.
- [ ] **Step 4: Run** `node --test tests/commercial-lead-scoring.test.mjs` — expect PASS.
- [ ] **Step 5: Commit** `[Feature] Score CVR companies against product presets`.

### Task 2: CVR client

**Files:**
- Create: `commercial/server/cvr.mjs`
- Create: `tests/fixtures/cvr/search-workslip.json` (an Elasticsearch response with 4 hits: one fitting ApS, one A/S with only a secondary match, one `reklamebeskyttet: true`, one `Enkeltmandsvirksomhed`) and `tests/fixtures/cvr/company-12345678.json`
- Test: `tests/commercial-cvr.test.mjs`

**Interfaces:**
- Produces:
  - `CvrCompany = { cvr: string /* 8 digits */, name: string, industryCode: string, industryText: string, secondaryCodes: string[], companyForm: string, employees: string|null, address: string, postcode: string, city: string, municipalityCode: string, founded: string|null, website: string, phone: string, email: string, protected: boolean, active: boolean }`.
  - `buildSearchQuery({ codes: string[], municipalityCodes: string[], sizes: string[], limit: number }): object` — Elasticsearch body. Filters: active status, `reklamebeskyttet` false, company form in `allowedCompanyForms`, municipality in list (omit filter when empty), employee interval in sizes (omit when empty), and a `should` of prefix queries on main and secondary industry codes with `minimum_should_match: 1`. `size: limit`.
  - `mapCompany(source: object): CvrCompany` — reads `_source.Vrvirksomhed`. Uses only non-secret contact values (skip entries marked `hemmelig`).
  - `createCvrClient({ endpoint, username, password, fetch = globalThis.fetch, timeoutMs = 8000 }): { search(params): Promise<CvrCompany[]>, company(cvr: string): Promise<CvrCompany|null> }`. Throws `HttpError(503, 'Company search is not connected yet.')` at creation when any setting is missing or `endpoint` does not start with `https://`. Sends HTTP Basic auth. On timeout, network error, non-2xx or unparsable JSON it throws `HttpError(502, 'The company register did not answer. Try again in a moment.')` without including the provider body. `search` drops any hit where `protected` is true, `active` is false or the form is not allowed, even though the query already excludes them.
  - `cvrClientFromEnv(env): client` — reads `CVR_ENDPOINT`, `CVR_USERNAME`, `CVR_PASSWORD`.

Field paths in `mapCompany` and `buildSearchQuery` follow Erhvervsstyrelsen's published CVR data model (`Vrvirksomhed.cvrNummer`, `reklamebeskyttet`, `virksomhedMetadata.nyesteNavn.navn`, `nyesteHovedbranche`, `nyesteBibranche1..3`, `nyesteVirksomhedsform.kortBeskrivelse`, `nyesteBeliggenhedsadresse`, `nyesteErstMaanedsbeskaeftigelse.intervalKodeAntalAnsatte` falling back to `nyesteKvartalsbeskaeftigelse`, `stiftelsesDato`, `sammensatStatus`, `telefonNummer`, `elektroniskPost`, `hjemmeside`). Read the public data model description at https://erhvervsstyrelsen.dk/kom-godt-igang-med-elasticSearch before writing the fixtures, keep every path in one `paths` constant, and note in the PR that the mapping is verified against the documentation only until CVR access exists.

- [ ] **Step 1: Write the failing tests**

```js
test('search maps the fixture and keeps only the fitting, unprotected limited companies', async () => {
  const client = createCvrClient({ endpoint: 'https://cvr.example.test/_search', username: 'u', password: 'p', fetch: fixtureFetch('search-workslip.json') });
  const companies = await client.search({ codes: ['43'], municipalityCodes: ['751'], sizes: [], limit: 100 });
  assert.deepEqual(companies.map(c => c.cvr), ['12345678', '23456789']);
  assert.equal(companies[0].companyForm, 'APS');
});
test('the query excludes protected companies and non-allowlisted forms and caps the size', () => {
  const body = buildSearchQuery({ codes: ['43'], municipalityCodes: [], sizes: ['ANTAL_10_19'], limit: 100 });
  assert.equal(body.size, 100);
  assert.match(JSON.stringify(body), /reklamebeskyttet/);
  assert.match(JSON.stringify(body), /APS/);
});
test('basic auth is sent and the password never appears in an error', async () => { /* fake fetch records the Authorization header; a 500 response rejects with status 502 and a message without "p" credentials or provider text */ });
test('timeout rejects with 502', async () => { /* fetch that never resolves, timeoutMs: 20 */ });
test('http endpoints and missing settings are refused', () => {
  assert.throws(() => createCvrClient({ endpoint: 'http://distribution.virk.dk/cvr-permanent/virksomhed/_search', username: 'u', password: 'p' }), e => e.status === 503);
  assert.throws(() => cvrClientFromEnv({}), e => e.status === 503);
});
test('company() returns null for an empty hit list', async () => { /* fixture with hits: [] */ });
```

- [ ] **Step 2: Run** `node --test tests/commercial-cvr.test.mjs` — expect FAIL.
- [ ] **Step 3: Implement `commercial/server/cvr.mjs`** with the signatures above. Use `AbortSignal.timeout(timeoutMs)`.
- [ ] **Step 4: Run** `node --test tests/commercial-cvr.test.mjs` — expect PASS.
- [ ] **Step 5: Commit** `[Feature] Read companies from the CVR register`.

### Task 3: Search and detail routes

**Files:**
- Modify: `commercial/server/validation.mjs` (add `validateLeadSearch`, `cvrNumber`)
- Modify: `commercial/server/store.mjs` (add `recordLeadSearch`, `customersByCvr`; `event` gains an optional `details` argument)
- Modify: `commercial/server/application.mjs` (routes; `createApplication({ verifyIdentity, cvrClient = cvrClientFromEnv })`)
- Modify: `tests/helpers/commercial.mjs` and `tests/helpers/commercial-http.mjs` (thread a `cvrClient` option; default a fixture client)
- Test: `tests/commercial-leads.test.mjs`

**Interfaces:**
- Consumes: Task 1 `leadPresets`, `municipalityCodes`, `employeeBands`, `scoreLead`; Task 2 `cvrClientFromEnv`, `CvrCompany`.
- Produces:
  - `validateLeadSearch(params: URLSearchParams): { product, codes, regions, municipalities, sizes }` — `product` required; `codes` default to the preset, 1–30 entries of `/^\d{2,6}$/`; `regions` and `municipalities` comma lists, at least one of them non-empty after expansion; `sizes` subset of band codes. 400 with a plain message otherwise.
  - `cvrNumber(value): string` — `/^\d{8}$/` else 400 "CVR number must have 8 digits.".
  - `Lead = CvrCompany & { score: number, reason: string, linkedinUrl: string, customerId: string|null }`. `linkedinUrl` is `https://www.linkedin.com/search/results/companies/?keywords=` + `encodeURIComponent(name)`.
  - `GET /api/backoffice/leads?product=…&codes=…&regions=…&municipalities=…&sizes=…` → `{ results: Lead[], search: <validated params> }`, sorted by score descending then name. Records one event `{ actor, recordType: 'leadSearch', recordId: <uuid>, operation: 'searched', details: { product, codes, regions, municipalities, sizes, count } }`.
  - `GET /api/backoffice/leads/<cvr>?product=…` → `{ lead: Lead }`; 404 "Company was not found in the register." when CVR has no active, allowed, unprotected match.
  - `store.customersByCvr(cvrs: string[]): Promise<Map<string, string>>` (cvr → customer id).

- [ ] **Step 1: Write the failing tests** (real D1 harness, fixture CVR client):

```js
test('search returns scored, sorted leads and marks companies already saved', async t => { /* create customer with cvr '23456789' via store; GET leads?product=workslip&regions=1082; assert results[0].cvr === '12345678', results[0].score === 100, results[1].customerId is that customer's id, Cache-Control is 'private, no-store' */ });
test('search writes one event with parameters and count, never results', async t => { /* read sales_events; recordType leadSearch; details.count === 2; JSON has no company names */ });
test('search needs Access and validates parameters', async t => { /* no identity → 403/redirect as other private routes; product=other → 400; no area → 400 */ });
test('missing CVR settings answer 503 with the plain message', async t => { /* harness with cvrClient: () => cvrClientFromEnv({}) */ });
test('a failing register answers 502 and is not shown as an empty list', async t => { /* cvrClient whose search rejects with the Task 2 HttpError(502) */ });
test('detail returns one lead and 404 for an unknown number', async t => {});
```

- [ ] **Step 2: Run** `node --test tests/commercial-leads.test.mjs` — expect FAIL.
- [ ] **Step 3: Implement** the validation, store helpers and routes. Register the routes before the generic records regex. Create the client per request (`cvrClient(env)`), so a missing secret fails per request with 503.
- [ ] **Step 4: Run** `node --test tests/commercial-leads.test.mjs tests/commercial-api.test.mjs tests/commercial-today.test.mjs` — expect PASS.
- [ ] **Step 5: Run** `npm test` — expect exit 0. Commit `[Feature] Search CVR leads from the backoffice API`. Push and open PR 1.

### Task 4: Save as lead

**Files:**
- Modify: `commercial/server/validation.mjs` (`stages` gains `'lead'` first; `validateCustomer` accepts optional `cvr`; add `validateLeadSave`)
- Modify: `commercial/server/store.mjs` (add `saveLead`)
- Modify: `commercial/server/application.mjs` (`POST /api/backoffice/leads`)
- Modify: `commercial/src/scripts/sales/forms.mjs` (`stages` gains `'lead'`; `customerForm` carries `cvr` through and shows it read-only when present)
- Test: `tests/commercial-leads.test.mjs`

**Interfaces:**
- Consumes: Task 2 client `company(cvr)`; Task 3 `cvrNumber`, `Lead`, `scoreLead` via the detail path.
- Produces:
  - `validateLeadSave(data): { cvr: string, product: string, nextFollowUp: string }` — exact keys, date required.
  - `store.saveLead({ company: Lead, product, nextFollowUp, today }, actor): Promise<{ created: boolean, customer, opportunity|null }>`. One `db.batch`: conditional customer insert `WHERE NOT EXISTS (SELECT 1 FROM sales_customers WHERE json_extract(document, '$.cvr') = ?)`, conditional opportunity insert and two events under the same condition, then a select of the customer by CVR. When nothing was inserted, return `{ created: false, customer: <existing>, opportunity: null }`.
  - Customer document: `{ name, cvr, contacts: [{ name: '', email, phone }] /* omitted when both empty */, notes: 'Found with the lead finder on <today>. Reason: <reason>' }`. Opportunity: `{ customerId, title: '<Product> lead', product, stage: 'lead', nextFollowUp, notes: '' }`.
  - `POST /api/backoffice/leads` → 201 `{ created: true, customer, opportunity }` or 200 `{ created: false, customer, opportunity: null }`. Before saving it calls `company(cvr)` live: protected, inactive or not-allowed form → 409 "This company has asked not to receive marketing in CVR. Nothing was saved." (or "…is no longer active…"); register failure → 502 and nothing saved.

- [ ] **Step 1: Write the failing tests**

```js
test('saving a lead creates the customer and a lead opportunity due on the chosen date', async t => { /* POST {cvr:'12345678', product:'workslip', nextFollowUp:'2030-11-20'} → 201; opportunity.stage === 'lead'; GET today?date=2030-11-20 lists it in followUps */ });
test('two concurrent saves for one CVR number give one customer', async t => {
  const [a, b] = await Promise.all([save(), save()]);
  assert.deepEqual([a.status, b.status].sort(), [200, 201]);
  assert.equal(await countCustomersWithCvr('12345678'), 1);
});
test('a company that became protected before saving is refused and nothing is written', async t => { /* client.company returns protected: true → 409 with the exact message; customer count unchanged */ });
test('editing the customer keeps its CVR number', async t => { /* PUT customer with the form payload including cvr → cvr unchanged; PUT with a different cvr → 400 "CVR number cannot be changed." */ });
test('the lead stage is accepted and enquiries keep working', async t => {});
```

- [ ] **Step 2: Run** `node --test tests/commercial-leads.test.mjs` — expect FAIL.
- [ ] **Step 3: Implement.** In `update` for customers, reject a `cvr` that differs from the stored one with 400 "CVR number cannot be changed.".
- [ ] **Step 4: Run** `node --test tests/commercial-leads.test.mjs tests/commercial-api.test.mjs tests/commercial-today.test.mjs` — expect PASS.
- [ ] **Step 5: Commit** `[Feature] Save CVR companies as leads in Today`.

### Task 5: Leads screen

**Files:**
- Create: `commercial/src/scripts/sales/leads.mjs`
- Modify: `commercial/src/scripts/backoffice.mjs` (views `leads`, `lead`; nav section `leads`)
- Modify: `commercial/src/layouts/PrivateLayout.astro` (add `['leads', 'Leads', <icon path>]` after Today; phone "More" holding Quotes and Catalogue)
- Modify: `commercial/src/styles/backoffice.css` (phone nav: four links plus More)
- Modify: `commercial/src/scripts/sales/views.mjs` (stage label "Lead")
- Modify: `tests/private-ux/journeys.mjs`, `tests/commercial-ux/backoffice.pw.mjs`

**Interfaces:**
- Consumes: Task 3 routes and `Lead`; Task 4 `POST /api/backoffice/leads`; Task 1 `leadPresets`, `regions`, `municipalities`, `employeeBands` (shared modules are importable from the browser bundle).
- Produces:
  - `leadSearchForm(params: URLSearchParams, onSearch: (params) => void): HTMLElement` — Product select (changing it refills the industry code list from the preset), Industry codes (removable chips plus an add field), Region checkboxes, optional Municipality multi-select, Size checkboxes. Submitting navigates to `?view=leads&product=…&codes=…&regions=…&sizes=…` (Back and reload repeat the search).
  - `leadsView(result: { results: Lead[] }, onSave): HTMLElement` — cards with name, CVR, industry, employees, city, score, reason, "Already in backoffice" link when `customerId`; whole card opens `?view=lead&cvr=<cvr>&product=<product>`; buttons Save as lead, Find on LinkedIn (`target="_blank" rel="noopener"`), Open website (when present); Empty list text: "No companies match. Try more regions or sizes." Load error is shown with the existing error pattern, not as the empty text.
  - `leadView(lead: Lead, onSave): HTMLElement` — the same facts plus address and founded date.
  - Save as lead opens an inline form with "Next follow-up" (default the next working day, Monday–Friday) and Save; success navigates to the opportunity with `#workspace-result` "Lead saved"; an existing customer navigates to it with "Already in backoffice".

- [ ] **Step 1: Write the failing UX journey** in `tests/private-ux/journeys.mjs`:

```js
{ id: 'find-and-save-lead', task: 'Find Workslip companies in Midtjylland and save one as a lead', start: '?view=leads', budget: { clicks: 4, fields: 1 },
  steps: [{ select: 'Product', value: 'workslip' }, { check: 'Midtjylland' }, { click: 'button', name: 'Search' }, { click: 'button', name: 'Save as lead' }, { click: 'button', name: 'Save lead' }],
  done: { route: /\?view=opportunity&id=/, text: [['h1', /Workslip lead/], ['#workspace-result', /Lead saved/]], inView: '#workspace-result' } },
```

Use the journey step kinds the gate already supports; if `check` is not one, use the existing equivalent and note it.

- [ ] **Step 2: Add Playwright tests** in `tests/commercial-ux/backoffice.pw.mjs`: reload and Back keep the search; a 502 from the fixture client shows the error and the busy state ends; at 390 px no horizontal overflow and the nav shows Today, Leads, Customers, Sales, More.
- [ ] **Step 3: Run** `npm run ux-gate:private` — expect the new journey and tests to FAIL.
- [ ] **Step 4: Implement** the screen, nav and styles.
- [ ] **Step 5: Run** `npm run ux-gate:private` — expect PASS. Then `npm test` — expect exit 0.
- [ ] **Step 6: Commit** `[Feature] Find and save leads in the backoffice`. Push and open PR 2 on top of PR 1, with a QA deck of the journey at desktop and phone.

### Task 6: CSV downloads

**Files:**
- Create: `commercial/server/csv.mjs`
- Modify: `commercial/server/application.mjs`, `commercial/server/store.mjs` (`allCustomers`, `allOpportunities`, each bounded to 5,000 rows, ordered by `updated_at DESC`)
- Modify: `commercial/src/scripts/sales/views.mjs` and `commercial/src/scripts/sales/leads.mjs` (download links on Customers, Sales and the Leads result list, carrying the current search params)
- Test: `tests/commercial-csv.test.mjs`

**Interfaces:**
- Produces:
  - `toCsv(columns: Array<{ header: string, value: (row) => unknown }>, rows: unknown[]): string` — BOM, `;`, CRLF, quotes fields containing `;`, `"`, CR or LF and doubles inner quotes, prefixes `'` to any cell starting with `=`, `+`, `-`, `@`, tab or CR, writes `null`/`undefined` as empty.
  - `GET /api/backoffice/leads.csv?<same params as search>` — columns: Company, CVR, Industry code, Industry, Employees, Address, Postcode, City, Website, Phone, Score, Reason, LinkedIn search.
  - `GET /api/backoffice/customers.csv` — Company, CVR, Contact names, Contact emails, Contact phones, Notes, Record link.
  - `GET /api/backoffice/opportunities.csv` — Title, Company, Product, Stage, Next follow-up, Notes, Record link.
  - All three: `Content-Type: text/csv; charset=utf-8`, `Content-Disposition: attachment; filename="<kind>-<YYYY-MM-DD>.csv"`, `private, no-store`, one event `{ recordType: 'export', operation: 'downloaded', details: { kind, count } }`. Record links are absolute `https://<BACKOFFICE_HOST>/backoffice/?view=…&id=…`.

- [ ] **Step 1: Write the failing tests**

```js
test('csv escapes separators, quotes, line breaks and formulas', () => {
  const csv = toCsv([{ header: 'Name', value: r => r }], ['Lund; Søn', 'Say "hi"', 'two\nlines', '=HYPERLINK("x")', '-5', 'Ærø']);
  assert.equal(csv, '﻿Name\r\n"Lund; Søn"\r\n"Say ""hi"""\r\n"two\nlines"\r\n"\'=HYPERLINK(""x"")"\r\n\'-5\r\nÆrø\r\n');
});
test('leads.csv returns the search as an attachment and records the download', async t => {});
test('customers.csv needs Access and lists CVR and contacts', async t => {});
```

- [ ] **Step 2: Run** `node --test tests/commercial-csv.test.mjs` — expect FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** `node --test tests/commercial-csv.test.mjs tests/commercial-leads.test.mjs` — expect PASS.
- [ ] **Step 5: Run** `npm test` — expect exit 0. Commit `[Feature] Download leads, customers and sales as CSV`. Push and open PR 3.
