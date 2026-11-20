# Fact check of public claims, 20 November 2026 (SAS-573)

This review covers release gate 5 in [homepage-business-value-requirements.md](../homepage-business-value-requirements.md). It checks the front page, `/products/*`, `/stories/*` and `/integrations/` against KR-02, KR-03, KR-11 and KR-12, as `main` stood at `802cca4`.

Each claim was compared with the product repositories at their latest `origin` commit:

- Shippy at `43e9ef5`
- Tradey at the `origin/HEAD` fetched on 20 November
- Greeny at `2683ed6`

Each claim gets one verdict:

- **Sourced**: the source supports it.
- **Corrected**: this PR changes the text.
- **Owner**: it needs a source or a decision that only the owner can give.

## Verdicts

### Front page (`index.html`)

| Claim | Requirement | Verdict | Source or reason |
| --- | --- | --- | --- |
| Workslip "Live" | KR-02 | Sourced | KR-02 says Workslip is in operation. `https://app.mrsoftware.dk/` answered 200 on 20 November 2026. |
| Tradey "In development · Demo" | KR-02 | Sourced | The Tradey README describes the React and C# app with unfinished flows tracked in Linear. Nothing in it says the product is in production. |
| Shippy "Demo" | KR-02 | Sourced | Shippy README: "This is a demo with synthetic data and simulated Opter … It is not a production release." |
| 3 min median active completion time; 4.6 days median from creation to approval, 30 days, compiled October 2026 | KR-03, KR-12 | **Owner** | The wording meets KR-03: it is not called a saving, and the caveat sits next to the figures. It meets KR-12: the figures are aggregated, with no person or customer named. But no repository holds the query, date range or export behind the figures. The UAT file and design spec only repeat them. Attach the source, or link to where it is kept. |
| "Potential" section: 3 min per Workslip job, 6 min per Tradey trade, 6 min per Shippy shipment, 15 min for one of each, 2 h 30 min for ten of each | KR-03 | **Owner (fails as written)** | KR-03 forbids a made-up baseline. The 6 min figures assume each Tradey and Shippy "writing" takes 3 min, but that 3 min was measured only in Workslip. The "3 writings become 1" and "2 writings become 1" counts come from product descriptions and were never measured. The section is labelled "not a documented time saving", but the numbers still rest on an invented baseline. Recommendation: remove the section, or keep only the measured 3 min with no multiplication. |
| "Three products" (the platform section) | — | **Owner** | The demo centre now shows five apps (Roady and Greeny too). Either the front page says why it covers three, or it changes. |
| Integration ribbon and "Our products work alongside your ERP, accounting, carrier and customs systems, so data is entered once" | — | **Owner** | Only partly sourced. Shippy reads invoices from e-conomic (off by default; the demo returns "unconfigured"). Tradey has WhatsApp code. Shippy reuses a Vizion tracking client, but it has no credentials. No ERP, customs or warehouse integration was found. The sentence after it ("we confirm what is supported today") softens the claim. |
| No prices | KR-11 | Sourced | No prices appear on the pages checked. The FAQs say "We do not publish prices yet." |
| No personal or customer-identifying figures | KR-12 | Sourced | None found. All named companies are marked as demo data. |

### Products

