# MR Software corporate homepage redesign

**Date:** 25 October 2026  
**Status:** Awaiting written-spec review  
**Target:** The corporate homepage on `origin/main`

## Purpose

Redesign the MR Software corporate homepage with an editorial, confident visual
language inspired by the pacing and clarity of tryMurph, while keeping the
composition, copy, imagery, and interaction design original to MR Software.

The page must explain MR Software to leaders, operations teams, and technical
decision-makers without prior knowledge of Sassy, Workslip, or FoodTrading. It
must retain the existing factual boundaries: measured process data may be shown,
but projections, ROI, savings, customer quotes, and customer-specific data must
not be presented as documented results without separate approval.

## Scope

The redesign covers the corporate homepage and its shared responsive navigation
and footer styling. It preserves:

- Workslip as an in-production solution;
- FoodTrading as an in-development demo;
- the existing result figures and their interpretation disclaimer;
- links to security, validation, status, roadmap, privacy, terms, and deletion;
- the private development dashboard and its hostname-specific behavior;
- all existing public subpages.

The dashboard, product applications, product subpages, and public deployment are
outside this change. Deployment still requires explicit approval.

## Design direction

Use a hybrid editorial and product-led direction:

- large, plain-language headlines with strong typographic hierarchy;
- black, warm off-white, and the existing MR Software orange as the only accent;
- alternating light and dark sections to create a deliberate reading rhythm;
- thin rules, square or lightly rounded edges, and generous whitespace instead
  of a grid of interchangeable SaaS cards;
- original photography and graphics generated for MR Software;
- real Workslip and FoodTrading product imagery where a product screen is shown;
- restrained motion that respects `prefers-reduced-motion`.

The design borrows principles, not assets or composition, from tryMurph. It must
not reproduce tryMurph's text, imagery, section layout, or distinctive elements.

## Page structure

### Header

A dark, high-contrast header contains the MR Software wordmark, section links,
security and roadmap links, and one contact action. On mobile it becomes one
accessible menu with at least 44 px tap targets. The existing `aria-expanded`,
Escape-to-close, link-to-close, focus, and resize behavior stays intact.

### Hero

The hero uses an original, wide editorial image with a dark readability overlay.
The headline is:

> Software, der flytter arbejdet fremad.

Supporting copy explains that MR Software turns real workflows into software
that creates overview, removes repeated work, and makes effects measurable.
The primary action moves to the solutions section. A secondary action moves to
the documented results.

The first viewport must communicate who MR Software helps, what it builds, and
where the visitor should go next without requiring a click.

### 01 — The work that should be easier

A compact editorial section describes the recurring problems MR Software solves:
manual handovers, missing overview, repeated entry, and unclear next actions.
This is expressed through short statements and whitespace, not four matching
feature cards.

### 02 — Solutions

Workslip and FoodTrading each receive a wide product story containing:

- current lifecycle status;
- the audience and work problem;
- a short, concrete workflow description;
- three factual capabilities;
- a link to the product or demo;
- a real product screenshot or a UI-derived visual captured from an accessible,
  approved product surface;
- an original environmental image that supports the product context.

Workslip remains first and marked `I drift`. FoodTrading remains marked
`Under udvikling · demo`. Generated images must never contain fabricated,
readable product interfaces. If an approved product surface cannot be accessed,
omit its screenshot rather than replacing it with fabricated product proof.

### 03 — Documented results

Show the existing `3 min.` median active completion time and `4,6 dage` median
creation-to-approval duration as large process measurements. Keep a visible
source and interpretation disclaimer close to the figures.

Do not describe either figure as time saved, ROI, customer profit, or economic
benefit. Do not add testimonials, logos, client names, or additional metrics
without an approved factual source.

### 04 — Method

Present `Forstå → Byg → Automatisér → Mål` as a numbered editorial sequence.
Each step gets one short outcome-focused sentence. The sequence must remain
clear when stacked on a 390 px viewport and must not become four visually equal
cards unless testing shows that another layout is less understandable.

### 05 — Technical responsibility

A dark credibility section links to security and privacy, self-validation, and
operational status. It supports the commercial story without making technical
implementation the hero message.

### 06 — Contact

End with one plain-language invitation to discuss a real workflow and one email
action with the existing address and subject. Do not add a contact form in this
slice.

### Footer

Keep product, information, legal, and contact links. The footer must not become
the only route to security, status, or privacy information.

## Visual system

### Colour

- Ink: near-black for navigation, technical responsibility, and primary type.
- Paper: warm off-white for the main reading surface.
- Surface: white for product screenshots and small factual callouts.
- Accent: the existing MR Software orange for links, focus, numbering, and the
  one primary action in each area.
