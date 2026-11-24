# Lead Website Check Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** William presses **Check website** on a lead and sees, under "From the website", the company's own description, the systems its site names and its jobs page, each with a link. Facts come from fixed rules. Firecrawl is called only by the Worker, and a monthly credit cap holds.

**Architecture:**
- **Fixed rules.** Pure functions in `commercial/server/website-facts.mjs` pick pages, read robots.txt, and turn scraped pages into facts.
- **Firecrawl client.** `commercial/server/firecrawl.mjs` is a small client, injected into `createApplication` the same way as `cvrClient`.
- **Check service.** `commercial/server/website-check.mjs` reserves credits, scrapes and stores the facts.
- **Storage.** D1 gets two tables: website checks per CVR number, and credits per month.
- **Screen.** The lead card and the lead page get the button and the result.

**Tech Stack:** Cloudflare Worker (ES modules), D1, vanilla DOM scripts, `node:test` with the Miniflare D1 harness, Playwright UX gates.

**Spec:** `docs/superpowers/specs/2026-11-24-lead-website-check-and-web-search-design.md`, section "Website check" and "Credit cap" (slice 9). The web search (slice 10) and the assistant tools (slice 11, with the voice plan) get their own plans.

## Global Constraints

- **Everything in the Global Constraints of `docs/superpowers/plans/2026-11-24-lead-finder.md` still applies.** That covers:
  - Access identity on every private request and `private, no-store`;
  - same-origin JSON writes with `X-Requested-With: MRSoftware`;
  - busy states that always end;
  - 1440 px and 390 px screens;
  - English UI and plain words;
  - synthetic fixtures only.
- **Same-origin rule.** The spec's same-origin requirement for the POST is the backoffice's existing `requireJsonWrite` check (Origin, JSON and `X-Requested-With: MRSoftware`).
- **robots.txt.** The Worker reads robots.txt itself and does not rely on Firecrawl. This is the spec's fallback, chosen because Firecrawl's behaviour cannot be confirmed without a key.
- **Firecrawl key.** It comes only from the Worker secret `FIRECRAWL_API_KEY`.
- **Monthly cap.** It comes from the Worker variable `FIRECRAWL_MONTHLY_CREDITS`, which is `"0"` in `wrangler.commercial.jsonc` until Rasmus sets it.
- **Missing settings.** A missing key, or a cap that is missing, not a whole number or not above 0, makes every website-check route answer 503 "Website check is not connected yet." In that case nothing is spent or stored.
- **The key stays secret.** It never reaches the browser, a response, an error message, an event or the database.
- **The URL comes from CVR.** The website URL comes only from `cvrClient(env).company(cvr).website`, never from the request.
- **The company must be usable.** A company that fails `usableCompany` (protected, inactive or another form) is not checked, and the routes answer 404 "Company was not found in the register." like the lead page does.
- **What is stored.** Only facts: `description`, `systems`, `jobsPage`, `pages`, `checkedAt`. Page markdown is discarded in memory and never stored, logged or returned.
- **No sentences.** No sentence around a system name is stored. `systems` holds `{ name, url }` only.
- **Contact data.** A description that contains an email address or a phone number is dropped (`description: null`).
- **Pages.** A check reads at most three pages: the homepage, one about page and one jobs page, all on the homepage's host (a leading `www.` is ignored).
- **Credits.** Each Firecrawl scrape is reserved as 1 credit before the call. A reported `metadata.provider.creditsCost` is added after the call.
- **Months.** The cap counts by calendar month in UTC (`YYYY-MM`).
- **Freshness.** A stored check younger than 30 days is returned without spending.
- **Not in the activity list.** Website-check events stay out of "Recent activity", like `leadSearch` and `export`.
- **Fixtures.** No live Firecrawl calls in tests. Fixtures are synthetic and use `www.lund-toemrer.dk` (CVR 12345678 in `tests/fixtures/cvr/search-workslip.json`).

## Review Focus

