# Website check and web search for leads

Status: draft for Rasmus's approval, 24 November 2026. Nothing is built yet.

This adds to `2026-11-23-lead-finder-voice-assistant-design.md` (the parent design). Everything
there still applies: advertising protection, no sole proprietorships, no LinkedIn automation,
no people data, confirmation of assistant changes by William, and the CVR-only reason line.

## Decision boundary

Rasmus decided on 24 November 2026:

1. William uses **Firecrawl** to find and qualify leads, in two ways (option 3 of the
   proposal):
   - a **website check** on one company: what its own website says about it;
   - a **web search** that finds new companies from a description in his own words.
   The website check comes first; the web search is the next slice.
2. William finds leads **in plain language through the backoffice assistant**, by voice and
   by typing.

These are the designer's calls, not Rasmus's:

- Facts from a website come from **fixed rules**, not from a language model (option 1 of the
  proposal). See "Approaches".
- Firecrawl is called **only by the commercial Worker**. Its key never reaches the browser
  or the assistant.
- A web search result becomes a company only through a **CVR number shown on the page**,
  and only when that company's main or secondary industry is one of the product's codes.
- A website check keeps **system names and links, not sentences**, because fixed rules
  cannot tell a sentence that names a person. The company's own description is kept as
  written (see "Non-goals").
- The assistant's `check_website` tool returns the system names, whether there is a jobs
  page, and the description. It never returns page text beyond that.
- After an independent builder read: the robots.txt rule covers the website check only;
  text sessions have their own limits; slice 11 belongs to the voice plan, not to the plan
  for slices 9 and 10.

## Why

CVR says what a company is registered as. It does not say what the company actually does,
which system it already uses, or whether it is growing. Those are the facts William wants
before he calls. Industry codes also cannot express a niche such as "carpenters who build
balconies in Aarhus".

Typing filters is slower than saying what he wants. The assistant in the parent design
already has a `find_leads` tool for this; this design adds typed messages and the two
website tools.

Success: William opens a lead and presses **Check website**. Within about ten seconds he
sees the company's own description, the systems its site names, and whether it has a jobs
page, each with a link to the page. He types "carpenters in Aarhus who build balconies",
gets a ranked list of real companies that passed the CVR rules, and saves one as a lead. He
does both by asking the assistant, too.

## Goals

1. A **Check website** button on lead cards and the lead page. The result shows under
   "From the website" with the date it was checked:
   - the company's own description of itself;
   - the systems from a fixed list that the site names, each with a link to the page that
     names it;
   - a link to its jobs page, if it has one.
2. A **web search**: William describes companies in his own words and picks a product.
   Results are only companies whose page shows exactly one CVR number that passes the same
   CVR rules as the lead finder. They are scored, marked when already in the backoffice,
   and saved as leads the same way.
3. **The assistant** gets two tools, `check_website` and `search_web`, and its panel gets a
   text field next to the talk button.
4. **Firecrawl spending never passes the monthly credit cap** Rasmus sets.

## Non-goals

- Crawling whole websites. A website check reads at most three pages.
- Reading LinkedIn, Facebook, Instagram, company directories (Krak, De Gule Sider, Proff
  and similar) or CVR mirror sites.
- People data from websites. Nothing looks for names, and email addresses and phone
  numbers are never stored or shown. The company's own description is kept as written, even
  when it names the owner, as many small companies' descriptions do.
- Summaries written by a language model, Firecrawl's AI extraction, or the agent reading
  raw page text.
- Changing the score with website facts. The score and the reason line stay CVR-only in
  this version.
- Watching websites for changes over time.
- Website facts in the CSV files.

## Anti-goals

The work has failed, even if everything runs, when:

- a website fact is shown that the page does not contain word for word;
- page text beyond the stored facts reaches the agent, the database, a log or a CSV;
- a web search shows a company that has advertising protection, is a sole proprietorship,
  is no longer active, or is not found in CVR;
- a page is linked to the wrong company, for example a directory page that lists many CVR
  numbers;
- the Firecrawl bill passes the cap, or the Firecrawl key reaches the browser, a log or the
  repository;
- reloading or sharing a web search address spends credits again.

## Constraints

- Everything in the parent design's constraints: English UI and code, plain words,
  `ux-flows` journeys and gate, the commercial Cloudflare Worker and D1 `mrsoftware-sales`.
