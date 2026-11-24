# Lead finder and voice assistant for the sales backoffice

Status: draft for Rasmus's approval, 23 November 2026. Nothing is built yet.

## Decision boundary

Rasmus decided on 23 November 2026:

1. William gets a **lead finder** in the sales backoffice (`backoffice.mrsoftware.dk`):
   pick a product, a region and a company size, get matching companies from the Danish
   company register (CVR) with a score and a reason, save chosen ones as leads, and
   download the list as CSV.
2. William gets a **voice assistant** in the backoffice that can use the backoffice API.
3. **The backoffice holds its own ElevenLabs key and its own monthly cap now**, like Guessy
   does. When the hosted Voicy service runs, the assistant moves to it. This is a
   deliberate exception to the 20 November 2026 decision that hosted Voicy is the only
   holder of the ElevenLabs key (`TBD-APS/boney`,
   `docs/superpowers/specs/2026-11-20-voicy-customer-service-design.md`).

4. **The monthly cap holds through a reviewed worst-case cost per call** for a pinned
   ElevenLabs model (see "Server").
5. **No sole proprietorships** in lead results in this version (see "Search").

Rasmus did not pick the LinkedIn Sales Navigator CSV format (option 3 of the earlier
proposal). It is a non-goal here.

After an independent builder read, these were settled as the designer's calls, not
Rasmus's: confirmation of voice changes is enforced by browser code, not the prompt; and
advertising protection is checked at search and again at save, not later.

Each slice below is its own pull request. Merge, production release, Worker secrets,
provider accounts and spending each still need Rasmus's go, as in the existing release
process for this site.

## Intent

William sells Workslip, Tradey and Shippy. Today the backoffice holds customers,
opportunities, quotes and the catalogue (SAS-561). Every customer has to be typed in by
hand or arrive through the public enquiry form. There is no way to find companies that fit
a product, and no way to get a list out.

The lead finder turns "who should I call about Workslip in Aarhus?" into a short, ranked
list of real companies, each with a plain reason, so William can save the best ones
straight into his Today queue or take the list to Excel or LinkedIn.

The voice assistant lets William ask the backoffice things and add small things by
speaking: what is due today, what we know about a customer, find leads, add a note, set a
follow-up.

Success: without a developer, William finds 20 fitting companies for one product and
region, saves five as leads that appear in Today, downloads a CSV, and asks the assistant
by voice what is due today and adds a note to a customer.

## Goals

1. Search CVR by product, region and size from the backoffice. Results are ranked with a
   score from 0 to 100 and a one-line reason built only from CVR facts.
2. Companies that have registered advertising protection (reklamebeskyttelse) in CVR never
   appear in results. This cannot be switched off.
3. Companies already in the backoffice are marked, matched by CVR number.
4. "Save as lead" creates the customer and an opportunity with a follow-up date, so the
   lead shows in Today.
5. "Find on LinkedIn" opens LinkedIn's own company search for that name in a new tab.
6. CSV download of a result list and of saved customers and opportunities, opening
   correctly in Danish Excel.
7. A talk button in the backoffice starts a voice conversation in Danish. The assistant
   can read Today, customers, opportunities and leads, and can save leads, add notes and
   set follow-ups after reading the change back and hearing William say yes.
8. Voice spending never passes the monthly cap Rasmus sets.

## Non-goals

- Collecting, scraping or automating anything on LinkedIn. Only a link to LinkedIn's own
  search. Automation breaks LinkedIn's user agreement and puts William's account at risk.
- The Sales Navigator account-list CSV format.
- Sending email or SMS to leads. Danish marketing law (markedsføringsloven § 10) forbids
  unsolicited electronic marketing to companies too. Leads are for phone calls, personal
  LinkedIn contact and meetings.
- People data. The lead finder works with companies. It does not look up employees or
  decision makers.
- Roady, Greeny and Producey. Opportunities accept only `workslip`, `tradey` and `shippy`
  today; adding products is a separate change.
- Voice changes to quotes, prices, quote status, the catalogue, or deleting anything. Those
  stay as clicks.
- A voice assistant for website visitors or customers. That is Voicy's job.
- Analysis of William's own pipeline (conversion, win rate). The sales database is nearly
  empty; this comes later when there is data.

## Anti-goals

The work has failed, even if everything runs, when:

- a company with advertising protection at the time of the search or the save reaches a
  result list, a results CSV or a saved lead;
- the assistant changes data without William having confirmed that exact change;
- the ElevenLabs bill for the backoffice passes Rasmus's monthly cap;
- the CVR password or the ElevenLabs key reaches the browser, a log, a CSV or the repository;
- a reason line states something CVR does not say (for example "uses paper timesheets");
- a CSV cell runs as a formula when opened in Excel.

