# Murph-inspired corporate homepage — UAT

Date: 2026-10-25  
Branch: `codex/murph-inspired-homepage`  
Target: MR Software corporate homepage (`index.html`)

## Outcome

The redesigned homepage passes the planned desktop and mobile journeys. The page presents MR Software, Workslip, FoodTrading, documented process measurements, the delivery method, technical responsibility, and contact in one coherent corporate story.

The visual direction takes inspiration from Murph's editorial scale, strong contrast, large photography, and direct calls to action without copying its branding, text, or assets. All four homepage visuals are original ImagineArt generations created for MR Software and reviewed for relevance, anatomy, unwanted text, logos, and watermarks.

## Browser UAT

Browsers were exercised against `http://127.0.0.1:4173/` with the Codex in-app Chromium browser.

| View | Evidence | Checks |
| --- | --- | --- |
| Desktop, 1440 × 900 | [Full-page screenshot](murph-inspired-homepage-desktop.png) | Hero hierarchy, desktop navigation, alternating product layouts, metrics, method graphic, responsibility links, contact, footer |
| Mobile, 390 × 844 | [Full-page screenshot](murph-inspired-homepage-mobile.png) | No sideways scrolling, readable hierarchy, stacked CTAs, product images, metrics, method, contact, footer |

Manual interaction checks:

- The company proposition is visible without a click.
- `Se vores løsninger` lands on `#loesninger` in one click.
- `Se dokumenterede resultater` lands on `#resultater` in one click.
- `Se vores metode` lands on `#metode` in one click.
- Contact links land on `#kontakt` or open the pre-addressed email action.
- The mobile menu opens, exposes all six destinations, closes with Escape, and returns focus to the menu button.
- Lazy-loaded Workslip, FoodTrading, and method visuals load when their sections enter the viewport.

## Claim and link audit

| Item | Published wording or destination | Review |
| --- | --- | --- |
| Workslip status | `I drift` | Explicit product status |
| FoodTrading status | `Under udvikling · demo` | Avoids presenting the demo as a released product |
| Workslip measurement | `3 min.` median active completion time | Presented as an aggregated process measurement |
| Workslip measurement | `4,6 dage` median creation-to-approval time | Presented as an aggregated process measurement |
| Measurement limitation | Not documented time saved, ROI, or customer economic gain; publication requires internal approval of the data basis | Visible directly beneath the measurements |
| Workslip | `https://app.mrsoftware.dk/` | External product destination |
| FoodTrading | `https://foodtrading.mrsoftware.dk/` | External demo destination |
| Contact | `kontakt@mrsoftware.dk` | Subject prefilled for the primary CTA |
| Responsibility | Security, validation, and status pages | Existing local destinations retained |
| Legal | Privacy, terms, and data deletion pages | Existing local destinations retained |

## Automated verification

`npm test` covers:

- Worker routing and private dashboard behavior.
- Five homepage journeys and their click budgets.
- Six responsive widths: 320, 375, 390, 768, 1024, and 1440 px.
- Heading structure, skip-link behavior, mobile navigation, Escape/focus return, minimum touch targets, image loading, reduced motion, and horizontal overflow.
- Existing public-page and dashboard embedding journeys.

The generated Playwright HTML report is available locally at `.ux-gate/report/index.html` after the gate runs.

## Release state

- Implementation: complete on the topic branch.
- Automated tests: green on the topic branch.
- Browser UAT: passed locally with the evidence above.
- Merge: not performed.
- Deployment: not performed.
- Live production behavior: not claimed.
