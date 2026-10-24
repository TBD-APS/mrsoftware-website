// The approved integration: see progress on arrival, open either code map in
// one click, and return to progress. Each view keeps its address through reload.
export const journeys = [
  { id: 'task-progress', task: 'See task progress immediately', start: '', budget: { clicks: 0, fields: 0 }, steps: [], done: { text: [['#development-view-title', /Task progress/]], inView: '#development-frame' } },
  { id: 'mr-saasy-map', task: 'See the MR SAASy code map', start: '', budget: { clicks: 1, fields: 0 }, steps: [{ click: 'link', name: 'MR SAASy', within: '#development-views' }], done: { route: '?development=mr-saasy', text: [['#development-view-title', /MR SAASy/]], inView: '#development-frame' } },
  { id: 'tradey-map', task: 'See the Tradey code map', start: '', budget: { clicks: 1, fields: 0 }, steps: [{ click: 'link', name: 'Tradey', within: '#development-views' }], done: { route: '?development=tradey', text: [['#development-view-title', /Tradey/]], inView: '#development-frame' } },
  { id: 'return-progress', task: 'Return from code to task progress', start: '?development=tradey', budget: { clicks: 1, fields: 0 }, steps: [{ click: 'link', name: 'Task progress', within: '#development-views' }], done: { route: '?development=tasks', text: [['#development-view-title', /Task progress/]], inView: '#development-frame' } },
];
