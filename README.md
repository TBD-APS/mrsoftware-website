# mrsoftware.dk

The independent public demo/pricing app and private sales workspace have a
[local preview and guarded release guide](docs/operations/commercial-release.md).
Run `npm run preview:commercial` for working loopback demo, pricing and Today URLs.
Production release remains a separate approved action.

Statisk virksomhedssite for MR Software — sikkerhed, dataprivatliv og en åben
selvvalideringsartefakt.

## Indhold

- `/` — Forside
- `/foodtrader/` — Det offentlige om foodtrader
- `/privacy-policy/` — Privatlivspolitik for foodtrader
- `/terms-of-service/` — Vilkår for foodtrader
- `/data-deletion/` — Vejledning til sletning af foodtrader-data
- `/sikkerhed-og-dataprivatliv/` — Sikkerhed og dataprivatliv
- `/sikkerhed-og-dataprivatliv/saadan-validerer-vi-os-selv/` — Selvvalideringsartefakten
  (testlandskab, CI-gates, dækning, kendte huller, tidsstempel)

## Lokal udvikling

Åbn filerne i en lokal HTTP-server, f.eks.

```sh
npx serve .
```

## Deployment

The site runs on the existing Cloudflare Worker `mrsoftware`. Production releases
follow **pull request → Rasmus merges → Deploy owner-merged website Action**.
Do not deploy from local Wrangler. The Action checks GitHub's merged-PR evidence
against the exact current `main` SHA and Rasmus's immutable account ID; direct
pushes, another merger, missing evidence and stale revisions are refused.

Before merging the first release PR, configure the `mrsoftware-production`
environment to allow only the `main` branch, and apply the reviewed main-branch
protections. Put `CLOUDFLARE_API_TOKEN` and the numbered private snapshot parts
`MR_SOFTWARE_DASHBOARD_SNAPSHOT_1` through `_4` in that environment's secrets
(unused trailing parts stay absent); put `CLOUDFLARE_ACCOUNT_ID` and
`MR_SOFTWARE_DASHBOARD_SHA256` in its variables. Use a minimum-permission
account-owned Cloudflare token. Remove same-name repository/organization
production secrets: GitHub otherwise permits inheritance when an environment
secret is missing. Restrict personal Cloudflare deployment rights separately;
repository code cannot prevent an independently authorized API deployment.

The snapshot is gzip-compressed base64 of `{data, graphs}`, split into up to four
45,000-character secrets, with an 8 MiB decompressed limit. Prepare the already-reviewed
private source outside this repository:

```sh
node tools/dashboard-snapshot.mjs pack /private/reviewed-snapshot /private/new-snapshot-archive
```

The command creates a new private directory and prints only its SHA-256 and part
count. Store each `part-N` file as the corresponding snapshot environment secret
and the `sha256` file's digest as the snapshot variable.
Never commit the archive or attach it to a PR. The Action checks the digest,
builds the snapshot in private runner storage and deletes private inputs/build
output afterwards. Missing or invalid private inputs stop the release before any Cloudflare upload.

A missing-input error names the required secret/variable in
`mrsoftware-production`; it does not mean the source tests failed. Restore only
the already-reviewed snapshot parts and their approved digest using the setup
above. Unused trailing parts are optional. Noncontiguous/oversized parts or a
malformed digest get a configuration error without logging their values; corrupt
archive content still gets a generic private-input error. Do not substitute
synthetic data or skip snapshot verification to unblock a production release.

Synthetic tests run before production credentials are introduced. The release
records the prior deployment/version before uploading with `--keep-vars`, then
deploys only the exact uploaded version. Routes, custom domains and existing
variables remain in place. The artifact contains only a safe release receipt
(commit, PR, Action URL, deployment/version IDs and smoke statuses), never the
private dashboard or bundle. If Cloudflare says the uploaded version cannot
be found yet (code 100146), the same version is deployed again a few times,
because that response means traffic did not move. Any other uncertain result
is not retried and is not rolled back. Inspect the provider before trying
again. A rollback to the recorded prior version requires Rasmus's separate
approval.

## Development overview on dashboard.mrsoftware.dk

The existing dashboard hostname serves this site's homepage behind Cloudflare
Access. On that hostname only, the homepage places a first-party development
overview in an iframe above the company information. The three view
addresses are `?development=tasks`, `?development=mr-saasy` and
`?development=tradey`. Browser Back and reload preserve the selected view.

The frame and its scripts use `/_development/` on the dashboard hostname. The
Worker verifies the existing Access application's JWT signature, issuer,
audience and expiry. No ChatGPT sign-in is required. Other hostnames, including
Workers preview URLs, cannot serve these views. Private responses use no-store.

Task data and graph snapshots must stay outside this public repository. Before
uploading, set `DASHBOARD_SNAPSHOT_DIR` to the reviewed private snapshot directory
containing `data.json` and `graphs.json`. Wrangler's build command prepares an
ignored `.local/private-dashboard.json`; it is bundled into the Worker, never
uploaded as a static asset. Upload fails if the source is absent or incomplete.
`dashboard/` contains rendering code and is also excluded from static assets.

Run `npm ci` and `npm test` before pushing. The gate covers desktop and
phone navigation, deep links, tap sizes, layout, the public homepage and the
sign-in behavior. Tests render the real child application with synthetic Access
credentials on loopback. CI uses synthetic task/graph data; setting
`DASHBOARD_SNAPSHOT_DIR` runs browser tests against the reviewed private snapshot.
Worker tests reject forged, expired and incorrectly scoped JWTs and public hosts.
The report is `.ux-gate/report/index.html` and is also retained in CI.

## Public product roadmap

The list at `/roadmap/` groups features by package and counts developed and
upcoming work for each one. The package ID in `tools/public-features.json` is the
product repository slug. Add a stable feature anchor and reviewed customer-facing
English copy under the corresponding package.

- Use `source.issue` to track a feature's workflow state in Linear.
- Use `source.path` and `source.stage` for a feature verified in its repository
  when there is no useful Linear issue. Cite implementation evidence for
  `developed` or a documented commitment for `planned`. Review the source on
  the default branch when adding or changing the entry.

The sync reads only each registered issue's identifier, archive flag and
workflow type. It displays completed work as **Developed**, started work as
**In development**, and backlog or unstarted work as **Planned**. Canceled,
duplicate, triage and archived issues are omitted. Repo-backed entries retain
their reviewed state. Counts reflect the reviewed public inventory. Developed
describes an implementation and availability depends on product setup.

Set the following in the website repository's GitHub Actions settings:

- `LINEAR_ROADMAP_TOKEN` is a read-only Linear API key for the relevant teams.
- `PUBLIC_ROADMAP_GH_TOKEN` is a dedicated GitHub automation credential with
  Contents and Pull requests write access to this repository only.
- `PUBLIC_ROADMAP_SYNC=true` enables hourly polling on `main`.

Manually run **Sync public feature roadmap** from `main` for a preview. The
default run only checks and tests the proposed change. Select `propose` to
open a review PR. A scheduled run opens a PR only for a changed, tested
page, with one proposal open at a time. The next poll picks up additional
changes after that proposal is resolved. If Linear returns incomplete or
invalid data, the sync leaves the last reviewed page in place. The normal
owner-merged website release publishes approved updates.

To preview the exact change locally, provide the Linear key through the
environment and run `node tools/sync-public-roadmap.mjs`. Inspect the diff
in `roadmap/index.html` and run `npm test`.