1. **The CVR website field is not a clean homepage.** For example `www.lund-toemrer.dk`, `http://Lund-Toemrer.dk/kontakt` or `lund-toemrer.dk/`. The check starts at `https://<host>/` of whatever CVR gives, and an `http` site keeps `http`. The pin is in Task 2 (`safeWebsite`).
2. **robots.txt says `Disallow: /` for every user agent.** Nothing is scraped, nothing is spent, and the answer is 422 "This website asks robots not to read it." The pin is in Task 4.
3. **The homepage scrape fails.** That covers Firecrawl `success: false`, a page status other than 2xx, and a timeout. The answer is 502 "The website did not answer. Try again later.", nothing is stored, and the reserved credit stays counted. The pin is in Task 4.
4. **The cap runs out in the middle of a check.** The homepage is scraped and the jobs page is not. The check is stored with the pages it read, and `pages` shows only those. The pin is in Task 4.
5. **System names that contain regex characters or several words.** For example `SAP Business One`, `e-conomic` or `E-Komplet`. These must match as whole words, ignoring case, and must not match inside a longer word (`Apactaen` does not count). The pin is in Task 2.

---

### Task 1: Storage for website checks and the monthly credit counter

**Files:**
- Create: `commercial/migrations/0002_website_checks.sql`
- Modify: `commercial/server/store.mjs`
- Modify: `tests/helpers/commercial.mjs` (load every migration in `commercial/migrations/` in file-name order, not only `0001_sales.sql`)
- Modify: `tests/helpers/production-commercial.mjs` (same)
- Test: `tests/commercial-website-store.test.mjs`

**Interfaces:**
- Produces, in `createStore(db)`:
  - `reserveCredits(month: string, credits: number, cap: number) → Promise<boolean>`;
  - `addCredits(month, credits) → Promise<void>`;
  - `creditsUsed(month) → Promise<number>`;
  - `websiteChecks(cvrs: string[]) → Promise<Map<cvr, check>>`;
  - `saveWebsiteCheck(check, credits: number, actor) → Promise<check>`, which upserts the check and inserts an event `websiteCheck` / `checked` with details `{ cvr, credits }`.
- `check` shape: `{ cvr, description: string|null, systems: {name,url}[], jobsPage: string|null, pages: {url,status}[], checkedAt: ISO string }`.

- [ ] **Step 1: Write the failing tests**

```js
test('credits are reserved only while the month stays within the cap', ...)
// reserveCredits('2026-11', 1, 2) → true twice, then false; creditsUsed('2026-11') === 2;
// reserveCredits('2026-12', 1, 2) → true (new month); reserveCredits('2026-11', 3, 2) on an empty month → false.
test('parallel reservations never pass the cap', ...)
// 5 × reserveCredits('2026-11', 1, 3) in Promise.all → exactly 3 true; creditsUsed === 3.
test('addCredits adds provider extras even past the cap', ...)
// reserve 1 of cap 1, addCredits 2 → creditsUsed === 3.
test('a website check is stored per CVR number, replaced by the next, and recorded as an event', ...)
// saveWebsiteCheck twice for 12345678 → websiteChecks(['12345678','23456789']) has one entry equal to the second check;
// two events recordType 'websiteCheck', operation 'checked', details { cvr: '12345678', credits: 3 }.
test('website-check events stay out of recent activity', ...)
// after saveWebsiteCheck, (await store.state()).events has no recordType 'websiteCheck'.
```

- [ ] **Step 2: Run them and watch them fail**

Run: `node --test tests/commercial-website-store.test.mjs`
Expected: FAIL with "store.reserveCredits is not a function".

- [ ] **Step 3: Write the migration and the store functions**

The migration:

```sql
CREATE TABLE sales_website_checks (
  cvr TEXT PRIMARY KEY CHECK (length(cvr) = 8),
  checked_at TEXT NOT NULL,
  document TEXT NOT NULL CHECK (json_valid(document))
);
CREATE TABLE sales_firecrawl_usage (
  month TEXT PRIMARY KEY,
  credits INTEGER NOT NULL CHECK (credits >= 0)
);
```

The reservation is one conditional upsert. It returns `meta.changes === 1`. The `WHERE` on the `SELECT` is required for upsert parsing, and it also refuses a first reservation that is already over the cap.

