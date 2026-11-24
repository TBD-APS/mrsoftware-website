// William's top tasks. Written before private screens; form entry is not a click.
// The catalogue journeys start on Catalogue: on a phone it sits behind More, which a shared
// journey cannot click on desktop. Reaching it through More is tested in backoffice.pw.mjs.
export const journeys = [
  { id: 'today-follow-up', task: 'Open a due opportunity from Today', start: '', budget: { clicks: 1, fields: 0 },
    steps: [{ clickCard: '.record-card', hasText: 'Service team rollout' }],
    done: { route: /\?view=opportunity&id=/, text: [['h1', /Service team rollout/]], inView: 'h1' } },
  { id: 'create-customer', task: 'Save a company and its contact', start: '', budget: { clicks: 2, fields: 4 },
    steps: [{ click: 'link', name: 'New customer' }, { fill: 'Company name', value: 'Lund Services' }, { fill: 'Contact name', value: 'Alex Lund' }, { fill: 'Contact email', value: 'alex@example.test' }, { fill: 'Private notes', value: 'Call in the morning.' }, { click: 'button', name: 'Save customer' }],
    done: { route: /\?view=customer&id=/, text: [['h1', /Lund Services/], ['#workspace-result', /Customer saved/]], inView: '#workspace-result' } },
  { id: 'save-opportunity', task: 'Save an opportunity with its next follow-up', start: '?view=customers', budget: { clicks: 3, fields: 2 },
    steps: [{ click: 'link', name: 'Holm & Co' }, { click: 'link', name: 'New opportunity' }, { fill: 'Opportunity title', value: 'Autumn service team' }, { fill: 'Next follow-up', value: '2030-11-20' }, { click: 'button', name: 'Save opportunity' }],
    done: { route: /\?view=opportunity&id=/, text: [['h1', /Autumn service team/], ['#workspace-result', /Opportunity saved/]], inView: '#workspace-result' } },
  { id: 'save-quote', task: 'Create and preview a saved quote', start: '?view=sales', budget: { clicks: 3, fields: 0 },
    steps: [{ click: 'link', name: 'Service team rollout' }, { click: 'link', name: 'New quote' }, { click: 'button', name: 'Save quote' }],
    done: { route: /\?view=quote&id=/, text: [['h1', /Workslip Core quote/], ['#workspace-result', /Quote saved/], ['#quote-preview', /DKK 899/]], inView: '#workspace-result' } },
  { id: 'edit-package', task: 'Update a catalogue package', start: '?view=catalogue', budget: { clicks: 2, fields: 1 },
    steps: [{ click: 'link', name: 'Workslip Core' }, { fill: 'Monthly price (DKK)', value: '949' }, { click: 'button', name: 'Save package' }],
    done: { route: /\?view=package&id=workslip-core/, text: [['#workspace-result', /Package saved/]], inView: '#workspace-result' } },
  { id: 'find-and-save-lead', task: 'Find Workslip companies in Midtjylland and save one as a lead', start: '?view=leads', budget: { clicks: 4, fields: 1 },
    steps: [{ select: 'Product', value: 'workslip' }, { check: 'Midtjylland' }, { click: 'button', name: 'Search' }, { click: 'button', name: 'Save Lund Tømrer ApS as lead' }, { click: 'button', name: 'Save lead' }],
    done: { route: /\?view=opportunity&id=/, text: [['h1', /Workslip lead/], ['#workspace-result', /Lead saved/]], inView: '#workspace-result' } },
  { id: 'toggle-demo', task: 'Turn a demo off', start: '?view=catalogue', budget: { clicks: 2, fields: 1 },
    steps: [{ click: 'link', name: 'Shippy demo' }, { select: 'Demo visibility', value: 'off' }, { click: 'button', name: 'Save demo' }],
    done: { route: /\?view=demo&id=shippy/, text: [['#workspace-result', /Demo saved/]], inView: '#workspace-result' } },
];
