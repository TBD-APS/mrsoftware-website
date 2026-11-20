// DKK minor units. A null amount requires an agreed price when saving a quote.
export const initialCatalog = {
  revision: 1,
  currency: 'DKK',
  packages: [
    { id: 'workslip-core', product: 'workslip', name: 'Core', monthlyMinor: 89900, includes: ['Work slips', 'Time tracking', 'Customers & jobs'], active: true },
    { id: 'workslip-drift', product: 'workslip', name: 'Drift', monthlyMinor: 189600, includes: ['Core', 'KLS', 'Inventory & QR', 'Automations'], active: true },
    { id: 'workslip-complete', product: 'workslip', name: 'Complete', monthlyMinor: 244400, includes: ['Core', 'KLS', 'Inventory & QR', 'Automations', 'Employee insights', 'Reporting'], active: true },
    { id: 'tradey-custom', product: 'tradey', name: 'Tradey', monthlyMinor: null, includes: ['A package agreed for your business'], active: true },
    { id: 'shippy-custom', product: 'shippy', name: 'Shippy', monthlyMinor: null, includes: ['A package agreed for your business'], active: true },
  ],
  demos: [
    { id: 'workslip', title: 'Workslip', summary: 'Try a job checklist, record time and find materials with QR codes.', active: true },
    { id: 'tradey', title: 'Tradey', summary: 'Review an example offer and turn it into an order.', active: true },
    { id: 'shippy', title: 'Shippy', summary: 'Complete an example shipment and record proof of delivery.', active: true },
  ],
};
