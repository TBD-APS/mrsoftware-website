# Demos, pricing and sales workspace

Approved by Rasmus's `go` on 19 November 2026, following the feasibility investigation. Hosting is the existing Cloudflare setup under owned mrsoftware.dk hostnames. William must handle customers, quotes and sales follow-up, as well as demo and package administration.

## Architecture

Build an independent static Astro application in `commercial/`. A new Cloudflare Worker serves it on `demos.mrsoftware.dk` and `backoffice.mrsoftware.dk`, while the existing company website keeps its Worker, private development snapshot and release gates. The company site links to the new experience. The occupied singular `demo.mrsoftware.dk` is preserved.

Use Cloudflare D1 for the first sales workspace so it runs entirely in the chosen Cloudflare setup. Boney.Crm's C# package requires another runtime and PostgreSQL; this release does not introduce that server. Keep the small sales domain separate from the development control plane.

The public demos use synthetic records and visitor-local storage. A QR opens a stable seeded scenario; edits do not synchronize across devices. Cross-device sessions were described as an optional addition in the investigation and are outside this first release.

## Binding constraints

- English code, documentation and product UI; Danish conversation.
- Use owned mrsoftware.dk hostnames. No trycloudflare.com links.
- Do not change the existing development dashboard's access checks or snapshot handling.
- Static public demos; persistent customer/quote data only through the authenticated server API.
- Backoffice access fails closed without a dedicated Access audience and an explicitly allowed email. Validate RS256 signature, issuer, audience, expiry and required identity claims.
- Every private response is `private, no-store`. Public demo service workers must not cache backoffice or API responses.
- Mutating requests require same-origin JSON and an `X-Requested-With: MRSoftware` header. Unauthenticated enquiries have validation, idempotency and a bounded per-network rate limit.
- Money uses integer DKK minor units. Existing published Workslip prices are initial quote guidance; VAT and setup are confirmed in a quote. Tradey/Shippy start with a request-for-quote price.
- Saved quotes retain package, price and customer snapshots. Catalogue updates cannot rewrite existing quotes.
- Customer, opportunity, quote and catalogue edits use revision checks; a stale edit returns 409.
- Every record has a shareable URL, with Back and reload preserving it. Names and whole record cards open the record.
- Desktop 1440 px and phone 390 px. No horizontal overflow; tap targets at least 24 px, aiming for 44 px; no more than five phone navigation items.
- Busy states end on success and failure. Show load errors separately from an empty result.
- Run meaningful domain, real D1 and browser tests; keep the existing `npm test` and UX gate passing. Do not use `--no-verify`.
- Implementation and PRs are authorized. Production merge, database creation/migration, Access policy changes and deployment remain separate release actions.

## Public journeys

| Journey | Result | Click budget |
| --- | --- | ---: |
| Open a product demo from the demo directory | Exact seeded record visible | 1 |
| QR landing | Exact seeded record visible | 0 after scan |
| Complete the Workslip checklist and record time | Updated job and history visible | 3 |
| Find a material using a QR image or manual code | Material and quantity action visible | 3 |
| Review and approve the Tradey example offer | Simulated order visible | 2 |
| Complete the Shippy example shipment | Proof of delivery visible | 2 |
| Compare packages and request a quote | Receipt visible; enquiry in private workspace | 3 excluding form entry |
| Reset a demo | Initial scenario visible | 1 |

Each product has its own manifest id, start URL and scope, 192/512 px icons and scoped service worker. Cache only the public scenario shell/assets and seeded data. Offer installation where supported, with iPhone Share-menu instructions otherwise. Provide a camera QR scanner, image upload and manual-code fallback in Workslip. Never require a camera to finish the journey.

## William's journeys

Today shows opportunities due for follow-up and open quotes. Customers contain company name, contacts, notes and linked activity. Opportunities have product, stage, next follow-up and notes. Quotes select a package, agreed monthly price, setup amount and validity date; preview/print/save PDF shows the saved snapshot. William can change quote status manually; no email is sent automatically. Catalogue management edits package prices/content and enables/disables demos. Each mutation's result is immediately visible.

| Journey | Click budget excluding form entry |
| --- | ---: |
| Today to due customer/opportunity | 1 |
| Create a customer | 2 |
| Create an opportunity and next follow-up | 3 |
| Create and preview a quote | 3 |
| Print/save quote PDF | 1 from quote |
| Update a package or demo | 3 |

## Shared API contract

