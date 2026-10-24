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

The site runs on the existing Cloudflare Worker `mrsoftware`. Upload a version
with `wrangler versions upload --keep-vars`, then deploy that exact version with
`wrangler versions deploy`. This leaves the existing routes and custom domains
in place. Keep the previous version ID for rollback.

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
