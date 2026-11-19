export const homepageJourneys = [
  {
    id: 'understand-company',
    task: 'Understand MR Software on arrival',
    budget: 0,
    target: null,
    expectedHeading: /Built for/,
  },
  {
    id: 'find-projects',
    task: 'Find all four projects',
    budget: 1,
    target: '#projects',
    expectedHeading: /Four projects/,
  },
  {
    id: 'read-product-story',
    task: 'Read a full product story',
    budget: 1,
    target: '#roady',
    expectedHeading: /^Roady$/,
  },
  {
    id: 'find-public-demos',
    task: 'Find the public demos',
    budget: 1,
    target: '#demo',
    expectedHeading: /Try the work/,
  },
  {
    id: 'start-contact',
    task: 'Start a conversation',
    budget: 1,
    target: '#contact',
    expectedHeading: /Bring the work/,
  },
];