```sql
INSERT INTO sales_firecrawl_usage (month, credits) SELECT ?1, ?2 WHERE ?2 <= ?3
ON CONFLICT(month) DO UPDATE SET credits = credits + excluded.credits
WHERE sales_firecrawl_usage.credits + excluded.credits <= ?3
```

For `saveWebsiteCheck`, upsert `sales_website_checks` and insert the event with `insertEvent` in one `db.batch`. Add `'websiteCheck'` to the `NOT IN` list in `auditOnly`.

- [ ] **Step 4: Run the tests and see them pass**

Run: `node --test tests/commercial-website-store.test.mjs tests/commercial-api.test.mjs tests/commercial-leads.test.mjs`
Expected: PASS. The existing tests still pass with both migrations loaded.

- [ ] **Step 5: Commit**

```bash
git add commercial/migrations/0002_website_checks.sql commercial/server/store.mjs tests/helpers/commercial.mjs tests/helpers/production-commercial.mjs tests/commercial-website-store.test.mjs
git commit -m "Store website checks and count Firecrawl credits per month"
```

### Task 2: Website facts, page choice and robots rules

**Files:**
- Create: `commercial/server/website-facts.mjs`
- Modify: `commercial/shared/lead-presets.mjs`, adding `websiteSystems`
- Test: `tests/commercial-website-facts.test.mjs`

**Interfaces:**
- Produces, from `website-facts.mjs`:
  - `safeWebsite(value: string) → URL|null`, the homepage URL `<scheme>://<host>/`;
  - `excludedDomains: string[]`;
  - `pickPages(home: URL, links: string[]) → { about: string|null, jobs: string|null }`;
  - `robotsAllows(robotsText: string, path: string) → boolean`;
  - `websiteFacts({ cvr, pages, checkedAt }) → check`, where `pages` is `[{ url, kind: 'home'|'about'|'jobs', statusCode, markdown, metadata }]`.
- Produces, from `lead-presets.mjs`: `websiteSystems = { workslip: ['Ordrestyring', 'Apacta', 'Minuba', 'E-Komplet', 'Intempus'], tradey: ['Uniconta', 'e-conomic', 'Business Central', 'Navision', 'Visma', 'SAP Business One', 'Odoo'], shippy: ['CargoWise', 'nShift', 'Consignor', 'Shipmondo', 'Webshipper'] }`. Add a comment that William reviews the lists.

- [ ] **Step 1: Write the failing tests**

```js
test('safeWebsite turns a CVR website into its homepage and refuses the rest', ...)
// 'www.lund-toemrer.dk' → 'https://www.lund-toemrer.dk/'; 'http://Lund-Toemrer.dk/kontakt' → 'http://lund-toemrer.dk/';
// 'https://lund-toemrer.dk/' → same; null for '', 'ftp://x.dk', 'https://10.0.0.1/', 'localhost', 'https://www.facebook.com/lund',
// 'linkedin.com/company/x', 'https://shop.krak.dk/'.
test('pickPages takes the first about and jobs link on the same host', ...)
// home https://www.lund-toemrer.dk/, links ['https://www.facebook.com/lund', 'https://lund-toemrer.dk/om-os',
// 'https://www.lund-toemrer.dk/job/toemrer', 'https://www.lund-toemrer.dk/karriere'] →
// { about: 'https://lund-toemrer.dk/om-os', jobs: 'https://www.lund-toemrer.dk/job/toemrer' };
// a link to 'https://andet-firma.dk/om-os' is ignored; no matches → { about: null, jobs: null }.
test('robotsAllows follows Disallow and Allow rules for every user agent', ...)
// 'User-agent: *\nDisallow: /' → false for '/'; 'User-agent: *\nDisallow: /om-os' → false for '/om-os', true for '/job';
// rules under 'User-agent: Googlebot' only → true; '' → true; 'Allow: /job' beats 'Disallow: /' for '/job' (longest match wins).
test('websiteFacts keeps the description word for word and names systems with the page that names them', ...)
// home metadata.description '  Tømrer i Aarhus siden 2014.\n Vi bygger tage og altaner. ' → 'Tømrer i Aarhus siden 2014. Vi bygger tage og altaner.';
// markdown 'Vi registrerer timer i Apacta.' on home and 'Vi bruger e-conomic' on about →
// systems [{ name: 'Apacta', url: home }, { name: 'e-conomic', url: about }]; a name found on two pages is listed once with the first page.
test('websiteFacts falls back to ogDescription and cuts long text at 300 characters', ...)
// no description, ogDescription 400 chars → 300 chars ending in '…', cut at a space.
test('websiteFacts drops a description with an email address or phone number', ...)
// 'Ring 12 34 56 78' → null; 'Skriv til jens@lund-toemrer.dk' → null; '+45 12345678' → null; 'Grundlagt 2014' → kept.
test('system names match whole words only, ignoring case', ...)
// 'apacta' counts; 'Apactaen' does not; 'SAP  Business\nOne' counts as 'SAP Business One'; 'E-Komplet' counts; 'EKomplet' does not.
test('jobsPage is set only when the jobs page loaded', ...)
// jobs page statusCode 200 → its url; 404 → null.
test('websiteFacts never returns page text', ...)
// a fixture sentence from the markdown body that names no system does not occur in JSON.stringify(result).
```

