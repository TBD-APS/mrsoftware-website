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
Access. On that hostname only, the homepage places the existing private
development Site in an iframe above the company information. The three view
addresses are `?development=tasks`, `?development=mr-saasy` and
`?development=tradey`. Browser Back and reload preserve the selected view.

The source Site retains its own ChatGPT sign-in and owner-private access. The
Open separately link opens the selected view for sign-in or standalone viewing.
No task data or graph snapshot is copied into this public website repository.

Run `npm ci` and `npm run ux-gate` before pushing. The gate covers desktop and
phone navigation, deep links, tap sizes, layout, the public homepage and the
sign-in fallback. Tests use local iframe fixtures and do not establish production
ChatGPT sign-in or cross-site-cookie behavior; verify those in the user's browser.
The report is `.ux-gate/report/index.html` and is also retained in CI.