- Muted: neutral grey with WCAG-compliant contrast on both light and dark
  surfaces.

Implementation must define these as CSS custom properties. New raw colour
values must not be scattered through component rules.

### Typography

Use a compact system-font stack with large display type, negative display
letter-spacing, readable body widths, and a minimum text size of 12 px. Avoid a
third-party font dependency. Each screen has one page title, and heading levels
follow document order.

### Shape and spacing

Spacing follows 4 px increments. Editorial sections prefer rules and whitespace
over containers. Product imagery may use one consistent modest radius. Buttons
and interactive elements are at least 44 px high on mobile.

### Motion

Allow only short entrance or hover transitions that clarify interaction. All
non-essential movement is disabled when reduced motion is requested. No
carousel, autoplay video, parallax, or scroll-jacking is introduced.

## ImagineArt asset direction

Create four original assets after the design is approved:

1. **Hero, 16:9:** a candid Danish B2B software team connecting office and
   operational work, editorial documentary photography, warm natural light,
   calm composition, room for overlaid copy, no logos, no readable screens.
2. **Workslip, 4:3:** a field-service worker and office coordinator connected by
   a real work process, Scandinavian setting, practical rather than aspirational,
   no unsafe work practice, no readable generated UI.
3. **FoodTrading, 4:3:** international FMCG trading and logistics represented
   through people, goods, and coordination, contemporary documentary style,
   no brand marks, fake labels, or readable generated UI.
4. **Method graphic, 1:1 or transparent:** an abstract original system of four
   connected stages representing understand, build, automate, and measure. It
   must use the approved colour system and remain legible without text embedded
   in the generated image.

All generated assets require a visual review for anatomy, tools, safety,
unwanted logos, fabricated text, and cultural stereotypes before use. Generated
assets are supporting material; they do not replace actual product proof.

## Responsive behavior

The homepage must work at 320, 375, 390, 768, 1024, and 1440 CSS pixels.

- No horizontal scrolling.
- The first mobile viewport contains the headline, short value statement, and
  primary action.
- Product stories stack with the copy before supporting imagery.
- Result figures remain adjacent when space allows and stack without losing
  their disclaimer on narrow screens.
- The mobile menu opens and closes without leaving a busy or trapped state.
- Images use explicit aspect ratios to avoid layout shifts.
- Decorative images use empty alternative text; informative images receive
  short, factual alternatives.

## Journeys and click budgets

| Journey | Start | Result | Budget |
| --- | --- | --- | --- |
| Understand MR Software | Homepage | Offer and audience are visible | 0 clicks |
| Find the solutions | Homepage | Solutions heading and both products are visible | 1 click |
| Open Workslip | Homepage | Workslip destination opens | 2 clicks |
| Open FoodTrading | Homepage | FoodTrading demo opens | 2 clicks |
| See documented results | Homepage | Both measures and disclaimer are visible | 1 click |
| Start contact | Homepage | Prepared email action opens | 1 click |

These journeys supplement the existing private-dashboard journeys. The dashboard
gate must stay green and its test data must remain private.

## Accessibility and interaction

- Preserve the skip link and visible keyboard focus.
- Ensure colour is not the only status signal.
- All controls have visible text or an accessible name.
- All apparent links and buttons work.
- Interactive product names link to their destinations.
- The page is usable with keyboard navigation and at 200% zoom.
- Images cannot be the sole carrier of essential information.
- Busy states, if introduced, end after success and failure.

## Verification and acceptance

Implementation is complete only when all of the following are evidenced:

1. The existing test suite and private-dashboard UX gate pass.
2. Homepage journeys pass on desktop and 390 px phone projects.
3. The UX gate is deliberately broken once and observed failing, then restored.
4. Responsive checks pass at all required widths without overflow or overlap.
5. Keyboard navigation, focus, mobile-menu behavior, and reduced motion work.
6. Every public claim is checked against the approved homepage requirements.
7. Internal links and external product destinations are verified.
8. A browser UAT report shows desktop and phone screenshots with factual figures
   checked against their approved source.
9. CI is green on the exact pushed commit.
10. Merge and deployment remain separate explicit approvals.

## Non-goals

- Redesigning the private dashboard or product applications.
- Changing Workslip or FoodTrading functionality.
- Publishing prices.
- Adding analytics, lead capture, a CMS, a contact form, or a customer-logo wall.
- Inventing cases, testimonials, metrics, savings, or ROI.
- Rebuilding every public subpage in the new editorial layout in this slice.