## Constraints

Everything in "Binding constraints" of
`docs/superpowers/specs/2026-11-19-demos-pricing-sales.md` still applies: Cloudflare Access
identity on every private request, `private, no-store`, same-origin JSON writes with the
`X-Requested-With` header, revision checks with 409 on stale edits, every record
addressable, 1440 px and 390 px layouts, busy states that always end, `npm test` and the UX
gates green, no `--no-verify`.

Also:

- English UI and code, plain words (`AGENTS.md`).
- Public pages keep loading no React. React may load on the private backoffice only.
- The backoffice nav has five items today (Today, Customers, Sales, Quotes, Catalogue).
  The phone limit is five, so adding Leads moves one item behind "More" on phone.
- The voice package is consumed as a reviewed Boney tarball with its manifest, the same
  way `@mr-software/elevenlabs` is today (`vendor/boney/`). No copied package source.
- No live CVR or ElevenLabs calls in CI. Tests use recorded fixtures and a fake SDK.

## Approaches

### Where lead data comes from

| | Approach | Trade-off | Outcome |
| --- | --- | --- | --- |
| A | CVR system-to-system access from Erhvervsstyrelsen (Elasticsearch, username and password) | Official, free, has industry code, size band, address, advertising protection. Rasmus must apply for the login. | **Chosen** |
| B | A paid CVR API (for example cvrapi.dk) | No application, but costs money, has its own terms, and often lacks the advertising-protection flag. | Rejected |
| C | Scraping company websites or LinkedIn | Breaks site terms, unreliable, legal risk. | Rejected |

### How results are scored

| | Approach | Trade-off | Outcome |
| --- | --- | --- | --- |
| A | Fixed rules on CVR fields, with the reason built from the same fields | Predictable, free, never invents facts. Cannot judge "fit" beyond what CVR knows. | **Chosen** |
| B | A language model writes the score and reason | Richer text, but costs per search and can state things CVR does not say (anti-goal). | Rejected for now |

### How the assistant reaches the backoffice API

| | Approach | Trade-off | Outcome |
| --- | --- | --- | --- |
| A | ElevenLabs **client tools**: the agent asks William's browser to run a tool, the browser calls the backoffice API with William's own Cloudflare Access session | Every call is William's, with his rights, and the activity log shows him. No new credential through Cloudflare Access. Needs `clientTools` support added to Boney's `VoiceConversation`. Works only while the backoffice tab is open, which is the use case. | **Chosen** |
| B | ElevenLabs **server tools**: ElevenLabs' servers call the backoffice API | Needs a service credential through Cloudflare Access. The actor is "the agent", not William. Customer data is reachable by an outside caller. | Rejected |
| C | A custom language model endpoint in the Worker that runs the tools itself | Most control, but needs another model key and far more code. | Rejected |

### Who holds the ElevenLabs key

Rasmus chose option 1: the commercial Worker holds the key as a Worker secret, with its own
monthly cap, using `@mr-software/voice/server` and `@mr-software/voice/cloudflare` (the
same path Guessy uses). It moves to hosted Voicy when Voicy runs.

## Lead finder

### Search

The screen "Leads" (`/backoffice/?view=leads`) has one form:

- **Product:** Workslip, Tradey or Shippy. Picking one fills the industry codes from that
  product's preset. William can remove or add codes before searching.
- **Region:** one or more of the five Danish regions, or municipalities.
- **Size:** employee bands from CVR (for example 1, 2–4, 5–9, 10–19, 20–49, 50–99, 100+).
- Only active companies. Companies with advertising protection are always left out, by
  the server, in the CVR query itself.
- No sole proprietorships (enkeltmandsvirksomhed) or other company forms where the owner
  is a person carrying the business in their own name (decided by Rasmus, 23 November
  2026). Their name, address and phone are the owner's personal data, and Workslip is made
  for teams. Including them later needs a privacy decision first.

The search parameters are in the URL, so Back, reload and a shared link show the same
search. The server queries CVR, maps the fields it needs, scores and returns at most 100
results. Nothing from CVR is stored until William saves a lead. The search itself is
recorded as an event (actor, parameters, result count), not the results.

**Industry presets** (DB07 codes) live in one reviewed file in the repository. Each
product's preset cites the product page it comes from. These are proposals for the builder
to check against the published product pages and for William to review in the pull
request:

