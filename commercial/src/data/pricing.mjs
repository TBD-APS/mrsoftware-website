export function moneyLabel(monthlyMinor) {
  return monthlyMinor === null ? 'Let’s agree a price' : `DKK ${new Intl.NumberFormat('en-GB', { minimumFractionDigits: monthlyMinor % 100 ? 2 : 0, maximumFractionDigits: 2 }).format(monthlyMinor / 100)}`;
}
export function enquiryContext(search, catalog) {
  const params = new URLSearchParams(search);
  const product = ['workslip', 'tradey', 'shippy'].includes(params.get('product')) ? params.get('product') : 'workslip';
  const packageId = catalog.packages.find(item => item.id === params.get('package') && item.product === product && item.active)?.id ?? '';
  return { product, packageId };
}
