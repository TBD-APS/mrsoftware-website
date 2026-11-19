UI changes keep `npm run ux-gate` green; a new screen gets a journey.
Cross-page links use `data/links.json` and `@mr-software/linking`. The editor is the React component `LinkEditor`. Run it with `npm run links`. Do not hand-write a second list. The backoffice journey is `tests/backoffice/editor.pw.mjs`.
The development iframe is shown only on dashboard.mrsoftware.dk. Serve its private
snapshot through the Worker after verifying Cloudflare Access. Never commit task
or graph snapshots or include them in public static assets. Preserve the company
homepage on other hostnames. No ChatGPT sign-in is required for dashboard views.
