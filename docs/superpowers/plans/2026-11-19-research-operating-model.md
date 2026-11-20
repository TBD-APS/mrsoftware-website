# Research and Operating Model Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Publish two reviewed Danish research papers through an English `/research/` page that makes MR Software's evidence-led operating model visible and testable.

**Architecture:** Keep the company site static. Add one semantic page using the shared header, footer and page-body styles; store the PDFs beside it; use the existing link backoffice for the cross-page graph; and extend the existing loopback Playwright server for tests and Kimi Work preview.

**Tech Stack:** HTML5, Node.js 22, Playwright Test 1.63.0, existing CSS and vanilla JavaScript, Cloudflare Worker deployment through the owner-merged release Action.

## Global Constraints

- Keep `/research/` in English and identify both downloads as Danish-language PDFs.
- Present the Donor Network paper as a decision protocol, not completed internal due diligence.
- Do not expose private dashboard snapshots or task data.
- Do not change the visual identity or introduce a parallel cross-page link list.
- Add `/research/` to the shared public-page contract and give it a desktop/phone journey.
- Production requires pull request → Rasmus merges → Deploy owner-merged website Action.
- Merge and deployment require separate explicit confirmation after the change has been shown.
- `npm run dev` must accept `--host` and `--port`; no server may remain running after verification.

---

### Task 1: Research Page Contract

**Files:**
- Create: `tests/ux/research.pw.mjs`
- Modify: `tests/ux/public-pages.pw.mjs`

**Interfaces:**
- Consumes: `startSite()` from `tools/ux-site.mjs` and `prepareContext(context, base)` from `tests/ux/fixtures.mjs`.
- Produces: browser coverage for `/research/`, homepage navigation, table-of-contents anchors and both PDF responses.

- [ ] **Step 1: Add `/research/` to the shared page list**

Insert `'research/',` immediately before `'roadmap/',` in `tests/ux/public-pages.pw.mjs`.

- [ ] **Step 2: Write the failing desktop/phone journey**

Create `tests/ux/research.pw.mjs` with tests that:

```js
import { test, expect } from '@playwright/test';
import { startSite } from '../../tools/ux-site.mjs';
import { prepareContext } from './fixtures.mjs';

const publicBase = base => base.replace('dashboard.mrsoftware.dk', 'mrsoftware.dk');
const papers = ['saassy-medical-platform-research-paper.pdf', 'donor-network-consolidation-research-paper.pdf'];

test('Research opens from the homepage and exposes working sections and papers', async ({ page, context, request }, testInfo) => {
  const app = await startSite();
  try {
    await prepareContext(context, app.base);
    const base = publicBase(app.base);
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.goto(base);
    if (testInfo.project.name === 'phone') await page.locator('.nav-toggle').click();
    await page.locator('#main-nav').getByRole('link', { name: 'How we work', exact: true }).click();
    await expect(page).toHaveURL(/\/research\/$/);
    await expect(page.getByRole('heading', { level: 1, name: 'Evidence before authority.' })).toBeVisible();
    for (const id of ['principles', 'decision-gates', 'evaluation', 'papers']) {
      await page.locator(`.toc a[href="#${id}"]`).click();
      await expect(page).toHaveURL(new RegExp(`#${id}$`));
      await expect(page.locator(`#${id}`)).toBeVisible();
    }
    for (const paper of papers) {
      const response = await request.get(`http://127.0.0.1:${new URL(app.base).port}/research/${paper}`);
      expect(response.status()).toBe(200);
      expect(response.headers()['content-type']).toContain('application/pdf');
      expect((await response.body()).subarray(0, 4).toString()).toBe('%PDF');
    }
    expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(1);
    expect(errors).toEqual([]);
    await page.screenshot({ path: testInfo.outputPath(`research-${testInfo.project.name}.png`), fullPage: true });
  } finally {
    await app.close();
  }
});
```

- [ ] **Step 3: Verify RED**

Run `UX_CHROME="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" npm run ux-gate -- tests/ux/research.pw.mjs`.

Expected: FAIL because the homepage link and `/research/` do not exist.

---

### Task 2: Research Content, Documents and Links

**Files:**
- Create: `research/index.html`
- Create: `research/saassy-medical-platform-research-paper.pdf`
- Create: `research/donor-network-consolidation-research-paper.pdf`
- Modify: `index.html`
- Modify: `sikkerhed-og-dataprivatliv/saadan-validerer-vi-os-selv/index.html`
- Modify through the backoffice: `data/links.json`, `js/site-links.js`

**Interfaces:**
- Consumes: the two reviewed PDFs in the parent task workspace and the existing shared page classes.
- Produces: `/research/`, two same-origin PDF downloads and links from the homepage and self-validation page.

- [ ] **Step 1: Create the semantic page**

Use the shared head metadata, skip link, header and footer. Set canonical to `https://mrsoftware.dk/research/`, exactly one H1 with `Evidence before authority.`, and a TOC linking to `#principles`, `#decision-gates`, `#evaluation` and `#papers`.

