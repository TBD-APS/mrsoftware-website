# Murph-Inspired Corporate Homepage Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the MR Software corporate homepage with an original editorial, product-led experience supported by ImagineArt assets, factual proof, responsive journeys, and browser-verified accessibility.

**Architecture:** Keep the site static and dependency-light: semantic HTML in `index.html`, shared visual tokens and responsive rules in `css/site.css`, and the existing small navigation script in `js/site.js`. Add a homepage-specific Playwright journey suite alongside the unchanged dashboard UX gate so public and private host behavior remain independently testable.

**Tech Stack:** HTML5, CSS custom properties, vanilla JavaScript, Node.js 22, Playwright Test 1.63.0, ImagineArt-generated WebP/PNG assets, Cloudflare Worker static-asset routing.

**Spec:** `docs/superpowers/specs/2026-10-25-murph-inspired-homepage-design.md`

## Global Constraints

- Work only on `codex/murph-inspired-homepage` in the isolated managed worktree.
- Preserve Workslip as `I drift` and FoodTrading as `Under udvikling · demo`.
- Preserve `3 min.` and `4,6 dage` as process measurements with their current interpretation disclaimer; never present them as savings, ROI, profit, or customer benefit.
- Never expose private dashboard data or request `/_development/` on the public company hostname.
- Keep the shared `tests/ux/ux-gate.pw.mjs` unchanged.
- Use only near-black, warm off-white, white, neutral grey, and the existing MR Software orange through CSS custom properties.
- Use no third-party font, carousel, autoplay video, parallax, scroll-jacking, analytics, CMS, or contact form.
- Support 320, 375, 390, 768, 1024, and 1440 CSS pixels without horizontal overflow.
- Mobile interactive controls are at least 44 px high; body copy is at least 12 px.
- Generated images contain no readable fake product UI, logos, unsafe work, or essential text.
- Merge and deployment require separate explicit approval.

---

### Task 1: Public Homepage Journeys and Factual Contract

**Files:**
- Create: `tests/ux/homepage-journeys.mjs`
- Create: `tests/ux/homepage.pw.mjs`
- Modify: `tests/ux/embedding.pw.mjs`

**Interfaces:**
- Consumes: `startSite()` from `tools/ux-site.mjs` and `prepareContext(context, base)` from `tests/ux/fixtures.mjs`.
- Produces: `homepageJourneys`, entries shaped as `{ id, task, budget, target, expectedHeading }`, plus a public homepage Playwright contract.

- [ ] **Step 1: Define the journeys before changing the screen**

Create `tests/ux/homepage-journeys.mjs`:

```js
export const homepageJourneys = [
  { id: 'understand-company', task: 'Understand MR Software on arrival', budget: 0, target: null, expectedHeading: /Software, der flytter arbejdet fremad/ },
  { id: 'find-solutions', task: 'Find both solutions', budget: 1, target: '#loesninger', expectedHeading: /Software til arbejde, der skal glide bedre/ },
  { id: 'see-results', task: 'See documented process results', budget: 1, target: '#resultater', expectedHeading: /Dokumentation frem for løfter/ },
  { id: 'understand-method', task: 'Understand the four-step method', budget: 1, target: '#metode', expectedHeading: /Fra problem til målbar forbedring/ },
  { id: 'start-contact', task: 'Start a conversation', budget: 1, target: '#kontakt', expectedHeading: /Hvor kan software flytte arbejdet fremad/ },
];
```

- [ ] **Step 2: Write the failing public-homepage journey test**

Create `tests/ux/homepage.pw.mjs` around this loop:

```js
import { test, expect } from '@playwright/test';
import { startSite } from '../../tools/ux-site.mjs';
import { prepareContext } from './fixtures.mjs';
import { homepageJourneys } from './homepage-journeys.mjs';

const publicBase = base => base.replace('dashboard.mrsoftware.dk', 'mrsoftware.dk');

for (const journey of homepageJourneys) {
  test(`${journey.task} (${journey.id})`, async ({ page, context }, testInfo) => {
    const app = await startSite();
    try {
      await prepareContext(context, app.base);
      await page.goto(publicBase(app.base));
      let clicks = 0;
      if (journey.target) {
        await page.locator(`a[href="${journey.target}"]`).first().click();
        clicks += 1;
        await expect(page).toHaveURL(new RegExp(`${journey.target}$`));
      }
      const section = journey.target ? page.locator(journey.target) : page.locator('#main');
      await expect(section.getByRole('heading', { name: journey.expectedHeading }).first()).toBeVisible();
      expect(clicks).toBeLessThanOrEqual(journey.budget);
      const widths = await page.locator('html').evaluate(node => ({ scroll: node.scrollWidth, client: node.clientWidth }));
      expect(widths.scroll - widths.client).toBeLessThanOrEqual(1);
      await testInfo.attach(`${journey.id}-${testInfo.project.name}`, { body: await page.screenshot(), contentType: 'image/png' });
    } finally {
      await app.close();
    }
  });
}
```

Add a focused test that asserts exact Workslip and FoodTrading URLs, `3 min.`, `4,6 dage`, and the phrase `ikke dokumenteret tidsbesparelse, ROI eller kundens økonomiske gevinst`.

- [ ] **Step 3: Update the existing public-host regression**

In `tests/ux/embedding.pw.mjs`, retain the no-private-request and no-iframe assertions, and change the public title and headline assertions to:

```js
await expect(page).toHaveTitle('MR Software | Software der flytter arbejdet fremad');
await expect(page.locator('main h1')).toHaveText('Software, der flytter arbejdet fremad.');
```

- [ ] **Step 4: Run the contract and verify RED**

Run `npm run ux-gate -- --project desktop tests/ux/homepage.pw.mjs tests/ux/embedding.pw.mjs`.

Expected: FAIL because the approved hero and section headings do not exist.

- [ ] **Step 5: Commit the failing contract**

```bash
git add tests/ux/homepage-journeys.mjs tests/ux/homepage.pw.mjs tests/ux/embedding.pw.mjs
git commit -m "test: define corporate homepage journeys"
```

---

### Task 2: Original ImagineArt Asset Set

**Files:**
- Create: `assets/images/homepage/hero.webp`
- Create: `assets/images/homepage/workslip.webp`
- Create: `assets/images/homepage/foodtrading.webp`
- Create: `assets/images/homepage/method.webp` or `assets/images/homepage/method.png` when transparency is available
- Create: `assets/images/homepage/README.md`

**Interfaces:**
- Consumes: the approved art direction and safety checklist.
- Produces: four local assets referenced by `index.html` and `css/site.css`, plus provenance and alt/decorative intent.

- [ ] **Step 1: Generate the hero in ImagineArt**

```text
Original editorial documentary photograph for a Danish B2B software company homepage. A small diverse adult software team connecting office planning with real operational work, candid collaboration around a table in a contemporary Copenhagen workspace, warm natural Nordic daylight, restrained near-black and warm neutral palette with one subtle burnt-orange object, confident and calm rather than startup hype, wide cinematic composition with generous dark negative space on the left for white headline copy, realistic hands and tools, no logos, no readable screens, no text, no watermark, no resemblance to a known campaign. 16:9.
```

- [ ] **Step 2: Generate the Workslip image in ImagineArt**

```text
Original Scandinavian documentary photograph showing a field-service worker and an office coordinator connected by the same practical job workflow, Danish trade environment, phone and paperwork present but no readable screen or text, safe work practice, natural candid body language, warm daylight, restrained industrial textures, premium editorial realism, near-black warm-white and subtle burnt-orange colour accents, no logos, no watermark. 4:3.
```

- [ ] **Step 3: Generate the FoodTrading image in ImagineArt**