- [ ] **Step 2: Run them and watch them fail**

Run: `node --test tests/commercial-website-facts.test.mjs`
Expected: FAIL with "Cannot find module '../commercial/server/website-facts.mjs'".

- [ ] **Step 3: Implement the functions**

Implement the five exports with the signatures above. Rules the tests do not fix:
- `pickPages` decides on the link path. About matches `/(^|\/)(om-os|om|about|virksomheden)(\/|$)/i`. Jobs matches `/(^|\/)(job|jobs|karriere|ledige-stillinger|career|careers)(\/|$)/i`.
- `excludedDomains` is exactly the spec list: `linkedin.com`, `facebook.com`, `instagram.com`, `youtube.com`, `google.com`, `krak.dk`, `degulesider.dk`, `proff.dk`, `cvrapi.dk`, `virk.dk`, `jobindex.dk`, `trustpilot.dk`, `wikipedia.org`. A subdomain of a listed domain is excluded too.
- System matching uses one regex per name. Escape the name and turn its spaces into `\s+`. Wrap it as `(?<![\p{L}\p{N}])…(?![\p{L}\p{N}])` with the flags `iu`.

- [ ] **Step 4: Run the tests and see them pass**

Run: `node --test tests/commercial-website-facts.test.mjs`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add commercial/server/website-facts.mjs commercial/shared/lead-presets.mjs tests/commercial-website-facts.test.mjs
git commit -m "Turn scraped pages into website facts with fixed rules"
```

### Task 3: Firecrawl client

**Files:**
- Create: `commercial/server/firecrawl.mjs`
- Create: `tests/fixtures/firecrawl/home.json`, `about.json`, `jobs.json` (synthetic Firecrawl v2 scrape responses for `www.lund-toemrer.dk`), `robots.txt`, `README.md` (one line: synthetic, shaped like https://docs.firecrawl.dev/features/scrape)
- Create: `tests/helpers/firecrawl-fixture.mjs`
- Test: `tests/commercial-firecrawl.test.mjs`

**Interfaces:**
- Produces, from `firecrawl.mjs`:
  - `createFirecrawlClient({ apiKey, fetch = globalThis.fetch, endpoint = 'https://api.firecrawl.dev/v2', timeoutMs = 30000 }) → { scrape(url) → Promise<{ url, statusCode, markdown, links, metadata, extraCredits }>, robots(origin) → Promise<string> }`;
  - `firecrawlClientFromEnv(env)`.
- Produces, from the test helper:
  - `fixtureFirecrawlFetch({ pages?: Map<url, fixture|Response>, robots?: string }) → fetch`, which records `calls`;
  - `fixtureFirecrawlClient(options) → (env) => client`.
- The fixture's home markdown names `Apacta` and links to `/om-os` and `/job/toemrer`. The about page names nothing in the lists. The jobs page loads with 200.

- [ ] **Step 1: Write the failing tests**

```js
test('scrape posts one v2 request with the key, markdown and links, Danish location and no main-content filter', ...)
// fetch called with 'https://api.firecrawl.dev/v2/scrape', method POST, Authorization 'Bearer synthetic-firecrawl-key',
// body { url, formats: ['markdown','links'], onlyMainContent: false, location: { country: 'DK', languages: ['da'] } };
// result { url, statusCode: 200, markdown, links, metadata, extraCredits: 0 }.
test('a provider cost is reported as extra credits', ...)
// metadata.provider.creditsCost 4 → extraCredits 4; missing or not a positive number → 0.
test('a missing key means the website check is not connected', ...)
// createFirecrawlClient({}) throws HttpError 503 'Website check is not connected yet.'; firecrawlClientFromEnv({}) the same.
test('Firecrawl refusals and failures become plain errors without the key', ...)
// 401/403 → 503 'Website check is not connected yet.'; 402 → 429 'Firecrawl has no credits left this month.';
// 500, a thrown fetch, a timeout (timeoutMs 10, never-resolving fetch) and success:false → 502 'The website did not answer. Try again later.';
// no error message contains 'synthetic-firecrawl-key'.
test('robots fetches robots.txt from the site itself and treats failures as no rules', ...)
// robots('https://www.lund-toemrer.dk') fetches 'https://www.lund-toemrer.dk/robots.txt' without an Authorization header;
// 200 → its text (at most 64 KiB); 404, a thrown fetch and a timeout → ''.
```

- [ ] **Step 2: Run them and watch them fail**

Run: `node --test tests/commercial-firecrawl.test.mjs`
Expected: FAIL with "Cannot find module '../commercial/server/firecrawl.mjs'".

- [ ] **Step 3: Implement the client**

Use the same AbortController-and-clearTimeout pattern as `createCvrClient`. The robots fetch uses its own 5-second timeout.

- [ ] **Step 4: Run the tests and see them pass**

Run: `node --test tests/commercial-firecrawl.test.mjs`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add commercial/server/firecrawl.mjs tests/fixtures/firecrawl tests/helpers/firecrawl-fixture.mjs tests/commercial-firecrawl.test.mjs
git commit -m "Add a Firecrawl client that keeps its key on the server"
```