| Product | Proposed codes | From |
| --- | --- | --- |
| Workslip | Construction and trades, for example 41.20, 43.21, 43.22, 43.32, 43.34, 43.91, 43.99 | Workslip pages: craftsmen and field teams |
| Shippy | Road freight and forwarding, for example 49.41, 52.29, 53.20 | Shippy pages: delivery and proof of delivery |
| Tradey | Food and drink wholesale, for example 46.31–46.39 | Tradey pages: food trading |

### Score and reason

The score adds fixed points, documented next to the presets:

- the company's main industry code is in the preset (high), or only a secondary code is
  (lower);
- employee band inside the product's sweet spot;
- inside the chosen region;
- company older than two years;
- CVR lists a website or phone number.

The reason is a short line built from the same facts, for example "Carpentry (43.32),
10–19 employees, Aarhus, founded 2014, website listed". Nothing else goes in it.

### Result list and detail

Each result is a card: company name, CVR number, industry, employee band, city, score,
reason, and "Already in backoffice" when the CVR number matches a saved customer. Clicking
the card opens the company's detail at its own address (`?view=lead&cvr=<number>`).
The card and the detail have:

- **Save as lead.** Asks for the follow-up date (default the next working day) and saves.
- **Find on LinkedIn.** Opens
  `https://www.linkedin.com/search/results/companies/?keywords=<company name>` in a new tab.
- **Open website**, when CVR lists one.

### Save as lead

One server call creates, in one batch with events:

- a customer with the company name, the CVR number (new optional `cvr` field on the
  customer document, eight digits, unique among customers), the company phone and email
  from CVR as a contact without a person name, and the note "Found with the lead finder
  on <date>. Reason: <reason>";
- an opportunity for the chosen product, titled "<Product> lead", in a new first stage
  `lead` (shown as "Lead"), with the chosen follow-up date, so it appears in Today.

Before saving, the server looks the company up in CVR again by its number. If it now has
advertising protection, or CVR cannot be reached, nothing is saved and William sees why.
Saved leads are not checked again later. Customers who contacted us through the enquiry
form or were typed in by hand have no CVR number and are not covered by this rule; they
are not CVR marketing data.

Saving a company that is already a customer opens that customer instead of creating a
second one. Both records are JSON documents, so no table migration is needed; validation,
stage lists, views and Today change. The customer edit form replaces the whole saved
record, so it must carry `cvr` through (shown read-only) or an edit would drop it.

### CSV

- **Results CSV:** the current result list. Columns: company, CVR, industry code,
  industry, employees, address, postcode, city, website, phone, score, reason, LinkedIn
  search link.
- **Customers CSV and Sales CSV:** saved customers and opportunities with their main
  fields and record links.
- UTF-8 with byte-order mark, semicolon separator, CRLF line ends, so Danish Excel opens it
  with æ, ø and å intact.
- Any cell that starts with `=`, `+`, `-`, `@`, tab or carriage return is prefixed with an
  apostrophe so Excel never runs it as a formula.
- Served from GET endpoints behind Access with `private, no-store` and a dated file name.
  Each download is recorded as an event.

## Voice assistant

### Boney change

`@mr-software/voice/elevenlabs-react` `VoiceConversation` gains an optional `clientTools`
prop: a map from tool name to an async function that takes the tool's parameters and
returns a string. It is passed to the ElevenLabs session. Each tool call has a time limit
and returns a short error text on failure instead of throwing. The tools are configured as
blocking in the agent, so the agent waits for the answer. Boney releases a new package
version with its manifest; this site pins it.

### Server

- `POST /api/backoffice/voice/session` checks the Access identity, then admits the call
  through `VoiceBudgetLedger` (a Durable Object, new binding on the commercial Worker) and
  `issueBudgetedConversationToken` with the pinned agent id and version. It returns only
  `{token, maxSeconds}`.
- Secrets on the commercial Worker: `ELEVENLABS_API_KEY`. Settings: the monthly cap in USD,
  the agent id and version, and the reviewed cost policy. A missing secret or setting, or
  an expired or mismatched policy, turns the talk button off with a plain message; it never
  fails open.
- **How the cap holds with tools (decided by Rasmus, 23 November 2026).** Client tools need
  ElevenLabs' own language model; Boney's Workers AI model path forwards no tools, and the
  duration counter alone does not cover variable model charges. So the agent pins one
  ElevenLabs model with a maximum response length, and the builder calculates the
  worst-case all-in cost of one 120-second call (voice minutes plus the most model tokens
  that call can use). That number, with its calculation and the provider pricing page it
  rests on, becomes the reviewed `maxSessionUsd` cost policy for that exact agent version.
  Rasmus approves it. Each call reserves that amount before it starts, so the cap holds even
  if usage is never reported back. A new agent version, or the policy's expiry, turns the
  talk button off until a new policy is approved.
