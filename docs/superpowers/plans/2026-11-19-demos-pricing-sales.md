# Demos, pricing and sales workspace Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox syntax for tracking.

**Goal:** Give prospects usable QR/PWA demos and packages, and William a persistent sales workspace.

**Architecture:** Independent static Astro app and a Cloudflare Worker/D1 API. Existing company website and development dashboard remain on their current release path.

**Tech Stack:** Node 22, Astro 6.4.8, Wrangler 4.153.0, D1/Miniflare, jose 6.2.13, qrcode 1.5.4, jsQR 1.4.0, Playwright 1.63.0.

**Spec:** `docs/superpowers/specs/2026-11-19-demos-pricing-sales.md`.

## Global Constraints

The spec's Binding constraints and Shared API contract bind every task. English product UI. No production merges/deployments or data provisioning. Preserve the existing dashboard. Use integer minor units, immutable quote snapshots, revision checks, signed Access identity and allowed emails. No private caching. Test before each push.

## Task 1: Catalogue and persistent sales API

**Files:** `commercial/shared/catalog.mjs`, `commercial/server/{application,identity,validation,store}.mjs`, `commercial/migrations/0001_sales.sql`, `tests/commercial-api.test.mjs`, `tests/commercial-identity.test.mjs`, `tests/helpers/commercial.mjs`, root package dependencies as needed.

**Interfaces:** Produce `initialCatalog` and `createApplication` exactly as the spec declares, with the HTTP contract in its table. Consumers are the public app, private app and local harness. The Worker falls back to `env.ASSETS.fetch` for eligible public pages; private HTML and APIs require the correct private host and identity. Only GET/HEAD assets are served.

- [ ] Write real D1 tests first for atomic enquiry creation/idempotency, revision conflicts, immutable quotes after catalogue edits, unauthorized/private host rejection, wrong-origin writes, rate limiting and unavailable storage. Example invariant:
  ```js
  const original = await api('POST', '/api/backoffice/quotes', {customerId, packageId:'workslip-core', setupMinor:0, validUntil:'2030-12-31', notes:''});
  await updateCataloguePrice(99900);
  assert.equal((await api('GET', `/api/backoffice/quotes/${original.item.id}`)).item.monthlyMinor, 89900);
  ```
- [ ] Run `node --test tests/commercial-api.test.mjs tests/commercial-identity.test.mjs`; retain failing evidence before implementation.
- [ ] Implement the schema, bounded validation, Access verifier, catalogue and API. Use parameterized SQL and atomic D1 batches; production must have no test identity bypass.
- [ ] Run the focused tests and existing `npm test`; self-review and commit source and its tests together.

## Task 2: Public Astro demos, QR, PWA and prices

**Files:** `astro.commercial.config.mjs`, `commercial/src/{layouts,components,pages,scripts,styles}/`, `commercial/public/`, `tools/build-commercial.mjs`, `tests/commercial-ux/`, `playwright.commercial.config.mjs`, `commercial.ux.config.mjs`, appropriate npm scripts. Keep Task 1 server files unchanged unless an evidenced contract defect is reported to the controller.

**Interfaces:** Consume `/api/catalog` and `/api/enquiries` and the shared initial catalogue for static prerendering. Build into `.commercial-dist/`. The private page will be added in Task 3. Public routes `/`, `/pricing/`, `/workslip/`, `/tradey/`, `/shippy/`, with shareable seeded record routes under each product. Local progress is isolated per product/version. Use only first-party assets.

- [ ] Define the spec's public journeys with click budgets before the screens. Add browser tests that fail against the missing routes/actions.
- [ ] Implement a reusable layout matching existing website fonts/tokens, product directory and responsive demo records. Make all actions change visible scenario state; persist and reset it.
- [ ] Implement generated QR links/labels, manual lookup, camera scan and image upload using jsQR. Bundle the decoder locally. Test image-upload decoding against an actual generated example code, camera denial/manual fallback and invalid codes.
- [ ] Add per-product manifests, install help, icons and non-overlapping service workers. Test offline cached routes, isolation from private/API routes and update behavior. Use an HTTPS-capable origin or loopback for browser tests.
- [ ] Implement live catalogue prices and an enquiry form with visible success, pending and error outcomes. Use UUID idempotency and the specified JSON/header contract. Query `?product=&package=` selects context without inserting raw HTML.
- [ ] Run build, focused domain/browser tests and existing gates. Commit source and covering tests together.

## Task 3: William's sales workspace

**Files:** `commercial/src/pages/backoffice/index.astro`, `commercial/src/scripts/backoffice.mjs`, focused view/form/print modules under `commercial/src/scripts/sales/`, scoped private styles, `tests/commercial-ux/backoffice.pw.mjs` and journey configuration.

**Interfaces:** Consume the exact private API contract. Use addressable query routes such as `/backoffice/?view=customer&id=<uuid>` and `/backoffice/?view=quote&id=<uuid>`. Fetch specific records when they are outside the bounded state list. API is authoritative; no client persistence of customer/quote state.

- [ ] Write failing browser journeys for creating a customer/contact, saving an opportunity/follow-up, creating a quote, changing a catalogue price without changing that quote, printing the saved snapshot, and unauthorized/error behavior.
- [ ] Implement Today, Customers, Sales, Quotes and Catalogue. Names and record cards open details, Back/reload preserve records, success results appear immediately, and failed loads do not show zero counts.
- [ ] Implement validated forms with revision fields, conflict recovery, read-only quote snapshots, manual quote status changes and print/save-PDF CSS. Show explicit confirmation of status changes; send no email.
- [ ] Add the private routes to the shared UX audit, then run focused and full gates. Commit with covering tests.

## Task 4: Website integration, release packaging and visual evidence

**Files:** existing `index.html` and product page links, a small public pricing redirect if needed, `.assetsignore`, `.gitignore`, package scripts, `wrangler.commercial.jsonc`, commercial CI/release scripts/workflow, docs and QA report. Existing `worker.mjs` may wrap the current handler for a public-only redirect; retain dashboard behavior.

- [ ] Add tests for website entry points and production packaging, including private host denial and absence of source/private files in static assets.
- [ ] Add navigation/product links to public demos and prices. Package the new application independently from the dashboard snapshot. Add local preview and documented D1/Access binding setup, with a fail-closed release preflight.
- [ ] Ensure `npm test` builds/tests the new app and runs both old/new browser gates. Keep workflow actions pinned to existing reviewed SHAs.
- [ ] Run desktop/phone browser journeys against real local D1; take highlighted screenshots, verify counts/amounts against storage, and save a QA report with physical-device limitations.
- [ ] Review each code concern, fix evidence-backed findings, run complete tests, push topic branches, open and link PRs with one task for the stack, and follow CI to green. Production release remains for Rasmus's approval.
