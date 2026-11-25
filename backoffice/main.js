import { createElement as h, useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { LinkEditor } from './linking-react.js';
import '../css/linking.css';

function pageId(graph) {
  const requested = new URLSearchParams(location.search).get('page');
  return graph.places.some(place => place.id === requested) ? requested : graph.places[0].id;
}

function address(id) {
  const next = new URL(location.href);
  next.searchParams.set('page', id);
  return `${next.pathname}${next.search}`;
}

function App() {
  const [graph, setGraph] = useState(null);
  const [fromId, setFromId] = useState('');
  const [status, setStatus] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [content, setContent] = useState(null);
  const [contentStatus, setContentStatus] = useState('');
  const [contentBusy, setContentBusy] = useState(false);

  useEffect(() => {
    let gone = false;
    fetch('/api/links').then(async response => {
      if (!response.ok) throw new Error('The link catalogue could not be loaded.');
      const next = await response.json();
      if (gone) return;
      setGraph(next);
      setFromId(pageId(next));
    }).catch(reason => {
      if (!gone) setError(reason.message || 'The link catalogue could not be loaded.');
    });
    return () => { gone = true; };
  }, []);

  useEffect(() => {
    let gone = false;
    fetch('/api/site-content').then(async response => {
      if (!response.ok) throw new Error('Homepage content could not be loaded.');
      const next = await response.json();
      if (gone) return;
      setContent(next);
    }).catch(reason => {
      if (!gone) setContentStatus(reason.message || 'Homepage content could not be loaded.');
    });
    return () => { gone = true; };
  }, []);

  useEffect(() => {
    if (!graph) return undefined;
    const onPop = () => setFromId(pageId(graph));
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, [graph]);

  if (error) return h('p', { role: 'alert' }, error);
  if (!graph || !fromId) return h('p', { 'aria-busy': 'true' }, 'Loading the pages.');

  function openPage(id, event) {
    if (event.button || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    event.preventDefault();
    history.pushState(null, '', address(id));
    setFromId(id);
  }

  async function save() {
    setBusy(true);
    setStatus('Saving.');
    try {
      const result = await fetch('/api/links', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(graph),
      });
      const message = await result.text();
      if (!result.ok) throw new Error(message);
      setGraph(JSON.parse(message));
      setStatus('Saved. Publish the site for readers to see these links.');
    } catch (reason) {
      setStatus(reason.message || 'The links were not saved.');
    } finally {
      setBusy(false);
    }
  }

  async function saveContent() {
    if (!content) return;
    setContentBusy(true);
    setContentStatus('Saving homepage content.');
    try {
      const result = await fetch('/api/site-content', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(content),
      });
      const message = await result.text();
      if (!result.ok) throw new Error(message);
      setContent(JSON.parse(message));
      setContentStatus('Saved. Updated index.html, stories/*.html, integrations/research/roadmap/status hero sections, and data/*.json.');
    } catch (reason) {
      setContentStatus(reason.message || 'Homepage content was not saved.');
    } finally {
      setContentBusy(false);
    }
  }

  return h('div', null,
    h('section', { style: { marginBottom: '2rem', paddingBottom: '1.5rem', borderBottom: '1px solid #ddd' } },
      h('h2', null, 'Homepage content (editable)'),
      h('p', { style: { maxWidth: '60ch' } }, 'Saves to data/site-content.json and updates index.html via backoffice render scripts.'),
      content ? h('div', { style: { display: 'grid', gap: '1.5rem', maxWidth: '60rem' } },
        h('fieldset', { style: { border: '1px solid #ccc', padding: '1rem' } },
          h('legend', null, 'Homepage “Use cases” intro (section #solutions)'),
          h('label', null, 'Eyebrow', h('input', { value: content.homepageUseCases?.eyebrow ?? '', onChange: e => setContent({ ...content, homepageUseCases: { ...content.homepageUseCases, eyebrow: e.target.value } }), style: { width: '100%' } })),
          h('label', null, 'Heading', h('input', { value: content.homepageUseCases?.heading ?? '', onChange: e => setContent({ ...content, homepageUseCases: { ...content.homepageUseCases, heading: e.target.value } }), style: { width: '100%' } }))
        ),
        h('fieldset', { style: { border: '1px solid #ccc', padding: '1rem' } },
          h('legend', null, 'CTA section (“Ready when you are”)'),
          h('label', null, 'Eyebrow', h('input', { value: content.homepageCta?.eyebrow ?? '', onChange: e => setContent({ ...content, homepageCta: { ...content.homepageCta, eyebrow: e.target.value } }), style: { width: '100%' } })),
          h('label', null, 'Heading', h('input', { value: content.homepageCta?.heading ?? '', onChange: e => setContent({ ...content, homepageCta: { ...content.homepageCta, heading: e.target.value } }), style: { width: '100%' } })),
          h('label', null, 'Lead text', h('textarea', { value: content.homepageCta?.lead ?? '', onChange: e => setContent({ ...content, homepageCta: { ...content.homepageCta, lead: e.target.value } }), rows: 3, style: { width: '100%' } })),
          h('label', null, 'Primary button label', h('input', { value: content.homepageCta?.primaryLabel ?? '', onChange: e => setContent({ ...content, homepageCta: { ...content.homepageCta, primaryLabel: e.target.value } }), style: { width: '100%' } })),
          h('label', null, 'Primary href', h('input', { value: content.homepageCta?.primaryHref ?? '', onChange: e => setContent({ ...content, homepageCta: { ...content.homepageCta, primaryHref: e.target.value } }), style: { width: '100%' } })),
          h('label', null, 'Secondary button label', h('input', { value: content.homepageCta?.secondaryLabel ?? '', onChange: e => setContent({ ...content, homepageCta: { ...content.homepageCta, secondaryLabel: e.target.value } }), style: { width: '100%' } })),
          h('label', null, 'Secondary href', h('input', { value: content.homepageCta?.secondaryHref ?? '', onChange: e => setContent({ ...content, homepageCta: { ...content.homepageCta, secondaryHref: e.target.value } }), style: { width: '100%' } }))
        ),
        h('fieldset', { style: { border: '1px solid #ccc', padding: '1rem' } },
          h('legend', null, 'Contact section (“Get started”)'),
          h('label', null, 'Eyebrow', h('input', { value: content.homepageContact?.eyebrow ?? '', onChange: e => setContent({ ...content, homepageContact: { ...content.homepageContact, eyebrow: e.target.value } }), style: { width: '100%' } })),
          h('label', null, 'Heading', h('input', { value: content.homepageContact?.heading ?? '', onChange: e => setContent({ ...content, homepageContact: { ...content.homepageContact, heading: e.target.value } }), style: { width: '100%' } })),
          h('label', null, 'Lead text', h('textarea', { value: content.homepageContact?.lead ?? '', onChange: e => setContent({ ...content, homepageContact: { ...content.homepageContact, lead: e.target.value } }), rows: 3, style: { width: '100%' } })),
          h('label', null, 'Primary button label', h('input', { value: content.homepageContact?.primaryLabel ?? '', onChange: e => setContent({ ...content, homepageContact: { ...content.homepageContact, primaryLabel: e.target.value } }), style: { width: '100%' } })),
          h('label', null, 'Primary href (mailto)', h('input', { value: content.homepageContact?.primaryHref ?? '', onChange: e => setContent({ ...content, homepageContact: { ...content.homepageContact, primaryHref: e.target.value } }), style: { width: '100%' } })),
          h('label', null, 'Secondary button label', h('input', { value: content.homepageContact?.secondaryLabel ?? '', onChange: e => setContent({ ...content, homepageContact: { ...content.homepageContact, secondaryLabel: e.target.value } }), style: { width: '100%' } })),
          h('label', null, 'Secondary href', h('input', { value: content.homepageContact?.secondaryHref ?? '', onChange: e => setContent({ ...content, homepageContact: { ...content.homepageContact, secondaryHref: e.target.value } }), style: { width: '100%' } }))
        ),
        h('fieldset', { style: { border: '1px solid #ccc', padding: '1rem' } },
          h('legend', null, 'Nav heroes (Integrations / Research / Roadmap / Status) — saved to data/nav-heroes.json'),
          h('p', { style: { maxWidth: '60ch' } }, 'Updates hero intro blocks on those four pages. Roadmap note is edited here too.'),
          h('strong', null, 'Integrations (/integrations/)'),
          h('label', null, 'Pill', h('input', { value: content.navHeroes?.integrations?.pill ?? '', onChange: e => setContent({ ...content, navHeroes: { ...content.navHeroes, integrations: { ...(content.navHeroes?.integrations ?? {}), pill: e.target.value } } }), style: { width: '100%' } })),
          h('label', null, 'Lead (hero)', h('textarea', { value: content.navHeroes?.integrations?.lead ?? '', onChange: e => setContent({ ...content, navHeroes: { ...content.navHeroes, integrations: { ...(content.navHeroes?.integrations ?? {}), lead: e.target.value } } }), rows: 3, style: { width: '100%' } })),
          h('label', null, 'Section 01 label', h('input', { value: content.navHeroes?.integrations?.sectionLabel ?? '', onChange: e => setContent({ ...content, navHeroes: { ...content.navHeroes, integrations: { ...(content.navHeroes?.integrations ?? {}), sectionLabel: e.target.value } } }), style: { width: '100%' } })),
          h('label', null, 'Section 01 heading', h('input', { value: content.navHeroes?.integrations?.sectionHeading ?? '', onChange: e => setContent({ ...content, navHeroes: { ...content.navHeroes, integrations: { ...(content.navHeroes?.integrations ?? {}), sectionHeading: e.target.value } } }), style: { width: '100%' } })),
          h('label', null, 'Section 02 label', h('input', { value: content.navHeroes?.integrations?.buildLabel ?? '', onChange: e => setContent({ ...content, navHeroes: { ...content.navHeroes, integrations: { ...(content.navHeroes?.integrations ?? {}), buildLabel: e.target.value } } }), style: { width: '100%' } })),
          h('label', null, 'Section 02 heading', h('input', { value: content.navHeroes?.integrations?.buildHeading ?? '', onChange: e => setContent({ ...content, navHeroes: { ...content.navHeroes, integrations: { ...(content.navHeroes?.integrations ?? {}), buildHeading: e.target.value } } }), style: { width: '100%' } })),
          h('label', null, 'CTA heading', h('input', { value: content.navHeroes?.integrations?.ctaHeading ?? '', onChange: e => setContent({ ...content, navHeroes: { ...content.navHeroes, integrations: { ...(content.navHeroes?.integrations ?? {}), ctaHeading: e.target.value } } }), style: { width: '100%' } })),
          h('label', null, 'CTA lead', h('textarea', { value: content.navHeroes?.integrations?.ctaLead ?? '', onChange: e => setContent({ ...content, navHeroes: { ...content.navHeroes, integrations: { ...(content.navHeroes?.integrations ?? {}), ctaLead: e.target.value } } }), rows: 2, style: { width: '100%' } })),
          h('hr'),
          h('strong', null, 'Research (/research/)'),
          h('label', null, 'Label', h('input', { value: content.navHeroes?.research?.label ?? '', onChange: e => setContent({ ...content, navHeroes: { ...content.navHeroes, research: { ...(content.navHeroes?.research ?? {}), label: e.target.value } } }), style: { width: '100%' } })),
          h('label', null, 'H1', h('input', { value: content.navHeroes?.research?.h1 ?? '', onChange: e => setContent({ ...content, navHeroes: { ...content.navHeroes, research: { ...(content.navHeroes?.research ?? {}), h1: e.target.value } } }), style: { width: '100%' } })),
          h('label', null, 'Lead', h('textarea', { value: content.navHeroes?.research?.lead ?? '', onChange: e => setContent({ ...content, navHeroes: { ...content.navHeroes, research: { ...(content.navHeroes?.research ?? {}), lead: e.target.value } } }), rows: 3, style: { width: '100%' } })),
          h('label', null, 'Note (top box)', h('textarea', { value: content.navHeroes?.research?.note ?? '', onChange: e => setContent({ ...content, navHeroes: { ...content.navHeroes, research: { ...(content.navHeroes?.research ?? {}), note: e.target.value } } }), rows: 3, style: { width: '100%' } })),
          h('hr'),
          h('strong', null, 'Roadmap (/roadmap/)'),
          h('label', null, 'H1', h('input', { value: content.navHeroes?.roadmap?.h1 ?? '', onChange: e => setContent({ ...content, navHeroes: { ...content.navHeroes, roadmap: { ...(content.navHeroes?.roadmap ?? {}), h1: e.target.value } } }), style: { width: '100%' } })),
          h('label', null, 'Lead', h('textarea', { value: content.navHeroes?.roadmap?.lead ?? '', onChange: e => setContent({ ...content, navHeroes: { ...content.navHeroes, roadmap: { ...(content.navHeroes?.roadmap ?? {}), lead: e.target.value } } }), rows: 3, style: { width: '100%' } })),
          h('label', null, 'Note', h('textarea', { value: content.navHeroes?.roadmap?.note ?? '', onChange: e => setContent({ ...content, navHeroes: { ...content.navHeroes, roadmap: { ...(content.navHeroes?.roadmap ?? {}), note: e.target.value } } }), rows: 2, style: { width: '100%' } })),
          h('div', { style: { marginTop: '0.5rem' } },
            h('em', null, 'Greeny showcase (under hero)'),
            h('label', null, 'Title', h('input', { value: content.navHeroes?.roadmapGreenyShowcase?.title ?? '', onChange: e => setContent({ ...content, navHeroes: { ...content.navHeroes, roadmapGreenyShowcase: { ...(content.navHeroes?.roadmapGreenyShowcase ?? {}), title: e.target.value } } }), style: { width: '100%' } })),
            h('label', null, 'Body', h('textarea', { value: content.navHeroes?.roadmapGreenyShowcase?.body ?? '', onChange: e => setContent({ ...content, navHeroes: { ...content.navHeroes, roadmapGreenyShowcase: { ...(content.navHeroes?.roadmapGreenyShowcase ?? {}), body: e.target.value } } }), rows: 2, style: { width: '100%' } })),
            h('label', null, 'Primary button label', h('input', { value: content.navHeroes?.roadmapGreenyShowcase?.primaryLabel ?? '', onChange: e => setContent({ ...content, navHeroes: { ...content.navHeroes, roadmapGreenyShowcase: { ...(content.navHeroes?.roadmapGreenyShowcase ?? {}), primaryLabel: e.target.value } } }), style: { width: '100%' } })),
            h('label', null, 'Primary href', h('input', { value: content.navHeroes?.roadmapGreenyShowcase?.primaryHref ?? '', onChange: e => setContent({ ...content, navHeroes: { ...content.navHeroes, roadmapGreenyShowcase: { ...(content.navHeroes?.roadmapGreenyShowcase ?? {}), primaryHref: e.target.value } } }), style: { width: '100%' } })),
            h('label', null, 'Secondary link label', h('input', { value: content.navHeroes?.roadmapGreenyShowcase?.secondaryLabel ?? '', onChange: e => setContent({ ...content, navHeroes: { ...content.navHeroes, roadmapGreenyShowcase: { ...(content.navHeroes?.roadmapGreenyShowcase ?? {}), secondaryLabel: e.target.value } } }), style: { width: '100%' } })),
            h('label', null, 'Secondary href', h('input', { value: content.navHeroes?.roadmapGreenyShowcase?.secondaryHref ?? '', onChange: e => setContent({ ...content, navHeroes: { ...content.navHeroes, roadmapGreenyShowcase: { ...(content.navHeroes?.roadmapGreenyShowcase ?? {}), secondaryHref: e.target.value } } }), style: { width: '100%' } }))
          )),
          h('hr'),
          h('strong', null, 'Status (/status/)'),
          h('label', null, 'Label', h('input', { value: content.navHeroes?.status?.label ?? '', onChange: e => setContent({ ...content, navHeroes: { ...content.navHeroes, status: { ...(content.navHeroes?.status ?? {}), label: e.target.value } } }), style: { width: '100%' } })),
          h('label', null, 'H1', h('input', { value: content.navHeroes?.status?.h1 ?? '', onChange: e => setContent({ ...content, navHeroes: { ...content.navHeroes, status: { ...(content.navHeroes?.status ?? {}), h1: e.target.value } } }), style: { width: '100%' } })),
          h('label', null, 'Lead', h('textarea', { value: content.navHeroes?.status?.lead ?? '', onChange: e => setContent({ ...content, navHeroes: { ...content.navHeroes, status: { ...(content.navHeroes?.status ?? {}), lead: e.target.value } } }), rows: 4, style: { width: '100%' } }))
        ),
        h('fieldset', { style: { border: '1px solid #ccc', padding: '1rem' } },
          h('legend', null, 'Stories section (homepage)'),
          h('label', null, 'Eyebrow', h('input', { value: content.homepageStories?.eyebrow ?? '', onChange: e => setContent({ ...content, homepageStories: { ...content.homepageStories, eyebrow: e.target.value } }), style: { width: '100%' } })),
          h('label', null, 'Heading', h('input', { value: content.homepageStories?.heading ?? '', onChange: e => setContent({ ...content, homepageStories: { ...content.homepageStories, heading: e.target.value } }), style: { width: '100%' } })),
          h('label', null, 'Lead text', h('textarea', { value: content.homepageStories?.lead ?? '', onChange: e => setContent({ ...content, homepageStories: { ...content.homepageStories, lead: e.target.value } }), rows: 3, style: { width: '100%' } }))
        ),
        h('fieldset', { style: { border: '1px solid #ccc', padding: '1rem' } },
          h('legend', null, 'Stories cards (homepage, 4 items)'),
          [0,1,2,3].map(i => h('div', { key: i, style: { marginBottom: '0.75rem', paddingBottom: '0.75rem', borderBottom: '1px solid #eee' } },
            h('strong', null, `Card ${i + 1}`),
            h('label', null, 'Title', h('input', { value: content.homepageStoriesCards?.[i]?.title ?? '', onChange: e => {
              const cards = [...(content.homepageStoriesCards ?? [{},{},{},{}])];
              cards[i] = { ...(cards[i] ?? {}), title: e.target.value };
              setContent({ ...content, homepageStoriesCards: cards });
            }, style: { width: '100%' } })),
            h('label', null, 'Link href', h('input', { value: content.homepageStoriesCards?.[i]?.href ?? '', onChange: e => {
              const cards = [...(content.homepageStoriesCards ?? [{},{},{},{}])];
              cards[i] = { ...(cards[i] ?? {}), href: e.target.value };
              setContent({ ...content, homepageStoriesCards: cards });
            }, style: { width: '100%' } })),
            h('label', null, 'Text', h('textarea', { value: content.homepageStoriesCards?.[i]?.text ?? '', onChange: e => {
              const cards = [...(content.homepageStoriesCards ?? [{},{},{},{}])];
              cards[i] = { ...(cards[i] ?? {}), text: e.target.value };
              setContent({ ...content, homepageStoriesCards: cards });
            }, rows: 2, style: { width: '100%' } }))
          ))
        ),
        h('fieldset', { style: { border: '1px solid #ccc', padding: '1rem' } },
          h('legend', null, 'Stories pages (heroes) — saved to data/stories-content.json'),
          h('p', { style: { maxWidth: '60ch' } }, 'Edits hero sections on /stories/ and the four story pages.'),
          h('strong', null, '/stories/ (index)'),
          h('label', null, 'H1', h('input', { value: content.stories?.storiesIndex?.h1 ?? '', onChange: e => setContent({ ...content, stories: { ...content.stories, storiesIndex: { ...(content.stories?.storiesIndex ?? {}), h1: e.target.value } } }), style: { width: '100%' } })),
          h('label', null, 'Lead', h('textarea', { value: content.stories?.storiesIndex?.lead ?? '', onChange: e => setContent({ ...content, stories: { ...content.stories, storiesIndex: { ...(content.stories?.storiesIndex ?? {}), lead: e.target.value } } }), rows: 3, style: { width: '100%' } })),
          h('label', null, 'Label (small text)', h('textarea', { value: content.stories?.storiesIndex?.label ?? '', onChange: e => setContent({ ...content, stories: { ...content.stories, storiesIndex: { ...(content.stories?.storiesIndex ?? {}), label: e.target.value } } }), rows: 2, style: { width: '100%' } })),
          h('hr'),
          h('strong', null, 'The offer (/stories/the-offer/)'),
          h('label', null, 'H1', h('input', { value: content.stories?.theOffer?.h1 ?? '', onChange: e => setContent({ ...content, stories: { ...content.stories, theOffer: { ...(content.stories?.theOffer ?? {}), h1: e.target.value } } }), style: { width: '100%' } })),
          h('label', null, 'Lead', h('textarea', { value: content.stories?.theOffer?.lead ?? '', onChange: e => setContent({ ...content, stories: { ...content.stories, theOffer: { ...(content.stories?.theOffer ?? {}), lead: e.target.value } } }), rows: 3, style: { width: '100%' } })),
          h('label', null, 'Label', h('textarea', { value: content.stories?.theOffer?.label ?? '', onChange: e => setContent({ ...content, stories: { ...content.stories, theOffer: { ...(content.stories?.theOffer ?? {}), label: e.target.value } } }), rows: 2, style: { width: '100%' } })),
          h('hr'),
          h('strong', null, 'The job (/stories/the-job/)'),
          h('label', null, 'H1', h('input', { value: content.stories?.theJob?.h1 ?? '', onChange: e => setContent({ ...content, stories: { ...content.stories, theJob: { ...(content.stories?.theJob ?? {}), h1: e.target.value } } }), style: { width: '100%' } })),
          h('label', null, 'Lead', h('textarea', { value: content.stories?.theJob?.lead ?? '', onChange: e => setContent({ ...content, stories: { ...content.stories, theJob: { ...(content.stories?.theJob ?? {}), lead: e.target.value } } }), rows: 3, style: { width: '100%' } })),
          h('label', null, 'Label', h('textarea', { value: content.stories?.theJob?.label ?? '', onChange: e => setContent({ ...content, stories: { ...content.stories, theJob: { ...(content.stories?.theJob ?? {}), label: e.target.value } } }), rows: 2, style: { width: '100%' } })),
          h('hr'),
          h('strong', null, 'The shipment (/stories/the-shipment/)'),
          h('label', null, 'H1', h('input', { value: content.stories?.theShipment?.h1 ?? '', onChange: e => setContent({ ...content, stories: { ...content.stories, theShipment: { ...(content.stories?.theShipment ?? {}), h1: e.target.value } } }), style: { width: '100%' } })),
          h('label', null, 'Lead', h('textarea', { value: content.stories?.theShipment?.lead ?? '', onChange: e => setContent({ ...content, stories: { ...content.stories, theShipment: { ...(content.stories?.theShipment ?? {}), lead: e.target.value } } }), rows: 3, style: { width: '100%' } })),
          h('label', null, 'Label', h('textarea', { value: content.stories?.theShipment?.label ?? '', onChange: e => setContent({ ...content, stories: { ...content.stories, theShipment: { ...(content.stories?.theShipment ?? {}), label: e.target.value } } }), rows: 2, style: { width: '100%' } })),
          h('hr'),
          h('strong', null, 'The choices (/stories/the-choices/)'),
          h('label', null, 'H1', h('input', { value: content.stories?.theChoices?.h1 ?? '', onChange: e => setContent({ ...content, stories: { ...content.stories, theChoices: { ...(content.stories?.theChoices ?? {}), h1: e.target.value } } }), style: { width: '100%' } })),
          h('label', null, 'Lead', h('textarea', { value: content.stories?.theChoices?.lead ?? '', onChange: e => setContent({ ...content, stories: { ...content.stories, theChoices: { ...(content.stories?.theChoices ?? {}), lead: e.target.value } } }), rows: 3, style: { width: '100%' } })),
          h('label', null, 'Label', h('textarea', { value: content.stories?.theChoices?.label ?? '', onChange: e => setContent({ ...content, stories: { ...content.stories, theChoices: { ...(content.stories?.theChoices ?? {}), label: e.target.value } } }), rows: 2, style: { width: '100%' } }))
        ),
        h('div', null,
          h('button', { type: 'button', onClick: saveContent, disabled: contentBusy, 'aria-busy': contentBusy ? 'true' : undefined }, 'Save content (homepage + stories + nav heroes)'),
          h('p', { 'aria-live': 'polite' }, contentStatus))
      ) : h('p', { 'aria-busy': 'true' }, 'Loading homepage content…')),
    h('h2', null, 'Link graph (related links)'),
    h('nav', { className: 'link-pages', 'aria-label': 'Pages' }, graph.places.map(place => h('a', {
      key: place.id,
      href: address(place.id),
      'aria-current': place.id === fromId ? 'page' : undefined,
      onClick: event => openPage(place.id, event),
    }, place.title))),
    h(LinkEditor, { key: fromId, graph, fromId, onChange: setGraph }),
    h('button', { type: 'button', onClick: save, disabled: busy, 'aria-busy': busy ? 'true' : undefined }, 'Save links'),
    h('p', { 'aria-live': 'polite' }, status));
}

createRoot(document.getElementById('root')).render(h(App));
