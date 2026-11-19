# Commercial preview and release

Tracking: [SAS-561](https://linear.app/workslip/issue/SAS-561/offer-public-qrpwa-demos-and-williams-sales-backoffice).

## Working local preview

Run `npm ci`, then `npm run preview:commercial`. Keep the process running while
reviewing. It builds the app, binds only to `127.0.0.1` on an available port and
prints working URLs for the directory, pricing and private Today. Every page says
**Local preview · Synthetic examples**. Ctrl+C stops it and discards its ephemeral
real D1 sample sales records: one customer, one due opportunity and one quote at
899 DKK monthly / 1,250.50 DKK setup. The `.test` identity and sample contacts live
only in the preview/test harness. Production uses a separate entrypoint and has
no identity bypass flag.

The company site's `/demos/`, `/demos/<product>/`, `/pricing/` and
`/pricing/<product>/` entrypoints are managed in `data/links.json`, edited through
`node tools/link-backoffice.mjs` and rendered by `@mr-software/linking`.
Their Worker redirects intentionally target the future owned public hostname;
they are not a deployed preview. Use the printed loopback URLs for local review.
Only an allowed product and matching package survive a pricing redirect. These
redirects never run on the development dashboard host.

## Hosting and packaging

| Purpose | Worker / hostname | Assets and storage |
| --- | --- | --- |
| Company and private development dashboard | Existing `mrsoftware` / existing hosts | Existing root public files and approved private dashboard snapshot |
| Public demos and prices | New `mrsoftware-commercial` / `demos.mrsoftware.dk` | Only compiled `.commercial-dist`; visitor-local synthetic progress |
| Private sales | Same new Worker / `backoffice.mrsoftware.dk` | Dedicated D1 and Access audience, explicitly confirmed login |

Preserve the existing singular **demo.mrsoftware.dk**, which points to
`custom-domains.chatgpt.site`. All new canonical/QR/PWA links, routes and smoke
use plural **demos.mrsoftware.dk**. The private root reaches `/backoffice/` only
after signature/identity/allowlist checks. Private responses, including redirects
and denials, are `private, no-store`. Public and unknown hosts cannot serve
private HTML or private entry dependencies.

`wrangler.commercial.jsonc` is a fail-closed template: an all-zero database id,
empty identity settings, only the dedicated Worker, `run_worker_first: true`,
workers.dev and preview URLs disabled. Release creates a temporary mode-0600
config from deployment-owned settings and removes it in `finally`. There is no
`.dev.vars` production bypass. Company asset exclusions cover commercial source,
builds, scratch work, internal docs, tests and configs. Packaging tests capture
the exact Wrangler 4.153.0 upload manifest using its internal helper from an
ephemeral bundle copy. This narrow adapter fails on SDK upgrades and must be
reviewed; it neither changes the installed bundle nor invokes production APIs.

## Known readiness gap — 19 November 2026

Read-only discovery found account `9dd0c66615faab3122f01b14ebe3bbdd`, active zone
`e5d39e744a77fb4c6df798124e57047c` and existing Worker `mrsoftware`.
`mrsoftware-commercial` did not exist. No Access application matched the private
hostname, no dedicated sales D1 existed, and the plural public hostname had no
DNS record. Do not borrow unrelated databases or the dashboard Access audience.
Nothing was provisioned, migrated or deployed during implementation. Refresh
discovery at release time.

Production merge, provisioning, migration, Access changes and deployment remain
separate release actions requiring Rasmus's approval. Implementation/PR approval
does not authorize them.

## Approved release order

1. After approval, provision a dedicated **mrsoftware-sales** D1 and apply the
   reviewed `commercial/migrations/0001_sales.sql`. Do not copy sample sales data.
   Create a dedicated self-hosted Access app on the entire private hostname with
   exactly one email allow policy for William's privately confirmed login. The
   public `wp@mrsoftware.dk` contact is not his login. Add no other identities or
   bypass policy. Configure Access denial responses with `Cache-Control: no-store`.
2. Configure main-only GitHub environment `mrsoftware-commercial-production`,
   reviewed by Rasmus. Environment secrets: `CLOUDFLARE_API_TOKEN` and
   `COMMERCIAL_ALLOWED_EMAILS` (the one privately confirmed login). Variables:
   `CLOUDFLARE_ACCOUNT_ID`, `COMMERCIAL_D1_DATABASE_ID`, `COMMERCIAL_ACCESS_APP_ID`,
   `COMMERCIAL_ACCESS_ISSUER`, `COMMERCIAL_ACCESS_AUDIENCE`. Use the approved
   Worker/domain release permissions plus D1/Access read permissions for
   preflight. Remove inherited production secrets rather than silently falling
   back to them. Keep login lists out of static assets and committed examples.
3. Rasmus merges the reviewed stack. Dispatch **Release owner-merged commercial
   app** on exact current `main`, explicitly choosing `initial` for the first
   release. The existing `verifyRelease()` checks the exact PR/main SHA and
   Rasmus's immutable merger id. Preflight only reads dedicated D1/schema,
   Access app/audience/exact policy and fresh Worker collision evidence. An
   existing Worker stops initial mode; inspect it before selecting `update`.
4. Verify the commercial receipt: exact uploaded version at 100% traffic and
   successful GET-only smoke of public catalogue, compiled pages/dependencies,
   PWA metadata and unauthenticated private denial. Smoke never submits an enquiry
   or creates customers, opportunities or quotes.
5. Run/re-run **Deploy owner-merged website** only after commercial readiness.
   Its automatic owner-main path checks readiness **before snapshot unpack**;
   the website helper checks again **before upload**. Unavailable/malformed/
   off-host/missing-assets/private-exposure results stop it. All existing
   owner/exact-main/private-snapshot/immutable-version/rollback guards remain.

The initial automatic website run can fail readiness after the merge; this
leaves its live version untouched. Use these reviewed Actions as release
entrypoints, not a direct local deploy command.

## Initial release and uncertainty

Wrangler 4.153.0 cannot upload a version of a nonexistent Worker. Initial mode
therefore performs one guarded initial `deploy` of **mrsoftware-commercial**,
checks the exact version against provider evidence, and records
`rollback: unavailable-initial-release`, with no previous commercial version.
Never borrow the website's rollback version. An update verifies the existing
Worker's dedicated database/hosts, records its prior deployment/versions,
uploads, rechecks owner/current-main eligibility and deploys only that version.
Automatic resource provisioning is disabled in both modes.

The helper attempts each production write once. A failed or unconfirmed action
records `uncertain`; there is no automatic retry or rollback. Inspect its safe
receipt and provider state before any further action, then approve the concrete
recovery. Receipts exclude credentials, login lists and private sales/dashboard
content. A newer main SHA needs a newly eligible release.

## Verification

`npm test` builds once, runs Node/domain/real-D1/packaging/release tests, the
upstream link editor, the company/dashboard browser gate and the integrated
public/private commercial gate once each. Pinned CI actions retain company and
commercial reports. Conflicting inherited color settings are normalized before
browser subprocesses. See the [visual QA report](../qa/commercial-sales-2026-11-19/README.md)
for selected highlighted desktop/phone views and database-checked amounts/counts.
Physical iPhone/Android installation, Safari, native print destinations and a
physical camera remain unverified.
