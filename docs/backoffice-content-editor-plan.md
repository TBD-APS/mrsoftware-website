# Backoffice content editor – plan (main nav + prioriteter)

## Formål
Gøre udvalgte, ofte opdaterede tekster på `mrsoftware.dk` redigerbare via lokal backoffice (`npm run links`) i stedet for at redigere HTML direkte. Denne plan dækker **main navigation**-sider og relaterede “pilot” områder.

**Ikke mål i første omgang:** hele sider, komplekse diagrammer/SVG, interactive demos (`integrations.js`, `status.js`), produktdetaljer med mange kort/sektioner i én omgang.

## Nuværende stand (allerede implementeret på branch `feat/fede-cta-er`)

| Område | Datafil | Render/flow | Redigerbart i backoffice |
|--------|--------|-------------|---------------------------|
| Forside CTA (`#get-started-cta`) | `data/site-content.json` (`homepageCta`) | `tools/render-content.mjs`, markers i `index.html` | Eyebrow, heading, lead, primary/secondary label+href |
| Forside “Get started” (`#contact`) | `data/site-content.json` (`homepageContact`) | samme | Eyebrow, heading, lead, knapper |
| Forside Stories-intro | `data/site-content.json` (`homepageStories`) | samme | Eyebrow, heading, lead |
| Forside Stories-kort (4 stk.) | `data/site-content.json` (`homepageStoriesCards`) | samme | Titel, href, tekst pr. kort |
| Stories heroes (`/stories/` + 4 undersider) | `data/stories-content.json` | `tools/render-stories.mjs` + markers | H1, lead, label pr. side |
| Nav-heroes (Integrations/Research/Roadmap/Status hero) | `data/nav-heroes.json` | `tools/render-nav-heroes.mjs` + markers | Se nedenfor |
| Integrations sub-sektioner (delvis) | `data/nav-heroes.json` (`integrations.*`) | samme script | `sectionLabel`, `sectionHeading`, `buildLabel`, `buildHeading`, `ctaHeading`, `ctaLead` (resten af siden hårdkodet) |

Kørsel: `npm run links` starter backoffice (Vite). Scripts kan også køres manuelt (`node tools/render-content.mjs`, `node tools/render-stories.mjs`, `node tools/render-nav-heroes.mjs`).

## Sprog og locale-strategi (vigtig beslutning)

**I dag:** Scripts og backoffice redigerer **EN-kildesider** (fx `index.html`, `integrations/index.html`, `stories/*.html`). `tools/locales.mjs` / `npm run build:locales` genererer DA-sider under `da/…` og oversætter/transformerer markup efter egne regler. Ændringer i EN-kilder påvirker derfor typisk DA ved næste locale-build **hvis** tekst matcher kendte mønstre — ellers kan der opstå drift.

**Anbefalet strategi (vælg én og dokumentér i PR):**

1. **EN-first + kør locale-build efter indholdsskift** (lav indsats, risiko for manuelle rettelser i `da/` går ned hvis man aldrig redigerer `da/` direkte).  
   - Fordel: ét sæt redigerbare felter.  
   - Ulempe: nye/ukendte strenge kan kræve opdatering i `tools/locales.mjs`.

2. **Per-locale datafiler** (fx `site-content.da.json` + separate render-trin eller udvidet render til `da/*.html`).  
   - Fordel: fuld kontrol pr. sprog.  
   - Ulempe: dobbelt arbejde, større kodeændring, risiko for divergens.

**Anbefaling nu:** **Strategi 1** som standard for nye felter, med note i backoffice/UI om at DA opdateres via `npm run build:locales` når relevant. Overvej **Strategi 2** først for sider hvor DA-tekst allerede markant afviger fra EN (skal vurderes pr. side).

## Prioriteret backlog (main nav)