### Task 4: The website-check service and its routes

**Files:**
- Create: `commercial/server/website-check.mjs`
- Modify: `commercial/server/application.mjs`
- Modify: `tests/helpers/commercial.mjs`:
  - add `FIRECRAWL_API_KEY: 'synthetic-firecrawl-key'` and `FIRECRAWL_MONTHLY_CREDITS: '100'` to `commercialSettings`;
  - add the harness options `firecrawlClient = fixtureFirecrawlClient()` and `clock`.
- Modify: `tests/helpers/commercial-http.mjs` (pass `firecrawlClient` and `clock` through)
- Modify: `wrangler.commercial.jsonc` (`"FIRECRAWL_MONTHLY_CREDITS": "0"` in `vars`)
- Test: `tests/commercial-website-check.test.mjs`

**Interfaces:**
- Consumes:
  - Task 1's store functions;
  - Task 2's `safeWebsite`, `pickPages`, `robotsAllows`, `websiteFacts`;
  - Task 3's client.
- Produces:
  - `runWebsiteCheck({ company, firecrawl, store, cap, actor, now: Date }) → Promise<check>`;
  - `createApplication({ verifyIdentity, cvrClient, firecrawlClient = firecrawlClientFromEnv, clock = () => new Date() })`.
- Routes:
  - `GET /api/backoffice/leads/<cvr>/website` → `{ check }`, or 404 "This website has not been checked yet.";
  - `POST` on the same path → `{ check, spent: boolean }`, 200 when the stored check is fresh and 201 when it ran.
- The existing `GET /api/backoffice/leads/<cvr>` and `GET /api/backoffice/leads` add `websiteCheck` (the stored check or `null`) to each lead.

- [ ] **Step 1: Write the failing tests**

