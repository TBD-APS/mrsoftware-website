# mrsoftware.dk

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
output afterwards. Missing or invalid private inputs stop the release.

Synthetic tests run before production credentials are introduced. The release
records the prior deployment/version before uploading with `--keep-vars`, then
deploys only the exact uploaded version. Routes, custom domains and existing
variables remain in place. The artifact contains only a safe release receipt
(commit, PR, Action URL, deployment/version IDs and smoke statuses), never the
private dashboard or bundle. Inspect provider state after an uncertain result;
there is no automatic retry or rollback. A rollback to the recorded prior
version requires Rasmus's separate approval.

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