- Firecrawl API v2 at `https://api.firecrawl.dev/v2`, with a Bearer key in the Worker
  secret `FIRECRAWL_API_KEY`. The key lives in Key Vault `kv-mrsoftwarev2-live` as
  `firecrawl-api-key`. Until the secret exists, the button and the search say
  "Website check is not connected yet." and spend nothing.
- Firecrawl prices in credits (24 November 2026; check the pricing page before setting the
  cap):
  - a scraped page costs 1 credit;
  - a search costs 2 credits per 10 results, plus 1 credit for each result it scrapes;
  - AI extraction costs 4 more credits per page and is not used;
  - a URL that Firecrawl routes to a third-party provider can cost more, reported as
    `metadata.provider.creditsCost`.
- The Firecrawl account has auto-recharge off, so the plan's credits are a hard ceiling at
  Firecrawl as well as in the Worker.
- The website URL for a check comes only from CVR, never from the request.
- Both slices use the company shape that `cvrClient.company()` returns today (`mapCompany`
  in `commercial/server/cvr.mjs`: website, advertising protection, company form, status,
  industries, municipality). The Datafordeler rewrite of the CVR client keeps that shape.
  If Datafordeler has no website or no advertising-protection field, the rewrite stops and
  goes to Rasmus. Slices 9 and 10 are built and tested on fixtures in that shape and do not
  wait for the rewrite.

## Approaches

### How website text becomes facts

| | Approach | Trade-off | Verdict |
| --- | --- | --- | --- |
| 1 | **Fixed rules** in the Worker: the description from the page's own metadata, system names from a fixed list, a jobs page from the site's links | Cannot invent anything. Costs 1 to 3 credits per company. Misses facts that no rule covers. | **Chosen** |
| 2 | Firecrawl's AI extraction with a schema, keeping only facts whose quote code finds on the page | Flexible, but costs 5 credits per page, and a model can still summarise wrongly around a true quote | Rejected |
| 3 | The assistant reads the page text itself | Cheapest at Firecrawl, but text written by anyone on the web goes straight into the agent, costs ElevenLabs tokens, and does not work without the assistant | Rejected |

### Where Firecrawl is called

| | Approach | Trade-off | Verdict |
| --- | --- | --- | --- |
| A | **The Worker** calls Firecrawl; the button and the assistant's client tools call the Worker | Key stays on the server, one cap for both, works without the assistant | **Chosen** |
| B | The browser calls Firecrawl directly | The key would be in the browser | Rejected |
| C | Firecrawl as an ElevenLabs server tool or MCP server on the agent | Outside our cap, the agent sees raw pages, no button | Rejected |

### How a web search hit becomes a company

| | Approach | Trade-off | Verdict |
| --- | --- | --- | --- |
| I | **The CVR number on the page.** Danish company websites almost always show it, often in the footer. | Exact. Pages without exactly one CVR number are dropped. | **Chosen** |
| II | Search CVR by the company name on the page | Names are ambiguous; a page could be tied to the wrong company | Rejected |
| III | Match the page's domain to the website field in CVR | CVR has a website for only some companies | Rejected |

## Design

### Website check

- `POST /api/backoffice/leads/<cvr>/website` runs a check. It is a POST because it spends
  credits, and it is refused unless the request comes from the backoffice itself
  (`Sec-Fetch-Site: same-origin`). `GET` on the same path returns the stored result, or 404
  when there is none.
- The Worker looks the company up in CVR (`cvrClient.company(cvr)`) and takes the website
  from there:
  - no website gives 422 "CVR has no website for this company.";
  - a website on an excluded domain (see "Excluded domains") gives 422;
  - the URL must be `http` or `https` with a public host name, not an IP address.
- **Pages.** The homepage is scraped with `formats: ['markdown', 'links']`,
  `onlyMainContent: false`, `location: { country: 'DK', languages: ['da'] }`. From its links
  on the same domain, at most two more pages are scraped:
  - the first link that looks like an about page (`om-os`, `om`, `about`, `virksomheden`);
  - the first link that looks like a jobs page (`job`, `karriere`, `ledige-stillinger`,
    `career`).
- **robots.txt.** In a website check, a page that robots.txt disallows for all user agents
  is not scraped. The builder checks whether Firecrawl already honours robots.txt on scrape.
  If it does not, the Worker reads `/robots.txt` itself first. The web search is not
  covered by this rule: Firecrawl reads the hit pages in the same call, and the Worker
  keeps only the CVR number, the page title and the link from each.
