UI changes keep `npm run ux-gate` green; a new screen gets a journey.
Cross-page links use `data/links.json`. The editor is `LinkEditor` from `@mr-software/product-ui/links`, copied into `backoffice/linking-react.js` because this site does not install that package. Run it with `npm run links`. Do not hand-write a second list. The backoffice journey is `tests/backoffice/editor.pw.mjs`. Public pages keep the static list and do not load React.
The development iframe is shown only on dashboard.mrsoftware.dk. Serve its private
snapshot through the Worker after verifying Cloudflare Access. Never commit task
or graph snapshots or include them in public static assets. Preserve the company
homepage on other hostnames. No ChatGPT sign-in is required for dashboard views.

## Production completion

When a feature passes the relevant production checks, deploy it through the approved product release path and verify the exact serving revision and risk-appropriate runtime smoke. Report merge, deployment and runtime verification separately. Stop for a concrete blocker and state exactly what is missing. Keep project-specific permissions and release approvals; this guidance grants no access.

Use the [website delivery runbook](README.md#deployment). Keep the existing owner-merge/production environment controls and the separation between the public site, private dashboard and commercial app.