```js
test('checking a website reads home, about and jobs pages, stores facts and spends three credits', ...)
// POST /api/backoffice/leads/12345678/website with {} → 201; check.description, systems [{ name: 'Apacta', url: 'https://www.lund-toemrer.dk/' }],
// jobsPage 'https://www.lund-toemrer.dk/job/toemrer', 3 pages; fixture fetch saw 3 scrapes + 1 robots.txt;
// sales_firecrawl_usage for the clock's month = 3; one websiteCheck event with details { cvr: '12345678', credits: 3 }.
test('a check younger than 30 days is returned without spending', ...)
// second POST → 200, spent false, no new scrape, credits still 3.
test('a check older than 30 days runs again', ...)
// clock + 31 days → 201, credits 6.
test('the lead page and search results carry the stored check', ...)
// after a check, GET /api/backoffice/leads/12345678?product=workslip → lead.websiteCheck.systems[0].name 'Apacta';
// GET /api/backoffice/leads?product=workslip&regions=1082 → Lund has websiteCheck, Holm Byg has null.
test('robots rules are kept: disallowed pages are skipped and a site closed to robots is not read', ...)
// robots 'User-agent: *\nDisallow: /om-os' → 2 scrapes, no about page in pages;
// 'User-agent: *\nDisallow: /' → 422 'This website asks robots not to read it.', 0 scrapes, 0 credits.
test('the monthly cap stops scraping and says when it resets', ...)
// cap 2 → 201 with 2 pages (home, about) and credits 2; cap 0 used up (usage row at cap) → 429
// "This month's website checks are used up. They reset on 1 December." (clock 2026-11-24); no scrape.
test('a homepage that fails gives a plain error, stores nothing and keeps the credit counted', ...)
// home statusCode 503 → 502 'The website did not answer. Try again later.'; websiteChecks empty; credits 1.
test('companies that cannot be leads, or have no website, are not checked', ...)
// 34567890 (protected) → 404 'Company was not found in the register.'; 23456789 (no website) → 422 'CVR has no website for this company.';
// a CVR override whose website is 'facebook.com/x' → 422 'This website cannot be checked.'; 0 scrapes in all three.
test('the website check is off until the key and the cap are set', ...)
// env FIRECRAWL_API_KEY '' or FIRECRAWL_MONTHLY_CREDITS '0' / 'abc' / missing → POST and GET 503 'Website check is not connected yet.'; 0 fetches.
test('checking a website needs Access and a same-origin JSON request', ...)
// no Access header → 401; omit X-Requested-With → 403; 0 scrapes.
test('nothing stored or returned contains page text or the key', ...)
// a sentence from the fixture markdown body and 'synthetic-firecrawl-key' are absent from the response,
// every sales_website_checks document and every sales_events document.
```

- [ ] **Step 2: Run them and watch them fail**

Run: `node --test tests/commercial-website-check.test.mjs`
Expected: FAIL. The new route answers 404 "Page or record was not found."

- [ ] **Step 3: Implement the service and the routes**

`runWebsiteCheck` runs in this order:
1. Call `safeWebsite(company.website)`. When it returns null, answer 422 with one of two messages:
   - "CVR has no website for this company." when the website is empty;
   - "This website cannot be checked." for an excluded or unsafe site.
2. Fetch robots.txt. If the homepage path is disallowed, answer 422.
3. Reserve 1 credit, or answer 429 with the reset date (1 <next month in English> in UTC).
4. Scrape the homepage. A failure or a page status other than 2xx means 502.
5. Run `pickPages`. For each chosen page that robots allows: reserve 1 credit, then scrape. Stop quietly when a reservation fails.
6. Add the summed `extraCredits`.
7. `saveWebsiteCheck(websiteFacts(...), credits, actor)`.

The cap is `Number(env.FIRECRAWL_MONTHLY_CREDITS)`, which must be a whole number above 0. The routes check it, and the key, before any CVR call. The month is `clock().toISOString().slice(0, 7)`.

- [ ] **Step 4: Run the tests and see them pass**

