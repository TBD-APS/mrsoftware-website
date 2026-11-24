import { leadPresets } from '../shared/lead-presets.mjs';
import { scoreLead } from './lead-scoring.mjs';

export const linkedinSearchUrl = name => `https://www.linkedin.com/search/results/companies/?keywords=${encodeURIComponent(name)}`;

// The lead shape the API returns: CVR facts, score, reason and links. Internal flags stay out.
export function toLead({ allowedForm, ...company }, product, customerId, today) {
  return { ...company, ...scoreLead(company, leadPresets[product], today), linkedinUrl: linkedinSearchUrl(company.name), customerId: customerId ?? null };
}

export const byScore = (a, b) => b.score - a.score || a.name.localeCompare(b.name, 'da');
export const usableCompany = company => Boolean(company) && !company.protected && company.active && company.allowedForm !== false;
