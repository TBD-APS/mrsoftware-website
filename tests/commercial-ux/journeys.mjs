// Public top tasks and budgets are written before the screens. Form entry does
// not count as clicks. QR image/camera failure paths have separate browser tests.
export const journeys = [
  {
    id: 'demo-directory', task: 'Open the exact Workslip job from the directory', start: '',
    budget: { clicks: 1, fields: 0 },
    steps: [{ clickCard: '.demo-card', hasText: 'Workslip' }],
    done: { route: 'workslip/jobs/ws-1042/', text: [['h1', /Kitchen service/]], inView: 'h1' },
  },
  {
    id: 'workslip-job', task: 'Complete a checklist and save time', start: 'workslip/jobs/ws-1042/',
    budget: { clicks: 3, fields: 1 },
    steps: [{ check: 'Water supply checked' }, { check: 'Connections tested' }, { fill: 'Minutes worked', value: '45' }, { click: 'button', name: 'Save time' }],
    done: { route: 'workslip/jobs/ws-1042/', text: [['#scenario-result', /45 minutes recorded/], ['#history', /Checklist complete/]], inView: '#scenario-result' },
  },
  {
    id: 'material-lookup', task: 'Find a material by its code', start: 'workslip/',
    budget: { clicks: 2, fields: 1 },
    steps: [{ fill: 'Material code or demo link', value: 'MAT-101' }, { click: 'button', name: 'Find material' }],
    done: { route: 'workslip/materials/mat-101/', text: [['h1', /Copper pipe 15 mm/]], inView: 'h1' },
  },
  {
    id: 'tradey-offer', task: 'Approve an example offer and see its order', start: 'tradey/offers/offer-1048/',
    budget: { clicks: 2, fields: 0 },
    steps: [{ click: 'button', name: 'Approve offer' }],
    done: { route: 'tradey/orders/order-1048/', text: [['#scenario-result', /Order created/]], inView: '#scenario-result' },
  },
  {
    id: 'shippy-delivery', task: 'Complete a delivery and see its proof', start: 'shippy/shipments/shp-2048/',
    budget: { clicks: 2, fields: 1 },
    steps: [{ fill: 'Received by', value: 'Alex Jensen' }, { click: 'button', name: 'Complete delivery' }],
    done: { route: 'shippy/shipments/shp-2048/', text: [['#scenario-result', /Delivered to Alex Jensen/], ['#history', /Proof of delivery/]], inView: '#scenario-result' },
  },
  {
    id: 'package-enquiry', task: 'Choose a package and request a quote', start: 'pricing/',
    budget: { clicks: 3, fields: 3 },
    steps: [{ click: 'link', name: 'Choose Workslip Core' }, { fill: 'Company', value: 'Holm & Co' }, { fill: 'Your name', value: 'Alex Jensen' }, { fill: 'Email', value: 'alex@example.test' }, { click: 'button', name: 'Request a quote' }],
    done: { route: /pricing\/\?product=workslip&package=workslip-core#enquiry/, text: [['#enquiry-result', /Request received/]], inView: '#enquiry-result' },
  },
  {
    id: 'reset-demo', task: 'Reset the Workslip example', start: 'workslip/jobs/ws-1042/',
    budget: { clicks: 1, fields: 0 },
    steps: [{ click: 'button', name: 'Reset demo' }],
    done: { route: 'workslip/jobs/ws-1042/', text: [['#scenario-result', /Demo reset/], ['#history', /Job ready/]], inView: '#scenario-result' },
  },
];