Implement four sections:

```html
<section id="principles"><h2>Principles</h2><div class="grid"><article class="card"><h3>One owner, one system of record</h3><p>Every critical object has one authoritative owner and one place where its state is maintained.</p></article><article class="card"><h3>Authority stays separate</h3><p>The component that produces work cannot approve its own production.</p></article><article class="card"><h3>Test breadth over test count</h3><p>Exercise contracts, failure paths, permissions and real user journeys—not only happy-path totals.</p></article><article class="card"><h3>AI proposes, people authorize</h3><p>AI can draft and recommend without granting itself access, approval or release rights.</p></article></div></section>
```

Use `ol.rows` for five numbered gates: discovery, foundation, shadow mode, consolidation, and evaluation/scaling. Use a table for evaluation across security, data quality, workload, adoption and maintainability. Use two `.card.emphasis` articles under `#papers`, each with a Danish-language label and a `download` link to its PDF. State that the Donor Network paper is a decision protocol, not completed internal due diligence.

- [ ] **Step 2: Copy the reviewed documents**

Copy the existing workspace PDFs to the two exact `research/` paths without changing their content. Verify that both begin with `%PDF`.

- [ ] **Step 3: Connect the public journeys**

Add `How we work` to homepage navigation and Resources footer. Add a text link to `/research/` in the `We publish how we work.` section. Add a short `Research and operating model` section and TOC entry on the self-validation page.

- [ ] **Step 4: Update the graph through the backoffice API**

Run `node tools/link-backoffice.mjs`, read `GET /api/links`, append place `{ id: 'research', title: 'How we work', href: '/research/', summary: 'The evidence, gates and research behind how MR Software builds and learns.' }`, append `{ id: 'to:research', toId: 'research', label: 'How we work' }` to `links.home`, and POST the complete graph to `/api/links`. Stop the server immediately afterwards.

- [ ] **Step 5: Verify GREEN**

Run the Task 1 command. Expected: both desktop and phone journeys pass, including both PDF signatures.

---

### Task 3: Preview, Full Gate and Reviewable Release

**Files:**
- Create: `tools/dev-server.mjs`
- Modify: `tools/ux-site.mjs`
- Modify: `package.json`

**Interfaces:**
- Consumes: the existing `startSite` loopback server.
- Produces: `npm run dev -- --host <host> --port <port>` with PDF MIME support and no dashboard behavior changes.

- [ ] **Step 1: Extend the shared server without changing defaults**

Change the signature to `startSite({ roadmapHtml, host = '127.0.0.1', port = 0 } = {})`, listen with `server.listen(port, host, resolve)`, and add `'.pdf': 'application/pdf'` to `types`.

- [ ] **Step 2: Add the preview entry point**

Create `tools/dev-server.mjs` to parse `--host` (default `127.0.0.1`) and `--port` (default `7100`), call `startSite({ host, port })`, print `http://localhost:${port}/`, and close cleanly on SIGINT/SIGTERM. Add `"dev": "node tools/dev-server.mjs"` to `package.json`.

- [ ] **Step 3: Verify the preview and stop it**

Run `npm run dev -- --host 127.0.0.1 --port 7100` temporarily, request `/research/` and both PDFs, then terminate the exact process and verify port 7100 is closed.

- [ ] **Step 4: Run all regression checks**

Run `npm test` with `UX_CHROME` set to the installed Chrome. Expected: unit, backoffice, desktop and phone tests all pass. Inspect the research desktop and phone screenshots for content order, wrapping and visible paper links.

- [ ] **Step 5: Prepare the reviewed pull request**

Review `git diff --check`, `git status --short` and the complete diff. Commit all intended files, push `feature/research-operating-model`, and create a PR titled `Add research and operating model`. Do not merge or deploy until Rasmus explicitly confirms after reviewing the PR.
