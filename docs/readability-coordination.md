# Readability pass coordination

Checked against `main` at `02d8ceb` on 2026-11-22.
Linear parent: [SAS-617](https://linear.app/workslip/issue/SAS-617/readability-and-comprehension-on-mrsoftwaredk-graphics-and-plain).
This note is [SAS-623](https://linear.app/workslip/issue/SAS-623/coordination-note-and-overlay-branch-for-the-readability-pass).
OpenCode's plan is `~/.agent-tunnel/state/mrsoftware-readability-plan-2026-11-22.md`. That plan read a homepage from 2026-10-13. Use this note, not that file list.

`docs/**` is in `.assetsignore`, so this file is not a public page.

## Rules for every later pull request

- Link this file and the child issue.
- Say which paths the pull request does not change.
- One child issue per pull request. Two only when they edit the same lines for one reason.
- Do not edit `qa/`. GitHub #85 and #99 are closed, and [SAS-576](https://linear.app/workslip/issue/SAS-576/oprydning-interne-docs-og-qa-filer-ma-ikke-ligge-offentligt-i-repo-og) is still open.
- Do not change published numbers. The homepage clocks are 3 minutes and 4.6 days. The comment above `#results` in `index.html` says not to add, round, or reword them.
- Updated language scope, 22 November 2026: Rasmus requires the entire public company website in both English and Danish. `docs/homepage-business-value-requirements.md` KR-09 and `docs/superpowers/plans/2026-11-22-complete-website-translations.md` supersede the homepage-only interpretation below. English HTML is the layout source; the locale build generates complete Danish counterparts and rejects missing translations. Add Danish dictionary entries for any new copy. The words "Use cases" remain agreed in both languages.
- Text first. A diagram needs the same sequence as visible text or an accessible name.

## Pull requests checked on 2026-11-22

Merged into `02d8ceb`, so they are not owners of a file anymore:

- [#104](https://github.com/TBD-APS/mrsoftware.dk/pull/104) at `f12fba9`. Nav, footer and both homepage overviews say "Use cases" and name Tradey, Shippy, Roady and Producey. The Danish nav uses the English words "Use cases". [#89](https://github.com/TBD-APS/mrsoftware.dk/pull/89) did not change that nav. Leave the wording.
- [#92](https://github.com/TBD-APS/mrsoftware.dk/pull/92) at `1a515ff`. 404 page, favicon and `wrangler.jsonc`. Do not edit those for readability.
- [#91](https://github.com/TBD-APS/mrsoftware.dk/pull/91) at `aac52c6`. The public address is `wp@mrsoftware.dk`. Do not change it.
- [#96](https://github.com/TBD-APS/mrsoftware.dk/pull/96) at `5e77e3f`. `privacy-policy/index.html` covers the public site and foodtrader. Do not edit that page for readability.
- [#89](https://github.com/TBD-APS/mrsoftware.dk/pull/89) at `0cc69ac`. Language decision only, in `docs/homepage-business-value-requirements.md`. No page, nav, or redirect changed.
- [#95](https://github.com/TBD-APS/mrsoftware.dk/pull/95) at `8e9cec3`. `tests/ux/axe.pw.mjs` is on `main`. `css/site.css` has `--muted-on-rose`, `.band-rose .facts p` and `.flow-group.is-field .flow-where`. Do not remove those lines, and do not edit `package.json` or `package-lock.json` for readability.
- [#94](https://github.com/TBD-APS/mrsoftware.dk/pull/94) at `02d8ceb`. The README matches the site. Do not edit the README for readability.

Still open:

| PR | State | What it holds | Readability rule |
|---|---|---|---|
| [#107](https://github.com/TBD-APS/mrsoftware.dk/pull/107) | Open | Hero art under `assets/hero/`, plus `index.html`, `da/index.html`, `css/site.css`, `js/site.js`, `dashboard/handler.mjs`, and the homepage, embedding, and worker tests. | Do not edit those files until #107 lands. |
| [#106](https://github.com/TBD-APS/mrsoftware.dk/pull/106) | Open | `404.html`, `tools/prerender-links.mjs`, `tests/links.test.mjs`, `tests/not-found.test.mjs`, `tests/ux/not-found.pw.mjs`. | Do not edit those files. |
| [#97](https://github.com/TBD-APS/mrsoftware.dk/pull/97) | Open | `products/roady/index.html`, `products/greeny/index.html`, `data/links.json`, `js/site-links.js`, `tests/seo.test.mjs`, `tests/ux/public-pages.pw.mjs` (SAS-565). | Do not edit those files. |
| [#87](https://github.com/TBD-APS/mrsoftware.dk/pull/87) | Open | `products/tradey/index.html` and `products/producey/index.html` (SAS-587). | Do not edit those product pages. |
| #90, #98, #100 | Open drafts, 0 additions | Reserved intent: book-demo form (#90), branch cleanup (#98), Auto Logik case (#100). | Do not take their subjects. |

## Closed numbers from the October plan

These are not live conflicts. Do not treat them as owners of a file.

- #79, #80, #81, #82, #83, #84, #85, #86, #88, #93, and #99 are closed.
- The homepage hero, the rotating headline, the nav, and the product cards are already on `main`. Do not restyle them.
- Hover-only disclosures from #83 are not a pattern to copy. A fold-out must work from the keyboard and stay open without hover.
- Search and social metadata already landed in #78. SEO follow-up remains [SAS-567](https://linear.app/workslip/issue/SAS-567/seo-og-deling-sitemap-robots-og-titlermetaog-pa-alle-sider), not #93.

## What `main` already has

- `index.html` has no `.stat-grid`. The measurements are the two clocks in `#results` (around the heading "Minutes to fill in"). Each clock already has a kicker, a value, a name, a scale, and a context line.
- The homepage block `#solutions` is "Use cases" / "Four examples of software we've built." Do not put a callout inside that block or rename it.
- `da/index.html` has a lead and product sections. It has no clock board and no English stat row. Do not invent Danish figures.
- `sikkerhed-og-dataprivatliv/index.html` already says fail-closed, zero access, evidence, and approval in the lead, then repeats them as cards.
- `sikkerhed-og-dataprivatliv/saadan-validerer-vi-os-selv/index.html` already has `nav.toc` with nine section links. Do not add a second contents list there.
- Tables on the security, validation, and status pages already sit in `.table-wrap` with `tabindex="0"`. Several wraps are named only "Table".
- `roadmap/index.html` is a long list of products. It is not a Q4 2026 / 2027 timeline.
- The words "MOTOR-driven operations" and "plan, do, prove, approve" are not the homepage copy. "fail-closed" is in the security lead. "MOTOR domain" is one cell in the validation table. "evidence" is on the validation page.

## Files each child may change

Branch from `main` at `02d8ceb` or later. Do not revive the closed October pull requests.

| Issue | May change | Leave alone |
|---|---|---|
| SAS-619 callouts | `css/site.css`. `index.html` under the hero lead, outside the rotating headline. `da/index.html` under its lead, in Danish. Both security pages under the existing lead, and only if the callout says something the lead does not. | Hero, nav, product cards, demo box, `#results` numbers, `qa/`. Do not remove `--muted-on-rose` or the two rules that use it. |
| SAS-620 captions | No new grid. If a clock caption is still unclear, edit the existing `.metric-context` in `index.html` and the CSS that styles it. | The numbers 3 and 4.6. `da/index.html`, unless the same clocks are added there by a separate decision. |
| SAS-625 contents | A long page that has no contents nav. The validation page already has one, so it is out of scope unless that nav fails on a phone. | A second list on the validation page. |
| SAS-618 terms | The sentence where a term first appears, on the page that already uses it. At least five terms, chosen from the current copy. | Restoring October vocabulary that the page does not use. Product infographics. |
| SAS-626 diagram A | One inline SVG of the mission flow, on the homepage or the security page, not both until the placement is chosen in the pull request. Same sequence in text. | Hero and `#results`. |
| SAS-621 diagram B | One inline SVG on `sikkerhed-og-dataprivatliv/index.html`: zero access, gates, logging, isolation. The cards above already say this, so the diagram replaces repetition or it does not land. | Product pages. |
| SAS-622 timeline | `roadmap/index.html` and `css/site.css`. Keep every current product block. Mark now, next, and later only where the page already states that status. | New dates that the page does not already give. |
| SAS-624 tables | CSS for at least two existing tables, starting with the validation landscape and the status services table. Give the "Table" regions a real name. | Any cell value. |
| SAS-627 polish | Small icons, `--bg-soft` bands, and read-next cards. After SAS-619, SAS-618, SAS-626, SAS-622, and SAS-624. #95 has landed. | Hero, nav, product imagery, `qa/`. |

## Order

SAS-623 is this note. SAS-625 can start from current `main` if it stays off the files in the open table. SAS-619 and SAS-620 edit `index.html`, and SAS-619, SAS-622 and SAS-624 edit `css/site.css`, so they wait until #107 lands. SAS-618 waits on SAS-619. SAS-626 and SAS-621 wait on SAS-618. SAS-627 is last. #95 has landed, so polish no longer waits on that pull request.
