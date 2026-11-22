# Complete public website translations

Rasmus requires the whole company website in Danish, replacing the previous homepage-only Danish decision. English remains the default. Each language presents the same content, source figures, product readiness and limitations. The selected Use cases remain Tradey, Shippy, Roady and Producey.

## Acceptance and journeys

| Task | Budget | Result |
| --- | --- | --- |
| Choose Danish or English | 1 click | The same page and section in the chosen language; Back and reload work |
| Open any selected case from the Danish overview | 1 click | A complete Danish case page |
| Read Danish research, security and legal pages | 1 click from their existing navigation | Complete translated page and metadata |
| Use the integration examples | Existing action count | Danish selection, approval and calculation results; no real message is sent |
| Download the Danish roadmap overview | 1 click per existing format | Danish presentation, identical authoritative data, valid snapshot and file receipts |
| Recover from a missing Danish address | 1 click | Danish error page and recovery to the Danish homepage |

## Implementation sequence

1. Audit all public HTML, generated reports, client labels and navigation. Reproduce the English-page leak from the old Danish homepage.
2. Translate the three independent content areas, preserving identifiers, source numbers and status distinctions.
3. Compile complete static `/da/` counterparts. Generate reciprocal per-page language links, local metadata, client labels and shared-catalogue links. Fail the build on missing translations.
4. Export the reviewed roadmap snapshot in both languages. Preserve the admitted content module, numerical dataset, source revision and timestamp. Recalculate receipts after final HTML navigation is added.
5. Verify coverage and missing-copy failures, then real desktop/phone journeys, every public page, no-JavaScript recovery and the full repository gate. Open a review-ready PR and follow CI. Merge and publication remain separate actions.

## Authoring and scope

English HTML is the source layout. Add Danish copy to `data/locales/da-*.json`; use `da-headings.json` when a heading split across animation spans needs a natural Danish sentence. `en-demo.json` normalizes previously mixed demo UI to English before the Danish build. Run `npm run build:reports`, `npm run build:locales` and `npm run check:locales`. `npm test` and deployment both build the complete translations and reject missing copy. Static output is committed except generated report exports.

External product applications and third-party demos have their own language settings. Links to the English commercial application are explicitly labeled in Danish. Research source papers retain their original published language. Private operational dashboards are outside the public company website.
