// Lead finder presets. Industry codes are DB07 prefixes (2–6 digits) matched against CVR's
// six-digit codes. Each preset comes from the audience its public product page names.
// William reviews these values; change them here only.

export const employeeBands = [
  { code: 'ANTAL_1_1', label: '1' },
  { code: 'ANTAL_2_4', label: '2–4' },
  { code: 'ANTAL_5_9', label: '5–9' },
  { code: 'ANTAL_10_19', label: '10–19' },
  { code: 'ANTAL_20_49', label: '20–49' },
  { code: 'ANTAL_50_99', label: '50–99' },
  { code: 'ANTAL_100_199', label: '100–199' },
  { code: 'ANTAL_200_499', label: '200–499' },
  { code: 'ANTAL_500_999', label: '500–999' },
  { code: 'ANTAL_1000_999999', label: '1000+' },
];

// Limited-liability forms only. Anything else, including sole proprietorships and other
// businesses carried in a person's own name, is left out.
export const allowedCompanyForms = ['A/S', 'APS', 'IVS', 'P/S', 'K/S', 'AMBA', 'FMBA', 'SMBA'];

export const leadPresets = {
  workslip: {
    label: 'Workslip',
    // "Trades and field service": construction (41) and specialised trades (43).
    codes: ['41', '43'],
    sweetSpot: ['ANTAL_5_9', 'ANTAL_10_19', 'ANTAL_20_49'],
    adjacent: ['ANTAL_2_4', 'ANTAL_50_99'],
    source: 'https://mrsoftware.dk/products/workslip/',
  },
  tradey: {
    label: 'Tradey',
    // "Mid-size and large food traders": food wholesale (463) and food agents (4617).
    codes: ['463', '4617'],
    sweetSpot: ['ANTAL_10_19', 'ANTAL_20_49', 'ANTAL_50_99', 'ANTAL_100_199'],
    adjacent: ['ANTAL_5_9', 'ANTAL_200_499'],
    source: 'https://mrsoftware.dk/products/tradey/',
  },
  shippy: {
    label: 'Shippy',
    // "Independent freight forwarders": forwarding and other transport agency (5229).
    codes: ['5229'],
    sweetSpot: ['ANTAL_5_9', 'ANTAL_10_19', 'ANTAL_20_49'],
    adjacent: ['ANTAL_2_4', 'ANTAL_50_99'],
    source: 'https://mrsoftware.dk/products/shippy/',
  },
};
