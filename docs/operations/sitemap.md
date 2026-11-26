# Sitemap and robots

The company Worker serves `https://mrsoftware.dk/sitemap.xml` and
`https://mrsoftware.dk/robots.txt`. Both accept `GET` and `HEAD`. Any other
method returns 405 with `Allow: GET, HEAD`. A `HEAD` response has no body.

`dashboard/handler.mjs` builds the sitemap from `data/links.json`. It lists
every canonical company page from the catalogue places and `sitemapPages`. The public origin is
`https://mrsoftware.dk`. A path that is not a same-site page address is left
out. These prefixes are left out of the sitemap and disallowed in robots:

- `/qa/`
- `/dashboard`
- `/backoffice`
- `/_development/`

`/demos/` and `/pricing/`, including their product routes, are catalogue places.
They have no `index.html` on the company site. The company Worker redirects
them to `https://demos.mrsoftware.dk`. These redirected addresses are excluded
from the company sitemap using the same routing function as the Worker.
The catalogue and customer-facing links keep their existing addresses.
The demo site owns its own canonical URLs; submitting the company sitemap
does not submit or verify that separate hostname.

Robots allows `/` and points at `https://mrsoftware.dk/sitemap.xml`.

If `data/links.json` cannot be read, the sitemap returns 503. A catalogue
change reaches the live sitemap on the next company deploy. A commercial
release does not publish it.

The check is `tests/sitemap.test.mjs`. `tests/seo.test.mjs` scans every
`index.html` on disk outside tooling and private folders. It fails when a
public page that search engines may index is missing from the sitemap, or when
a page or its Danish mirror lacks its own title, description, canonical address
and sharing tags. Add a new public page to `places` or `sitemapPages` in
`data/links.json`.