- **Facts.** The Worker keeps only these and discards the page text in memory:
  - `description`: the homepage's `metadata.description`, or else `ogDescription`, with
    white space collapsed, at most 300 characters, word for word;
  - `systems`: each name from the system lists (all products, see "System lists") found as a
    whole word, ignoring case, in any scraped page, with the URL of the page that names it;
  - `jobsPage`: the jobs page URL, if it loaded with a 2xx status;
  - `pages`: the URLs scraped and their status;
  - `checkedAt`.
- **No people data.** A description that contains an email address or a phone number is
  dropped.
- **Storage.** The facts are stored in D1 per CVR number and replaced by the next check. A
  result younger than 30 days is shown without spending anything. An older one is shown
  with its date and a **Check again** button.
- **Activity.** Each check records an event `websiteCheck` with the actor, the CVR number
  and the credits. Like lead searches, these events stay out of "Recent activity".
- **Screen.**
  - The button sits next to **Website** in the lead actions.
  - While it works it shows "Checking website…". The busy state always ends, also after
    errors.
  - The result appears where the button was, on the first screen.
  - The lead page shows the full facts. A card shows one line, for example
    "Mentions Apacta · Has a jobs page", which links to the lead page.
  - Error messages:
    - "The website did not answer. Try again later."
    - "This month's website checks are used up. They reset on 1 December."

### Credit cap

- `FIRECRAWL_MONTHLY_CREDITS` is a Worker variable that Rasmus sets.
- D1 keeps one row per calendar month (UTC) with the credits reserved.
- **Before each Firecrawl call**, the Worker reserves the call's known cost in one
  conditional statement. The statement adds only if the total stays within the cap; if
  nothing was added, the call is refused with 429 and the plain message above. The known
  costs are:
  - a scrape: 1 credit;
  - a search with `limit` results: 2 × ⌈limit / 10⌉ + `limit` credits.
- **After the call**, any provider cost reported beyond the reservation is added. This can
  overshoot the cap by at most one call's provider cost, and the Firecrawl account's own
  limit stops the bill.

### Web search

- `POST /api/backoffice/leads/web-search` with `{ description, product, regions? }`. The
  description is 3 to 200 characters. It is a POST because it spends credits, with the same
  same-origin rule as the website check.
- **Firecrawl search:**
  - query = the description, `country: 'DK'`, `location: 'Denmark'`, `limit: 10`, which
    costs 12 credits;
  - the excluded domains are passed as `excludeDomains`;
  - `scrapeOptions: { formats: ['markdown'], onlyMainContent: false }`, so footers with the
    CVR number are included.
- **Finding the company on each hit:**
  - find 8-digit numbers next to the label "CVR" (also written "CVR-nr.", "CVR nr:" or
    "DK12345678", and with spaces such as "12 34 56 78");
  - keep the hit only if it shows exactly one distinct number;
  - look each distinct number up with `cvrClient.company(cvr)`;
  - apply `usableCompany` (not protected, an allowed company form, active);
  - keep only companies whose main or secondary industry is one of the product's codes, so
    a portal or news site that shows its own CVR number in the footer drops out;
  - if regions were chosen, keep only their municipalities;
  - score with the product's preset;
  - mark companies already in the backoffice and remove duplicates.
- **Results** use the same lead cards. Each card also shows "Found on <domain>" with a link
  to the page. The reason line stays CVR-only.
- **Dropped hits** are counted in a plain line, for example "10 pages found, 4 companies.
  4 pages showed no single CVR number, 2 companies are outside Workslip's industries." so
  William can trust what he sees.
- **An address that does not spend.** Each search is stored in D1 for 30 days with its
  description, product, regions, the CVR numbers found and the page links. The page address
  carries the stored search's id (`leads?webSearch=<id>`), and opening it loads the stored
  result without calling Firecrawl. Back, reload and shared links therefore never spend
  credits. A company's protection is still checked again when it is saved, as today.