```text
Original contemporary documentary photograph of international FMCG trading and logistics, adult buyer and supplier coordinating goods in a clean warehouse-meets-office setting, packaged products without brand marks or readable labels, calm credible business atmosphere, natural light, editorial realism, diverse professionals without stereotypes, warm neutral palette with subtle burnt-orange accent, no logos, no text, no watermark. 4:3.
```

- [ ] **Step 4: Generate the method graphic in ImagineArt**

```text
Original abstract editorial process graphic for a software consultancy: four connected stages represented by precise modular forms moving from observation to construction to automation to measurement, near-black, warm off-white and burnt orange only, strong negative space, clean geometric depth, no letters, no numbers, no icons, no gradients that reduce legibility, no logo, no watermark, suitable for a premium corporate website. Square 1:1, transparent background if supported.
```

- [ ] **Step 5: Save, convert, and verify the selected assets**

Save photographs as WebP at the exact paths above, longest edge at most 2400 px. Keep PNG only for transparent method artwork. Run:

```bash
file assets/images/homepage/*
sips -g pixelWidth -g pixelHeight assets/images/homepage/hero.webp assets/images/homepage/workslip.webp assets/images/homepage/foodtrading.webp
```

Expected: valid decodable images; hero approximately 16:9; Workslip and FoodTrading approximately 4:3.

- [ ] **Step 6: Record provenance and review**

Create `assets/images/homepage/README.md` with generation date, ImagineArt as generator, final prompts, intended alt/decorative role, and checked anatomy, tools, safety, logos, fabricated text, and stereotypes.

- [ ] **Step 7: Commit the asset set**

```bash
git add assets/images/homepage
git commit -m "assets: add original homepage imagery"
```

---

### Task 3: Semantic Editorial Homepage

**Files:**
- Modify: `index.html`

**Interfaces:**
- Consumes: Task 2 asset paths and Task 1 IDs.
- Produces: `#main`, `#problemet`, `#loesninger`, `#resultater`, `#metode`, `#ansvar`, and `#kontakt`, plus stable product and public-information links.

- [ ] **Step 1: Set the approved metadata and hero**

Use exactly:

```html
<title>MR Software | Software der flytter arbejdet fremad</title>
<meta name="description" content="MR Software bygger Workslip og FoodTrading omkring virkelige arbejdsgange — med mindre gentagelse, tydeligere overblik og dokumenterbar effekt.">
...
<section class="hero" aria-labelledby="hero-heading">
  <img class="hero-media" src="/assets/images/homepage/hero.webp" alt="" width="2400" height="1350" fetchpriority="high">
  <div class="hero-overlay"></div>
  <div class="hero-content">
    <p class="eyebrow">Software · arbejdsgange · målbar effekt</p>
    <h1 id="hero-heading">Software, der flytter arbejdet fremad.</h1>
    <p class="hero-lead">Vi omsætter virkelige arbejdsgange til software, der giver overblik, fjerner gentaget arbejde og gør effekten målbar.</p>
    <div class="hero-actions">
      <a class="button button-primary" href="#loesninger">Se vores løsninger <span aria-hidden="true">→</span></a>
      <a class="button button-quiet" href="#resultater">Se dokumenterede resultater</a>
    </div>
  </div>
</section>
```

- [ ] **Step 2: Implement sections 01–06 from the spec**

Add numbered sections, two wide product stories, exact lifecycle text, real product URLs, local environmental images, the two process measures and full disclaimer, an ordered four-step method, three responsibility links, the existing email address with encoded subject, and all existing legal/public links.

Do not add generated readable UI. If verified product screenshots are unavailable, keep product proof as semantic capability text plus the environmental image.

- [ ] **Step 3: Run the homepage contract and verify GREEN for structure**

Run `npm run ux-gate -- --project desktop tests/ux/homepage.pw.mjs tests/ux/embedding.pw.mjs`.

Expected: headline, headings, product destinations, metrics, disclaimer, and hostname isolation pass.