### Prioritet A – hurtige gevinster (små, afgrænsede)
| ID | Side(r) | Hvad | Forslag data/markup | Bemærk |
|----|---------|------|---------------------|--------|
| A3 (done conceptually) | denne fil | Plan | `docs/backoffice-content-editor-plan.md` | Gør dette dokument levende ved hver større batch. |
| A4 | `/roadmap/` | “Greeny showcase”-blok (tekst + primær/sekundær link-tekst/href hvis ønsket) | Udvid `data/nav-heroes.json` eller ny `data/roadmap-content.json` + markers i `roadmap/index.html` | Stor markup omkring; start kun med overskrift/2–3 linjer + link-labels. |
| A5 | `/research/` | Note-boks + evt. TOC-tekster | Overvej; ofte lav værdi vs. risiko | Kan vente. |
| A6 | Forside | “Use cases”-introsektion (eyebrow/heading) hvis ikke dækket | Tjek `index.html`; muligvis nyt felt i `site-content.json` | Afsæt særskilt. |

### Prioritet B – mellemstore (kræver flere markers eller omstrukturering)
| ID | Side(r) | Hvad | Bemærk |
|----|---------|------|--------|
| B1 | `/integrations/` | Udover nuværende: beskrivelser under demo-sektioner? | Kræver omhu pga. `integration-examples.js` og struktur. |
| B2 | `/stories/the-offer|the-job|the-shipment|the-choices` | Flere sektioner end hero (f.eks. “The day”, “The choice” intros) | Delvis overlap med eksisterende `render-stories.mjs`; udvid felter pænt. |
| B3 | Produktsider i nav (`/products/*`, demo-links) | Kort intros | Varieret markup; lav per produktside eller gruppe. |

### Prioritet C – større / senere
| ID | Område | Bemærk |
|----|--------|--------|
| C1 | Flest “body”-sektioner på main-nav-sider | Kun hvis der er tydelig redaktionel behov; ellers hold i repo/PR. |
| C2 | Per-locale data (Strategi 2) | Kun hvis Strategi 1 giver for meget manuelt arbejde i `da/`. |
| C3 | Preview/rollback i backoffice | Nice-to-have (i dag: git diff + manuel). |

## Tekniske konventioner (anbefalet)
- **Markers:** `<!-- CONTENT:<pageOrBlock>:start -->` / `end`, HTML-kommentarer, stabile over locale-build hvor muligt.
- **JSON:** Én “source of truth”-fil per domæne (`site-content.json`, `stories-content.json`, `nav-heroes.json`) frem for én kæmpe fil, medmindre der er klar fordel.
- **Rendering:** Render-scripts validerer markers (fejl hvis mangler) og escaper tekst. Knap-URL’er skal fortsat valideres som i dag (ingen `javascript:` osv.) hvis felter bruges i href.
- **Backoffice UI:** Grupper felter pr. side/blok, korte hjælpetekster (“Gemmer til …”), og undgå at eksponere alt på én gang hvis det bliver uoverskueligt.
- **Tests:** Mindst smoke-check efter større ændringer: `npm test` hvor relevant, og `npm run ux-gate` før merge (kræver `npm ci`).

## Definition of done for en ny “batch” (A/B)
1. Markers sat (eller bekræftet) i relevante HTML-filer.
2. Datafelter defineret i JSON + defaults i render-script.
3. Render-script opdaterer korrekt; backoffice kan læse/skrive (hvis relevant).
4. `git status` gennemgået, commit besked beskriver batch (fx `feat(backoffice): ...`).
5. PR #123 (eller relevant PR) opdateret med kort note om hvad der er redigerbart nu.
6. Note om locale-strategi: “EN-kilde opdateret; kør `npm run build:locales` hvis DA skal opdateres” eller tilsvarende.

## Åbne spørgsmål (beslut før større B/C)
- Skal DA altid følge EN via `build:locales`, eller skal bestemte sider have frie DA-tekster i backoffice? (vælg Strategi 1/2)
- Hvilke sider opdateres hyppigst i praksis? (brug det til at prioritere A4–A6 og B1–B3)
- Skal backoffice kun køre lokalt (`npm run links`) eller også på en intern URL? (påvirker sikkerhed/validering af writes)

## Referencer (kode)
- `tools/render-content.mjs`, `backoffice/vite.config.js`, `backoffice/main.js`
- `tools/render-stories.mjs`, `data/stories-content.json`
- `tools/render-nav-heroes.mjs`, `data/nav-heroes.json`
- `tools/locales.mjs`, `AGENTS.md`, `docs/readability-coordination.md` (hvis relevant)