- **Screen.** The Leads page gets a second search above the filters:
  - a "Describe the companies" text field;
  - the product;
  - the optional regions;
  - a **Search the web** button that shows its cost in plain words ("Uses 12 of 3,000
    credits left this month").

### Assistant

This extends slice 7 of the parent design, and slice 6 for the text cost policy.

- **New tools:**

  | Tool | Does | Writes |
  | --- | --- | --- |
  | `check_website` | Runs or loads the website check for a CVR number and shows it on screen. Returns the system names, whether there is a jobs page, and the description (at most 300 characters). | No (spends credits) |
  | `search_web` | Runs a web search from a description, product and optional regions, and shows the results on screen. Returns the top five names, scores, reasons and "found on" domains. | No (spends credits) |

- **Limits per conversation.** The tools spend credits but write no backoffice records, so
  they need no spoken yes. Instead the browser allows at most five website checks and two
  web searches per conversation. After that, the tool answers "Limit for this conversation
  reached." The description is text from the web that reaches the agent. These limits, the
  monthly cap and the browser-enforced confirmation of writes bound what an instruction
  hidden in it can do: at most spend this conversation's checks.
- **Typing:**
  - The panel gets a text field and a **Send** button.
  - With no voice call running, sending starts a text-only session
    (`overrides.conversation.textOnly`). Messages go through `sendUserMessage`.
  - The confirmation rule becomes: the browser commits a pending change when William's next
    own input is a clear yes. That input is either the transcript of his microphone or text
    he typed in this field. Agent text and tool results never count.
- **Text session limits and cost.** A text session does not use the 120-second voice limit.
  It ends after 20 messages from William or 10 minutes, whichever comes first. Text-only
  mode and `sendUserMessage` in Boney's `VoiceConversation` belong to slice 5, together with
  `clientTools`. A text session is admitted through the same ledger as a voice call, with
  its own reviewed worst-case cost. The builder confirms ElevenLabs' price for text-only
  sessions in slice 6, and Rasmus approves the policy with the voice policy.

### Excluded domains

A fixed list in code, which the builder may extend: `linkedin.com`, `facebook.com`,
`instagram.com`, `youtube.com`, `google.com`, `krak.dk`, `degulesider.dk`, `proff.dk`,
`cvrapi.dk`, `virk.dk`, `jobindex.dk`, `trustpilot.dk`, `wikipedia.org`. A subdomain of a
listed domain counts as that domain.

### System lists

These are proposals in `commercial/shared/lead-presets.mjs`, and William reviews them in
slice 9:

- Workslip: Ordrestyring, Apacta, Minuba, E-Komplet, Intempus.
- Tradey: Uniconta, e-conomic, Business Central, Navision, Visma, SAP Business One, Odoo.
- Shippy: CargoWise, nShift, Consignor, Shipmondo, Webshipper.

## Slices

These continue the parent design's numbering. Each slice is one pull request and follows
`pr-stack`.

8. This design.
9. Website check:
   - the Firecrawl client and the credit cap;
   - the website-check endpoints and storage;
   - the system lists;
   - the button and the result on the card and the lead page;
   - a UX journey.
   It is built and tested on recorded Firecrawl fixtures and stays off until the key
   exists.
10. Web search:
   - the CVR-number finder;
   - the search endpoint;
   - stored searches;
   - the field on the Leads page;
   - a UX journey.
11. Folded into slices 5 to 7: the `check_website` and `search_web` tools, the text field
    and text sessions. They are planned with the voice assistant, not in the plan for
    slices 9 and 10.

Slice 9 can start now. Slice 10 builds on 9's client and cap. Live use needs the CVR client
on HTTPS (the Datafordeler rewrite) and the Firecrawl key.

## Open for Rasmus

- **The Firecrawl account:**
  - create it and pick a plan (Hobby, about 5,000 credits a month, is enough to start;
    check the pricing page);
  - turn auto-recharge off;
  - store the key with `vault-from-clipboard firecrawl-api-key`.
- **The monthly credit cap.** Proposal: 80 % of the plan's credits.
- **Firecrawl's terms.** Firecrawl receives company website addresses and William's search
  text, never customer data.
- **The privacy information** gets a line about reading public company websites through
  Firecrawl.
- **The cost policy for text sessions**, approved together with the voice policy in slice 7.

## Left to the builder

- The exact link patterns for about and jobs pages, the CVR-number pattern, and the
  timeouts.
- Whether Firecrawl honours robots.txt on scrape (see "Website check").
- The D1 shapes for website checks, stored searches and the monthly counter.
- The tool schemas and the agent prompt lines for the two new tools.
- Card and panel layout within the existing backoffice style.

## Sources

- Firecrawl scrape: https://docs.firecrawl.dev/features/scrape
- Firecrawl search: https://docs.firecrawl.dev/api-reference/endpoint/search
- Firecrawl pricing: https://www.firecrawl.dev/pricing
- ElevenLabs chat mode (text-only sessions):
  https://elevenlabs.io/docs/eleven-agents/guides/chat-mode
- Parent design: `docs/superpowers/specs/2026-11-23-lead-finder-voice-assistant-design.md`
