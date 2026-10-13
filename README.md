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

Siden er deployet via Cloudflare Pages til `mrsoftware.dk`.