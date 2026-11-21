# Search visibility

The company marketing site is static HTML served by the existing `mrsoftware`
Cloudflare Worker. It is not Jekyll. Authenticated product apps, the private
dashboard, backoffice and development snapshots are outside this SEO scope.

## Search and sharing metadata

`tests/seo.test.mjs` checks the canonical company pages registered in
`data/links.json`: unique titles, descriptions, canonical addresses and explicit
Open Graph/Twitter images. The existing social image is 1200 by 630 pixels.
The generated roadmap report uses its checked-in HTML head template.

The homepage identifies the existing company as `Organization` and `WebSite`,
with `https://mrsoftware.dk/#organization` as the shared publisher ID.
The three product pages describe their visible software as `SoftwareApplication`.
Research lists the two published documents as proposals (`CreativeWork`, Danish),
not completed clinical validation or peer-reviewed results. Breadcrumbs use real
page addresses. No prices, reviews, ratings or external profile URLs are invented.
Software markup without Google's required price/review evidence does not promise
an app rich result. Validate a released page in Google's Rich Results Test.

The company sitemap excludes redirects to the separate commercial demo host.
See [sitemap ownership](sitemap.md). Existing navigation addresses still work.
Public pages retain their existing English positioning; translated pages and
`hreflang` require real translations and a confirmed target market.

## Lighthouse checks

Install with `npm ci`, then run:

```sh
npm run seo:lighthouse
npm run seo:lighthouse -- --baseline-root /absolute/path/to/base-checkout
npm run seo:lighthouse -- --live
```

The pinned Lighthouse CLI audits the homepage, Workslip and Research on mobile
and desktop. The local comparison serves base and candidate public assets with
the same loopback test server, browser and Lighthouse version. It is an asset
comparison, not a full Cloudflare deployment comparison. `--live` measures only
the public production origin `https://mrsoftware.dk`, in a fresh browser profile.
No login, private dashboard input, API key or deployment credential is used.

The candidate budgets are performance at least 90 and accessibility, best
practices and SEO at 100. Missing categories or browser/runtime errors fail the
check instead of producing a passing score. A run is one sample per page and
profile: scores can vary, and a small change is not proof of a performance gain.

The **Search visibility** workflow compares a PR with its base and measures the
current public site separately. Production results are a non-blocking baseline
on PRs because a source change cannot fix the deployed site before release.
Candidate budgets still block the job. Main is checked as source after merge;
that does not prove deployment. A weekly Monday run and manual runs check the
public production site and fail if its budgets are missed.

Scores, FCP, LCP, Speed Index, TBT, CLS and failed audit identifiers are retained
as selected summaries under `.local/lighthouse*/` and in the Actions artifact.
Raw Lighthouse JSON, request headers, cookies, source snippets and traces are
not persisted or printed. These are lab measurements. They do not establish
field Core Web Vitals, INP, Google indexing, rankings, impressions or traffic.

## Google account setup

Search Console and Business Profile are separate from source-code SEO. Do not
mark either complete without inspecting the actual property/profile and access.

For Search Console, use an owner-approved Google account and add the Domain
property `mrsoftware.dk` at <https://search.google.com/search-console>. Inspect
the existing properties first to avoid duplicates. Verify ownership using the
exact Google-issued DNS TXT record, or Google's existing verified provider flow.
Never replace unrelated DNS records. After verification, submit
`https://mrsoftware.dk/sitemap.xml` in Sitemaps, inspect the homepage, product
pages and Research, and record Google's actual returned indexing status.
Discovery and a sitemap submission do not guarantee indexing.

For Business Profile, first confirm actual in-person customer contact and check
for an existing profile at <https://business.google.com/>. Online-only businesses
are not eligible. A registered address alone does not establish a staffed customer
location. Use only the verified real-world name, contact details, customer-facing
hours and actual address/service area. The owner completes Google's verification;
do not invent hours, reviews, photos, categories or a second location.

Account login/verification and public profile publication remain explicit account
actions; source checks do not prove them. No Ads campaign, paid service, analytics
tracker or new personal-data collection is introduced by this change.

References:

- [Search Console setup](https://developers.google.com/search/docs/monitor-debug/search-console-start)
- [Canonical sitemap URLs](https://developers.google.com/search/docs/crawling-indexing/sitemaps/build-sitemap)
- [Organization data](https://developers.google.com/search/docs/appearance/structured-data/organization)
- [Software app rich-result requirements](https://developers.google.com/search/docs/appearance/structured-data/software-app)
- [Business eligibility](https://support.google.com/business/answer/13763036)
- [Lighthouse](https://developer.chrome.com/docs/lighthouse/overview)