Run: `node --test tests/commercial-website-check.test.mjs tests/commercial-leads.test.mjs tests/commercial-worker.test.mjs tests/commercial-deployment.test.mjs`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add commercial/server/website-check.mjs commercial/server/application.mjs tests/helpers/commercial.mjs tests/helpers/commercial-http.mjs wrangler.commercial.jsonc tests/commercial-website-check.test.mjs
git commit -m "Check a lead's website under the monthly Firecrawl cap"
```

### Task 5: The Check website button and the result on screen

**Files:**
- Modify: `commercial/src/scripts/sales/leads.mjs`
- Modify: `commercial/src/scripts/backoffice.mjs` (pass a `checkWebsite(cvr)` that POSTs with `apiJson` and reports 401/403 through `showError`)
- Modify: `commercial/src/styles/backoffice.css`
- Modify: `tests/commercial-ux/backoffice.pw.mjs`
- Modify: `tests/private-ux/journeys.mjs`
- Modify: `commercial.private.ux.config.mjs` (only if the audited lead route needs a stored check to show the section)

**Interfaces:**
- Consumes: Task 4's routes and `lead.websiteCheck`.
- Produces, in `leads.mjs`:
  - `websiteFactsView(check, { compact: boolean }) → Node`;
  - `leadsView` and `leadView` take a new last argument, `checkWebsite: (cvr) => Promise<{check}>`.

**Screen rules from the spec:**
- **The button.** "Check website" sits next to **Website** and shows only when the lead has a website. Its accessible name is "Check website of <name>", which starts with the visible words.
- **While it works.** It shows "Checking website…" and is disabled. The busy state ends on success and on every error.
- **The result appears where the button was.**
- **On the lead page,** the result is a section "From the website · checked <date>" with:
  - the description in quotes;
  - "Mentions <system>", linking to the page that names it;
  - "Has a jobs page", linking to it;
  - "Check again", when the check is older than 30 days.
- **On a card,** the result is one line, for example "Mentions Apacta · Has a jobs page", linking to the lead page. A check that found nothing reads "Nothing from our lists on the website".
- **Errors** show the server's message in `role="alert"` next to the button.

- [ ] **Step 1: Write the failing UX tests and journey**

```js
// backoffice.pw.mjs
test('Check website on the lead page shows the facts with links, and the busy state ends', ...)
// open ?view=lead&cvr=12345678&product=workslip, click 'Check website of Lund Tømrer ApS';
// section heading /From the website/ visible; link 'Mentions Apacta' has href 'https://www.lund-toemrer.dk/'; link 'Has a jobs page';
// the button is gone; reload → section still there (stored).
test('Check website on a card shows one line that opens the lead', ...)
// search Midtjylland, click 'Check website of Lund Tømrer ApS' in the Lund card → card text /Mentions Apacta · Has a jobs page/;
// clicking it navigates to ?view=lead&cvr=12345678.
test('a failed website check shows the reason and the button works again', ...)
// app started with a firecrawl fixture whose home answers 503 → alert 'The website did not answer. Try again later.'; button enabled.
test('a company without a website has no Check website button', ...)
// Holm Byg A/S card has no button named /Check website/.

// journeys.mjs
{ id: 'check-lead-website', task: 'See what a lead says about itself on its website', start: '?view=lead&cvr=12345678&product=workslip',
  budget: { clicks: 1, fields: 0 }, steps: [{ click: 'button', name: 'Check website of Lund Tømrer ApS' }],
  done: { text: [['h2', /From the website/]], inView: 'h2' } }
```

- [ ] **Step 2: Run them and watch them fail**

Run: `npm run build:commercial && npx playwright test --config playwright.commercial.config.mjs tests/commercial-ux/backoffice.pw.mjs -g "website"`
Expected: FAIL. No button named "Check website of Lund Tømrer ApS".

- [ ] **Step 3: Implement the views and the wiring**

Use the existing `el`, `link`, `dateLabel` and `action` helpers from `./dom.mjs`. The card line links with `link(..., 'lead', { cvr, product })`.

- [ ] **Step 4: Run the UX tests and the private gate**

Run: `npx playwright test --config playwright.commercial.config.mjs tests/commercial-ux/backoffice.pw.mjs && npm run ux-gate:private`
Expected: PASS. The journey `check-lead-website` is within budget, and the phone audit shows no sideways scroll.

- [ ] **Step 5: Run the whole suite and commit**

Run: `npm test`
Expected: exit 0

```bash
git add commercial/src tests/commercial-ux/backoffice.pw.mjs tests/private-ux/journeys.mjs commercial.private.ux.config.mjs
git commit -m "Show a Check website button and the website facts on leads"
```