- [ ] **Step 4: Validate internal targets and heading order**

```bash
node -e "const fs=require('fs');const s=fs.readFileSync('index.html','utf8');for(const id of ['main','problemet','loesninger','resultater','metode','ansvar','kontakt']){if(!s.includes('id=\"'+id+'\"'))throw new Error('missing '+id)};if((s.match(/<h1\b/g)||[]).length!==1)throw new Error('expected one h1')"
```

- [ ] **Step 5: Commit the semantic page**

```bash
git add index.html
git commit -m "feat: tell the MR Software product story"
```

---

### Task 4: Responsive Editorial Visual System

**Files:**
- Modify: `css/site.css`
- Modify: `tests/ux/homepage.pw.mjs`

**Interfaces:**
- Consumes: Task 3 classes and IDs.
- Produces: shared CSS variables and responsive homepage layouts while preserving existing public subpage utilities.

- [ ] **Step 1: Add a failing visual-token test**

Add a test that reads computed properties and asserts:

```js
expect(tokens.ink).toBe('#11110f');
expect(tokens.paper).toBe('#f2efe8');
expect(tokens.accent).toBe('#d2542a');
expect(tokens.heroMinHeight).toBeGreaterThanOrEqual(testInfo.project.name === 'phone' ? 620 : 700);
expect(tokens.overflow).toBeLessThanOrEqual(1);
```

Run `npm run ux-gate -- -g "approved visual tokens" --project desktop`.

Expected: FAIL because `--paper` and editorial hero dimensions are absent.

- [ ] **Step 2: Define the approved tokens**

```css
:root {
  --ink: #11110f;
  --paper: #f2efe8;
  --surface: #fff;
  --muted: #67655f;
  --line: #cbc7bd;
  --accent: #d2542a;
  --accent-dark: #a83d1e;
  --on-dark: #f7f5ef;
  --space-1: 4px;
  --space-2: 8px;
  --space-3: 16px;
  --space-4: 24px;
  --space-5: 40px;
  --space-6: 64px;
  --space-7: 96px;
  --radius-image: 12px;
}
```

- [ ] **Step 3: Implement the responsive visual system**

Create the framed dark header, 700–820 px desktop hero, at least 620 px mobile hero, full-bleed media and overlay, editorial rules, alternating surfaces, alternating two-column product stories, typographic metrics, connected method sequence, 44 px controls, anchor scroll margins, explicit image aspect ratios, 320 px safe wrapping, focus styling, and reduced-motion rules. Preserve existing table, badge, note, footer, and subpage utilities.

- [ ] **Step 4: Run desktop and phone homepage journeys**

Run `npm run ux-gate -- tests/ux/homepage.pw.mjs`.

Expected: all homepage journeys and visual assertions pass.

- [ ] **Step 5: Prove the gate detects a defect**

Temporarily set a phone hero action to `min-height: 20px`; run `npm run ux-gate -- --project phone -g "Screen audit"` and expect `small-target`. Restore 44 px and rerun to PASS. Never commit the defect.

- [ ] **Step 6: Commit the visual system**

```bash
git add css/site.css tests/ux/homepage.pw.mjs
git commit -m "style: create editorial corporate homepage"
```

---

### Task 5: Navigation, Accessibility, and Responsive Matrix

**Files:**
- Modify: `tests/ux/homepage.pw.mjs`
- Modify: `js/site.js` only if the existing behavior fails

**Interfaces:**
- Consumes: `#main-nav`, `.nav-toggle`, anchor targets, and existing `setOpen(open)`.
- Produces: proven menu, keyboard, image, reduced-motion, and viewport behavior.

- [ ] **Step 1: Add the phone navigation regression**

