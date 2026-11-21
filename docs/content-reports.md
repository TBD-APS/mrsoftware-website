# Public roadmap dashboard and report exports

`npm run build:reports` builds `/roadmap/report/` from the existing reviewed
`public-features` region in `roadmap/index.html`. It reads no task snapshot,
private Control Center data, provider credentials or Linear descriptions.
Only already published package names and feature stages are aggregated.

The input projection supplies one source version, timestamp and snapshot hash
to `@mr-software/content` 0.1.0 (`mr.content`). Every displayed metric, SVG,
PDF, DOCX, XLSX, PPTX and CSV uses that projection. Developed means implemented;
it is not customer activation or percentage complete. Pipeline is the sum of
in-development and planned features. The data changes when the reviewed roadmap
changes, rather than being described as a live feed.

## Producer admission

The npm archive is retained in `vendor/boney` with its original Boney artifact
manifest and a recorded successful producer main run. `verify-content-module.mjs`
checks the source identity, clean/release-eligible manifest, exact run, archive
integrity and package lock before a production build imports the shared renderer.
Do not replace the archive with a local rebuild of the same version. Future
upgrades require a new admitted producer version and updated integrity evidence.

## Build and hosting

The content module is used by the Node build tools, not bundled into the Worker
or loaded into public browsers. A dedicated local Chromium page denies all
network requests while generating the PDF and Word image fallbacks. The generated
directory is ignored by Git and regenerated for tests and the deploy job. It
contains only the public projection and its exports. It must exist before Wrangler
uploads assets; no private dashboard files are copied into this directory.

The normal `npm test`, `npm run ux-gate` and `npm run dev` commands prepare these
files. Test the standalone builder with `npm run build:reports`. GitHub's existing
owner-merge release gate remains the production path.

## File behavior

PDF and HTML are readable reports; Word has editable text/tables and vector
graphs with PNG fallbacks. Excel and PowerPoint contain native editable bar
charts and their data. CSV is the numeric/table data, and each graph is also
available as SVG. Ordinary Office readers may paginate differently. The complete
file hashes and input snapshot identity are in `/roadmap/report/export-receipt.json`.

The public page is entered from the shared link catalogue on `/roadmap/`; the
return link uses that same catalogue. The new route is included by the existing
sitemap generator. Company-host behavior and private Access verification retain
their existing tests. Browser journeys follow the actual file downloads on a
loopback HTTP server and compare the bytes with the receipt.
