import { employeeBands } from '../shared/lead-presets.mjs';
import { municipalities } from '../shared/municipalities.mjs';

// Fixed points, documented in the lead finder design. Max 100.
const points = { mainIndustry: 45, secondaryIndustry: 20, sweetSpot: 30, adjacent: 15, established: 15, contact: 10 };
const bandLabels = new Map(employeeBands.map(band => [band.code, band.label]));
const knownMunicipalities = new Set(municipalities.map(entry => entry.code));

const matches = (code, prefixes) => typeof code === 'string' && prefixes.some(prefix => code.startsWith(prefix));

function establishedBy(founded, today) {
  if (typeof founded !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(founded)) return false;
  const year = Number(today.slice(0, 4)) - 2;
  return founded <= `${year}${today.slice(4)}`;
}

export function scoreLead(company, preset, today) {
  let score = 0;
  if (matches(company.industryCode, preset.codes)) score += points.mainIndustry;
  else if ((company.secondaryCodes ?? []).some(code => matches(code, preset.codes))) score += points.secondaryIndustry;
  if (preset.sweetSpot.includes(company.employees)) score += points.sweetSpot;
  else if (preset.adjacent.includes(company.employees)) score += points.adjacent;
  if (establishedBy(company.founded, today)) score += points.established;
  if (company.website || company.phone) score += points.contact;

  const facts = [];
  if (company.industryText && company.industryCode) facts.push(`${company.industryText} (${company.industryCode})`);
  if (bandLabels.has(company.employees)) facts.push(`${bandLabels.get(company.employees)} employees`);
  if (company.city) facts.push(company.city);
  if (typeof company.founded === 'string' && /^\d{4}/.test(company.founded)) facts.push(`founded ${company.founded.slice(0, 4)}`);
  if (company.website) facts.push('website listed');
  else if (company.phone) facts.push('phone listed');
  return { score, reason: facts.join(', ') };
}

export function municipalityCodes(regionCodes, codes) {
  const chosen = new Set(codes.filter(code => knownMunicipalities.has(code)));
  for (const entry of municipalities) if (regionCodes.includes(entry.region)) chosen.add(entry.code);
  return [...chosen].sort();
}