```js
test('Mobile navigation opens, closes, and returns focus', async ({ page, context }, testInfo) => {
  test.skip(testInfo.project.name !== 'phone', 'phone behavior');
  const app = await startSite();
  try {
    await prepareContext(context, app.base);
    await page.goto(publicBase(app.base));
    const toggle = page.getByRole('button', { name: 'Åbn menu' });
    await toggle.click();
    await expect(toggle).toHaveAttribute('aria-expanded', 'true');
    await page.keyboard.press('Escape');
    await expect(toggle).toHaveAttribute('aria-expanded', 'false');
    await expect(toggle).toBeFocused();
    await toggle.click();
    await page.getByRole('link', { name: 'Løsninger' }).click();
    await expect(toggle).toHaveAttribute('aria-expanded', 'false');
    await expect(page).toHaveURL(/#loesninger$/);
  } finally {
    await app.close();
  }
});
```

- [ ] **Step 2: Add the six-width matrix**

For `[320, 375, 390, 768, 1024, 1440]`, call `page.setViewportSize`, reload, and assert no overflow, a visible H1, and a primary action at least 44 px high.

- [ ] **Step 3: Add image and reduced-motion checks**

Emulate reduced motion, reload, assert every homepage image is complete with positive `naturalWidth`, and assert computed root `scrollBehavior` is `auto`.

- [ ] **Step 4: Run accessibility and responsive tests**

Run `npm run ux-gate -- tests/ux/homepage.pw.mjs`.

Modify `js/site.js` only for an observed failure; retain `aria-expanded`, Escape focus return, link close, and resize close.

- [ ] **Step 5: Run the complete suite**

Run `npm test`.

Expected: worker tests, private dashboard, shared UX gate, homepage journeys, and responsive checks all pass.

- [ ] **Step 6: Commit interaction proof**

```bash
git add tests/ux/homepage.pw.mjs js/site.js
git commit -m "test: prove homepage accessibility and responsive flows"
```

---

### Task 6: Browser UAT, Factual Review, and Pull Request

**Files:**
- Create: `qa/murph-inspired-homepage-uat.md`
- Modify: `.gitignore` only if new local UAT output needs ignoring

**Interfaces:**
- Consumes: completed local site, Playwright report, approved factual requirements, and browser screenshots.
- Produces: UAT evidence, a green pushed branch, and a ready-for-review pull request.

- [ ] **Step 1: Audit every public claim**

Compare `index.html` with `docs/homepage-business-value-requirements.md` and the spec. Record Workslip and FoodTrading statuses, both measurement interpretations, full disclaimer, product destinations, contact address/subject, and security, validation, status, roadmap, privacy, terms, and deletion links.

- [ ] **Step 2: Run browser UAT**

Open the local public hostname at 1440×900 and 390×844. Capture full-page screenshots and verify the first screen, crop/readability, solution order/status, disclaimer proximity, method steps, focus, mobile menu, no overflow, and no unwanted generated text or logos. Link screenshot paths and `.ux-gate/report/index.html` from `qa/murph-inspired-homepage-uat.md`.

- [ ] **Step 3: Run final verification**

```bash
git diff --check
npm test
git status --short
```

Expected: no whitespace errors, all tests pass, and only the intended UAT report remains before its commit.

- [ ] **Step 4: Commit UAT evidence**

```bash
git add qa/murph-inspired-homepage-uat.md
git commit -m "docs: record homepage browser UAT"
```

- [ ] **Step 5: Re-run the required gate immediately before push**

Run `npm test`. Expected: exit 0. Never use `--no-verify`.

- [ ] **Step 6: Push and open a ready-for-review pull request**

Push `codex/murph-inspired-homepage`, then create a non-draft PR titled `[Feature] Redesign the MR Software corporate homepage`. The body must cover the business reason, original Murph-inspired principles, ImagineArt provenance, factual safeguards, journeys, test evidence, UAT screenshots, and non-deployment status.

- [ ] **Step 7: Watch hosted CI to completion**

Follow required checks on the exact PR head SHA. Fix small in-scope failures on the same branch and rerun tests before every push. Stop with the PR ready for review; do not merge or deploy.