`commercial/server/application.mjs` exports `createApplication({ verifyIdentity } = {})`, returning `{ fetch(request, env) }`. Default identity verification is production Cloudflare Access verification. A test can inject a verifier returning `{ sub, email }` or `null`; production configuration has no bypass flag. `env.DB` is D1. `env.DEMO_HOST`, `env.BACKOFFICE_HOST`, `env.ACCESS_ISSUER`, `env.ACCESS_AUDIENCE`, and comma-separated `env.ALLOWED_EMAILS` are deployment-owned settings. A missing identity setting denies private access.

`commercial/shared/catalog.mjs` exports `initialCatalog`, with `{revision:1, currency:'DKK', packages, demos}`. A package is `{id, product, name, monthlyMinor, includes, active}`; `monthlyMinor:null` means request a quote. A demo is `{id, title, summary, active}` with id in `workslip`, `tradey`, `shippy`; its path is derived from that id, never user-supplied HTML or URL. Initial packages: `workslip-core` 89900; `workslip-drift` 189600; `workslip-complete` 244400; `tradey-custom` and `shippy-custom` null. Drift includes Core, KLS, Inventory & QR, Automations. Complete includes those plus Employee insights and Reporting.

All request and response objects use camelCase. Lists and strings have enforced bounds. No delete API is needed. New record ids are server-generated UUIDs. All records have `id`, `revision`, `createdAt`, `updatedAt`.

| Method/path | Body or response |
| --- | --- |
| `GET /api/catalog` | Public `{catalog}`. Read the saved catalogue or initial catalogue if no saved row exists. |
| `POST /api/enquiries` | `{requestId, company, name, email, product, packageId, message, website:''}`. UUID idempotency key; honeypot `website`; reply `{received:true, reference}` without private sales data. Create customer and enquiry-stage opportunity atomically. Exact retries return the receipt; changed bodies with the same key return 409. |
| `GET /api/backoffice/session` | `{email}` after identity and allowed-email checks. |
| `GET /api/backoffice/state` | `{customers, opportunities, quotes, events, catalog, truncated}`. Enforce a bounded record limit and declare truncation; never silently claim a complete empty list on errors. |
| `POST /api/backoffice/customers` | `{name, contacts:[{name,email,phone}], notes}` -> `{item}`. |
| `PUT /api/backoffice/customers/:id` | Same plus `revision` -> `{item}`. |
| `POST /api/backoffice/opportunities` | `{customerId,title,product,stage,nextFollowUp,notes}` -> `{item}`. Stage: enquiry/contacted/demo/quote/won/lost. `nextFollowUp` is null or YYYY-MM-DD. |
| `PUT /api/backoffice/opportunities/:id` | Same plus `revision` -> `{item}`. |
| `POST /api/backoffice/quotes` | `{customerId,opportunityId,packageId,monthlyMinor?,setupMinor,validUntil,notes}` -> `{item}`. Use catalogue price unless an agreed monthly price is supplied; custom packages require it. Server calculates and saves `snapshot:{customer,package,catalogRevision}`, `monthlyMinor`, `setupMinor`, `currency`, `status:'draft'`. |
| `PUT /api/backoffice/quotes/:id` | `{revision,status}` -> `{item}`. Status: draft/sent/accepted/declined/expired. Financial/customer snapshot stays immutable. |
| `GET /api/backoffice/customers/:id`, `.../opportunities/:id`, `.../quotes/:id` | `{item}`; support records beyond the bounded workspace list. |
| `PUT /api/backoffice/catalog` | `{revision,packages,demos}` -> `{catalog}` with next revision. Fixed products and demo ids; validate editable text, package ids, includes, active flags and integer amounts. |

Validation errors use `{error: plainEnglishMessage}` and 400; unauthorized 401; non-allowed identity or origin 403; missing record 404; revision/idempotency conflict 409; rate limit 429; unavailable storage 503. Database errors do not expose SQL or private values. Mutation events identify actor, record and operation; quote and customer snapshots stay in protected storage. No secrets or private snapshots are committed.

## Local and release evidence

Use real local D1 through Miniflare for API integration tests and the full browser experience. Browser tests use signed synthetic Access tokens or an injected identity only in test harnesses. The runnable local preview identifies itself as a preview and uses synthetic seed customers; it cannot be selected through a production env bypass.

Use a separate commercial Wrangler config and build output. Production configuration must require a real D1 binding, dedicated Access audience and allowed users before release. Explain provisioning and owner-merged release steps without creating production resources during development. Keep source/tests/private data out of static assets. Provide screenshots and a local QA report after desktop and phone checks. Physical iPhone/Android installation and live camera behavior must be reported separately from headless browser evidence.