- A conversation lasts at most 120 seconds (the package's reviewed limit). William starts
  a new one when it ends. Raising the limit is a Boney change.

### Agent

The agent's prompt, Danish voice, language model choice and tool definitions are kept as
a file in this repository, and a script creates or updates the agent in ElevenLabs and
records the new version id in the settings. Tools:

| Tool | Does | Writes |
| --- | --- | --- |
| `today` | Reads William's Today queue | No |
| `find_customer` | Finds customers by name, returns name, stage, next follow-up and the last note lines | No |
| `open_record` | Opens a customer, opportunity, quote or lead on screen | No |
| `find_leads` | Runs a lead search and shows it on screen; returns the top results with reasons | No |
| `save_lead` | Saves a lead from the current results with a follow-up date | Yes |
| `add_note` | Adds a dated line to a customer's or opportunity's notes | Yes |
| `set_follow_up` | Sets an opportunity's next follow-up date | Yes |

Rules for writing tools. Confirmation is enforced by code in the browser, not by the
agent's prompt, because text typed by the public reaches the agent: the enquiry form's
message is saved as opportunity notes, and the read tools return notes.

- A writing tool never writes. It only creates a **pending change** and shows it on screen
  as a card with the exact change, then returns "waiting for William's answer".
- The agent says the change aloud ("I will add the note 'Call back Thursday' to Hansen
  VVS. OK?").
- The browser commits the pending change only when William's **next spoken turn**, taken
  from the user transcript of his own microphone and never from agent text or tool
  results, is a clear yes ("ja", "yes", "gør det", "ok"), or when he clicks Confirm on the
  card. A no, anything else, a new tool call, or the end of the call cancels it.
- No tool lets the agent commit. At most one pending change exists at a time.
- After the commit, the change shows on screen with a link to the record.
- The activity log records the actor as William with the source "assistant".
- Notes are appended with a revision check; a stale record is reported, not overwritten.

Tool results carry only what the agent needs: names, stages, dates and at most the last
500 characters of notes. Contact emails and phone numbers are not sent unless William asks
for them.

### Screen

An "Assistant" button in the backoffice header opens a panel with the talk button, the
transcript and the latest change. React loads only for this panel on the private site.

## Slices

Each slice is one pull request and follows `pr-stack`.

1. This design.
2. CVR client, presets, scoring and the search endpoint, with recorded CVR fixtures.
3. Leads screen, lead detail, save as lead (customer `cvr`, stage `lead`, Today), the
   phone "More" menu, and the UX journeys.
4. CSV downloads.
5. Boney: `clientTools` in `VoiceConversation`, new package release.
6. Voice session endpoint, ledger Durable Object and settings, off until the secrets exist.
7. Agent definition and script, assistant panel and tools, UX journey with a fake SDK.

Slices 2 to 4 do not wait for the voice work, and slice 5 can run alongside them.

## Open for Rasmus

- Apply for CVR system-to-system access by writing to Erhvervsstyrelsen
  (cvrselvbetjening@erst.dk), then add the username and password as Worker secrets.
  Slices 2 to 4 are built and tested on fixtures meanwhile.
- An ElevenLabs key for the backoffice, the monthly cap in USD, and acceptance of
  ElevenLabs' data processing terms, since customer names and notes pass through it during
  a call.
- Approval of the worst-case cost per call (the `maxSessionUsd` policy) for each agent
  version, in slice 7.
- A line in the privacy information about company data taken from CVR and voice calls
  handled by ElevenLabs.
- William reviews the industry presets in slice 2.

## Left to the builder

- The CVR query, fields and timeouts, checked against Erhvervsstyrelsen's documentation.
  Use HTTPS if CVR offers it. If the endpoint only accepts the password over plain HTTP,
  stop and bring that to Rasmus.
- Exact score points, employee bands, CSV column order and file names.
- Which nav item goes behind "More" on phone (proposal: Catalogue, the least used).
- Tool schemas, the agent prompt, the voice and the language model.
- Card and panel layout within the existing backoffice style.

## Sources

- Erhvervsstyrelsen, getting started with Elasticsearch (CVR system-to-system):
  https://erhvervsstyrelsen.dk/kom-godt-igang-med-elasticSearch
- Erhvervsstyrelsen, CVR: https://erhvervsstyrelsen.dk/det-centrale-virksomhedsregister-cvr
- ElevenLabs client tools:
  https://elevenlabs.io/docs/agents-platform/customization/tools/client-tools
- ElevenLabs React library: https://elevenlabs.io/docs/eleven-agents/libraries/react
- Boney voice package: `TBD-APS/boney` `packages/voice/README.md`