| Page | Claim | Verdict | Source or reason |
| --- | --- | --- | --- |
| Shippy | "It shares its core for shipments and documents with Tradey"; FAQ: "A food trader and a forwarder see the same shipment from their own side" | **Corrected** | Shippy README: "unchanged Tradey `MrSoftware.Shipping` and optional Vizion source are reused". This is a shared library, not shared data. Nothing lets a Tradey user and a Shippy user see the same shipment. Changed to "reuses the shipping library from Tradey for tracking … separate products with separate data". |
| Shippy | Feature "Customs", state "Demo" | **Corrected** | Shippy has no customs declaration. "Missing customs papers" appears only as free text in a test. State changed to "Not in the demo". |
| Shippy | Feature "Invoicing hand-off: what is needed for the invoice goes to accounting", state "Demo" | **Corrected** | Shippy only *reads* an invoice from e-conomic, for an operator, and the demo returns "unconfigured" (`docs/economic.md`). Nothing is handed to accounting. State changed to "Not in the demo". |
| Shippy | "One shipment, step by step: a demo scenario" (Denmark to Italy by road, steps 03 Customs and 06 Invoice) | **Corrected** | Shippy's demo data is purchase orders by sea (Vejle, Odense, Aarhus and Aalborg to Hamburg) with simulated Opter. Relabelled "An example with synthetic data", with the note "Customs and the invoice step are not in the demo yet." |
| Shippy | Whole page: positioning for road forwarders, customs, invoicing, email intake | **Owner** | The source has a comment: "TODO: confirm with Rasmus that this description, the modules and the demo match Shippy before this goes live." It is live. The page describes the planned product. The demo is a customer portal for purchase orders. Decide whether to rewrite the page to the demo or to keep it as a labelled roadmap. |
| Shippy | "Most of the time goes on paperwork between booking and delivery" | **Owner** | No source. Soften it or give a source. |
| Tradey | Core features, all "In development" | Sourced | Matches the README and the KR-02 status. |
| Tradey | "Services it connects to": WhatsApp Business, e-invoicing provider, live EUR/USD rate feed, bookkeeping | **Corrected** | WhatsApp code exists (`WhatsAppCoexistenceService.cs` and related files). No e-invoicing or bookkeeping code exists. Exchange rates are an input with a freshness check (`FxFreshness`), not a feed. The heading is now "Services it is built to connect to", with "WhatsApp is built into Tradey today. The others are connected during a customer project." |
| Tradey | "One trade, step by step: a demo scenario", steps 05 Invoice and 06 Bookkeeping | **Corrected** | No invoice code exists in Tradey's backend or web app. Relabelled "An example", with "The invoice and bookkeeping steps are not in the demo yet." |
| Tradey | "Most of it is agreed on WhatsApp, by email and in spreadsheets" | **Owner** | A market statement with no source. |
| Workslip | "Live", "Open Workslip" | Sourced | As on the front page. |

### Stories

| Page | Claim | Verdict | Source or reason |
| --- | --- | --- | --- |
| All | "Not a quote from a named customer, and not a measured saving" | Sourced | The disclaimer is on every story. |
| The offer | Demo scenario through invoice and books | **Corrected** | Same as the Tradey product page. |
| The shipment | "It shares its core … with Tradey"; demo scenario with customs and invoice | **Corrected** | Same as the Shippy product page. |
| The choices | "Tradey is used for real with approval on everything … before normal operation" | **Corrected** | It read as if Tradey is in use now, but Tradey is in development. Changed to "Before normal operation, a Tradey system runs as a pilot …" |
| The choices | "Shippy … Documents, customs and status stay with it, including what arrived by email" | **Owner** | Shippy has CSV/XLSX import and file upload, but no email intake and no customs. This is part of the Shippy positioning decision above. |
| The job | The two Workslip figures | **Owner** | Same source gap as on the front page. |

### Integrations

| Claim | Verdict | Source or reason |
| --- | --- | --- |
| "What we connect to: Eight kinds of systems" | **Corrected** | It read as eight working integrations. Changed to "What we can connect: Eight kinds of systems we build connections to." The existing "Availability depends on the product" line stays. |
| Greeny road freight example: 1.5 t × 100 km = 150 t·km, 0.10 + 0.02 kg CO₂e/t·km, 18 kg (15 + 3) | Sourced | It matches Greeny's synthetic `demoShipmentResult` (15 + 3 = 18 kg CO₂e) and is labelled as sample data and sample factors. |
| Excel/CSV and Outlook examples | Sourced | Labelled as sample data that runs in the page. No email is sent. |

## Decisions for the owner

1. **Workslip figures.** Attach where the 3 min and 4.6 days come from: the query, the 30-day window and the export date.
2. **"Potential" section.** Under KR-03 it fails as written. Recommendation: remove it.
3. **Shippy positioning.** Rewrite the product page and its story to the purchase-order portal demo, or keep the forwarder road scenario as a labelled roadmap. This also decides the "customs" and "email intake" wording on the front page, the stories and the product page.
4. **Market statements.** Give a source or soften the two "most of …" sentences.
5. **"Three products"** on the front page, now that five apps are shown in the demo centre.
