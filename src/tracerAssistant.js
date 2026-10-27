import { commodityRowsFromPeriod } from './tracerRows.js';
import { analyseTracerCommodity } from './facilityTracerAnalysis.js';
import { facilityReportingRows, primaryCareDistrictRows } from './reportingQuality.js';
import { canAccessDashboardPage } from './dashboardAccess.js';
import { guideAnswer } from './navigationGuide.js';

const normalise = value => String(value || '').toLowerCase().replace(/['\u2019]/g, '').replace(/[^a-z0-9]+/g, ' ').trim();
const contains = (text, name) => (` ${text} `).includes(` ${normalise(name)} `);
const facilityKey = row => JSON.stringify([row.province, row.district, row.facilityLevel, row.facility || row.name]);
const recordKey = row => JSON.stringify([facilityKey(row), row.item, row.programme]);
const percent = value => Number.isFinite(value) ? `${(value * 100).toFixed(1)}%` : 'not available';
const programmeNote = scope => scope.programme === 'MDR-TB' ? 'The source combines TB-DS and TB-MDR unit records. These counts describe that combined reporting stream, not MDR-TB alone. ' : '';
const observationBasis = 'Counts use submitted observations before Data Quality Gate exclusions; gated commodity tables may exclude flagged records.';
const programmeRules = [['MDR-TB', /\bmdr\b/i, /MDR/i], ['Renal', /\brenal\b/i, /RENAL/i], ['Cancer', /\bcancer|oncology\b/i, /CANCER|ONCOLOGY/i], ['Malaria', /\bmalaria\b/i, /MALARIA/i], ['TB', /\btb|tuberculosis\b/i, /\bTB|TUBERCULOSIS/i], ['ART', /\bart|hiv\b/i, /ART|HIV/i]];
export const assistantStatuses = ['all', 'stockout', 'low', 'overstock', 'plan', 'missing'];
const assistantPages = ['executive', 'national', 'provincial', 'facilities', 'commodities', 'comparison', 'programmes', 'stock', 'vaccines', 'reporting', 'quality', 'gate', 'predictive', 'actions', 'reports', 'imports', 'viewers'];
export const emptyAssistantFocus = { programme: 'all', commodity: 'all', status: 'all' };
export const assistantProgrammeMatches = (programme, selection) => {
  if (selection === 'all') return true;
  const rule = programmeRules.find(([name]) => name === selection)?.[2];
  return rule ? rule.test(programme) : normalise(programme) === normalise(selection);
};

export function assistantScopeLabel(scope) {
  return [scope.province === 'all' ? 'All provinces' : scope.province, scope.district === 'all' ? 'All districts' : scope.district,
    scope.facilityLevel !== 'all' ? scope.facilityLevel : null, scope.facility !== 'all' ? 'Selected reporting unit' : null,
    scope.programme !== 'all' ? scope.programme : null, scope.commodity !== 'all' ? scope.commodity : null,
    scope.status !== 'all' ? ({ stockout: 'Confirmed stock-outs', low: 'Below 2 calculated MOS', overstock: 'Above 4 calculated MOS', plan: '2-4 calculated MOS', missing: 'Did not report' }[scope.status]) : null].filter(Boolean).join(' | ');
}

export function previousAssistantWeek(period, catalogue) {
  const target = new Date(`${period.reportDate}T00:00:00Z`);
  target.setUTCDate(target.getUTCDate() - 7);
  return catalogue.find(row => row.reportDate === target.toISOString().slice(0, 10));
}

export function validAssistantView(command, role, directory, catalogue) {
  if (!command || !assistantPages.includes(command.page) || !canAccessDashboardPage(role, command.page)) return false;
  const scope = command.scope;
  if (!scope || !catalogue.some(period => period.id === scope.periodId) || !assistantStatuses.includes(scope.status)) return false;
  if (scope.province !== 'all' && !directory.some(row => row.province === scope.province)) return false;
  if (scope.district !== 'all' && !directory.some(row => row.name === scope.district && (scope.province === 'all' || row.province === scope.province))) return false;
  return ['all', 'primary-combined', 'health-post', 'health-centre', 'level-1', 'level-2', 'level-3', 'specialised-cancer', 'specialised-heart', 'specialised-women-newborn', 'specialised-renal', 'specialised-mental-health', 'specialised-eye', 'specialised-tb'].includes(scope.facilityLevel)
    && typeof scope.facility === 'string' && typeof scope.programme === 'string' && typeof scope.commodity === 'string';
}

export function planAssistantRequest(question, { scope: current, directory, catalogue, commodities = [], role, activePage }) {
  const text = normalise(question);
  const scope = { ...current };
  if (/\b(approve|reject|delete|publish|send|email|transfer|change password)\b/.test(text) && !/\bhow|where\b/.test(text)) return { kind: 'notice', text: 'I can inspect data and change dashboard views, but I will not approve access, publish data, send reports or execute transfers. Use the authorised workflow and confirm those actions there.' };
  if (/\b(clear|reset) (all |the )?filters\b/.test(text)) return { kind: 'query', page: 'executive', scope: { ...scope, province: 'all', district: 'all', facilityLevel: 'all', facility: 'all', ...emptyAssistantFocus } };
  if (/\b(explain|interpret|what does)\b/.test(text) && /\b(chart|graph|page|this|seeing)\b/.test(text)) return { kind: 'explain', scope, page: activePage };
  if (/\b(zammsa|warehouse|central stock|stock navigator|vaccine|vaccines|immunisation)\b/.test(text)) {
    const page = /vaccine|immunisation/.test(text) ? 'vaccines' : 'stock';
    return { kind: 'navigate', page, stock: page === 'stock' ? 'navigator' : null, scope, text: page === 'vaccines' ? 'Vaccine Stock uses a separate monthly source. District AMC and provincial AMI remain separate. Choose the vaccine reporting month in that workspace.' : 'ZAMMSA Stock Navigator shows central inventory separately from facility tracer reports. Its report-date selector is independent of the facility reporting week.' };
  }
  const admin = /\b(generate|pdf|viewer|viewers|import|upload|administration|admin)\b/.test(text) ? guideAnswer(question, role) : null;
  if (admin) return admin.topic ? { kind: 'navigate', page: admin.topic.page, scope, text: admin.text } : { kind: 'notice', text: admin.text };
  if (/^(where|how do i|how can i|getting started)\b/.test(text)) {
    const guidance = guideAnswer(question, role);
    if (guidance.topic) return { kind: 'navigate', page: guidance.topic.page, scope, text: guidance.text };
  }
  const destinations = [['national stock status', 'national'], ['executive summary', 'executive'], ['provincial performance', 'provincial'], ['commodity intelligence', 'commodities'], ['facility alerts', 'facilities'], ['data quality', 'quality'], ['predictive analysis', 'predictive'], ['action tracker', 'actions']];
  if (/^(open|go to|take me to)\b/.test(text)) {
    const destination = destinations.find(([label]) => contains(text, label));
    if (destination) return { kind: 'navigate', page: destination[1], scope, text: 'Open ' + destination[0] + ' with the selected reporting period and geography.' };
  }

  const provinces = [...new Set(directory.map(row => row.province))];
  const namedProvinces = provinces.filter(name => contains(text, name.replace(/ PROVINCE$/i, '')));
  const provinceMatches = namedProvinces.filter(name => !namedProvinces.some(other => other !== name && contains(normalise(other.replace(/ PROVINCE$/i, '')), name.replace(/ PROVINCE$/i, ''))));
  if (provinceMatches.length > 1) return { kind: 'notice', text: 'Please select one province, or ask for all provinces. I will not silently discard one of the named provinces.' };
  const province = provinceMatches[0];
  if (/\ball provinces|nationally|nationwide|across zambia\b/.test(text)) { scope.province = 'all'; scope.district = 'all'; scope.facility = 'all'; }
  if (province && province !== scope.province) { scope.province = province; scope.district = 'all'; scope.facility = 'all'; }
  const districts = directory.filter(row => contains(text, row.name) && (normalise(row.name) !== normalise(row.province.replace(/ PROVINCE$/i, '')) || contains(text, row.name + ' district') || contains(text, 'district ' + row.name)));
  if (districts.length > 1) return { kind: 'notice', text: 'Please choose one district, or ask for all districts. No geography filter was changed.' };
  if (districts.length === 1) {
    if (province && districts[0].province !== province) return { kind: 'notice', text: `${districts[0].name} belongs to ${districts[0].province}, not ${province}. Please confirm which geography you want.` };
    if (scope.district !== districts[0].name) scope.facility = 'all';
    scope.district = districts[0].name; scope.province = districts[0].province;
  }
  if (/\ball districts\b/.test(text)) { scope.district = 'all'; scope.facility = 'all'; }
  const location = text.match(/\bin (.+?)(?: this week| last week| for | with |$)/)?.[1];
  if (location && !province && !districts.length && !/selected|current|scope|all|zambia|the dashboard|the chart/.test(location)) return { kind: 'notice', text: `I could not match "${location}" to the dashboard's province and district directory. Please choose an official province or district name; no filters were changed.` };
  const level = text.match(/\blevel ([123])\b/);
  if (level) { scope.facilityLevel = `level-${level[1]}`; scope.facility = 'all'; }
  if (/\bhealth posts?\b/.test(text)) { scope.facilityLevel = 'health-post'; scope.facility = 'all'; }
  if (/\bhealth cent(?:re|er)s?\b/.test(text)) { scope.facilityLevel = 'health-centre'; scope.facility = 'all'; }
  if (/\ball levels\b/.test(text)) { scope.facilityLevel = 'all'; scope.facility = 'all'; }
  const programme = programmeRules.find(([, pattern]) => pattern.test(text));
  if (programme) scope.programme = programme[0];
  if (/\ball programmes|all programs\b/.test(text)) scope.programme = 'all';
  if (/\b(stock outs?|stockouts?|zero stock)\b/.test(text)) scope.status = 'stockout';
  if (/\b(low stock|understock|below 2|shortages?)\b/.test(text)) scope.status = 'low';
  if (/\boverstock|excess stock\b/.test(text)) scope.status = 'overstock';
  if (/\baccording to plan|stocked to plan\b/.test(text)) scope.status = 'plan';
  if (/\b(non reporting|not report|missing reports?|who did not)\b/.test(text)) scope.status = 'missing';
  if (/\ball statuses|all stock|all facilities\b/.test(text)) scope.status = 'all';
  if (/\ball commodities|all medicines|all drugs\b/.test(text)) scope.commodity = 'all';
  else {
    const exact = commodities.filter(name => contains(text, name));
    const medicalWords = new Set(['sodium', 'chloride', 'normal', 'saline', 'paracetamol', 'amoxicillin', 'amoxycillin', 'ringer', 'ringers', 'ceftriaxone', 'insulin', 'artemether', 'lumefantrine']);
    const terms = text.split(' ').filter(word => medicalWords.has(word));
    const matches = exact.length ? exact : terms.length ? commodities.filter(name => terms.every(term => normalise(name).includes(term))) : [];
    if (matches.length > 1) return { kind: 'clarify', text: 'There is more than one matching commodity. Select the strength and pack you mean; I will not combine different products.', choices: matches.slice(0, 8).map(name => ({ label: name, question: `Show ${name}${scope.status === 'stockout' ? ' stock-outs' : ''}`, scope })) };
    if (matches.length === 1) scope.commodity = matches[0];
  }
  const base = catalogue.find(period => period.id === scope.periodId);
  const date = question.match(/\b20\d{2}-\d{2}-\d{2}\b/)?.[0];
  if (date) {
    const period = catalogue.find(row => row.id === date || row.reportDate === date);
    if (!period) return { kind: 'notice', text: `No reporting period is catalogued for ${date}. No previous date has been substituted.` };
    scope.periodId = period.id;
  }
  const months = ['january', 'february', 'march', 'april', 'may', 'june', 'july', 'august', 'september', 'october', 'november', 'december'];
  const monthIndex = months.findIndex(month => contains(text, month));
  if (monthIndex >= 0 && !date) return { kind: 'clarify', text: 'Choose a reporting week. Monthly and quarterly analysis is available in Comparison or Generate Report.', choices: catalogue.filter(row => row.month === `${text.match(/\b20\d{2}\b/)?.[0] || base?.month.slice(0, 4)}-${String(monthIndex + 1).padStart(2, '0')}`).map(row => ({ label: row.label, question: `Show ${row.reportDate}`, scope })) };
  if (/\bthis week|latest week\b/.test(text)) scope.periodId = [...catalogue].sort((a, b) => a.reportDate.localeCompare(b.reportDate)).at(-1)?.id || scope.periodId;
  if (/\blast week|previous week\b/.test(text) && !/\bcompar|versus|vs\b/.test(text)) {
    const previous = base && previousAssistantWeek(base, catalogue);
    if (!previous) return { kind: 'notice', text: 'There is no catalogued report exactly one week before the selected period. I will not treat the gap as zero stock or substitute an older week.' };
    scope.periodId = previous.id;
  }
  if (/\b(same report|same figures|unchanged figures|unchanged soh|repeated soh|repeating soh)\b/.test(text)
    || /\b(repeat\w*|unchanged|identical|same)\b/.test(text) && /\b(soh|stock on hand|quantities|figures|reports?)\b/.test(text)) {
    const requestedWeeks = Number(text.match(/\b([1-8]) weeks?\b/)?.[1] || 3);
    return { kind: 'navigate', scope: { ...scope, status: 'all' }, page: 'quality', qualityCheck: 'repeated-soh',
      lookback: [1, 2, 3, 4, 6, 8].includes(requestedWeeks) ? requestedWeeks : 3,
      text: 'Repeated SOH under Data Quality flags a facility or district reporting stream as a repeated report only when strictly more than 50% of its valid current-report SOH entries match the selected earlier weeks. Exactly 50% is not flagged. Missing earlier observations do not reduce the denominator. Positive and zero repeats are shown separately, with commodity-level weekly evidence and CSV exports. This is a verification flag, not proof that a report was copied.' };
  }
  if (/\bcompare|comparison|versus|vs\b/.test(text)) return { kind: 'compare', scope, page: 'comparison' };
  if (/\brepeat|recurr|keep appearing|same figures|unchanged figures|trend\b/.test(text)) {
    const unchanged = /same figures|unchanged figures/.test(text);
    scope.status = unchanged ? 'all' : 'stockout';
    return { kind: unchanged ? 'unchanged' : 'trend', scope, page: 'commodities' };
  }
  if (/\breporting|who reported|submitted|submission\b/.test(text) || scope.status === 'missing') {
    if (!/\b(non reporting|not report|missing reports?|who did not)\b/.test(text)) scope.status = 'all';
    return { kind: 'reporting', scope, page: 'reporting' };
  }
  if (/\b(hi|hello|help|start|new user)\b/.test(text)) return { kind: 'notice', text: 'Hi, how can I help you? Ask me to show low-stock medicines in a province, check who reported, compare with last week, or explain the current chart. Follow-up questions keep the current scope.' };
  if (province || districts.length || programme || level || scope.commodity !== current.commodity || /\b(show|list|find|availability|stock|summary|summarise|only|facilities|medicines|commodities)\b/.test(text)) return { kind: 'query', scope, page: scope.commodity !== 'all' || scope.programme !== 'all' ? 'commodities' : 'facilities' };
  const guide = guideAnswer(question, role);
  if (guide.topic) return { kind: 'navigate', scope, page: guide.topic.page, text: guide.text };
  return { kind: 'analysis', scope };
}

export function assistantRows(period, scope, matchesLevel) {
  return commodityRowsFromPeriod(period).filter(row => (scope.province === 'all' || row.province === scope.province)
    && (scope.district === 'all' || row.district === scope.district)
    && matchesLevel(row.facilityLevel, scope.facilityLevel)
    && (scope.facility === 'all' || `${row.province}|${row.district}|${row.facilityLevel}|${row.facility}` === scope.facility)
    && assistantProgrammeMatches(row.programme, scope.programme) && (scope.commodity === 'all' || row.item === scope.commodity));
}

export function assistantEvidence(periods, scope) {
  return `${periods.map(period => `${period.label} (${period.reportDate})`).join('; ')} | ${assistantScopeLabel(scope)} | Source: ${[...new Set(periods.map(period => period.source || 'Provincial tracer submission'))].join('; ')}`;
}

const selectedStatus = (row, status) => {
  if (status === 'stockout') return row.quantity === 0;
  if (status === 'low') return ['Critical low stock', 'Low stock'].includes(row.status);
  if (status === 'overstock') return row.status === 'Overstocked';
  if (status === 'plan') return row.status === 'Stocked according to plan';
  return true;
};

export function assistantSnapshot(period, scope, matchesLevel) {
  if (!period.commodityFacilityData) return { noDetails: true, text: 'This historical period contains summary data only. Detailed facility and commodity counts cannot be verified from it. Open Executive Summary for its reported aggregates.', actions: [{ label: 'Open summary', page: 'executive', scope }] };
  const rows = assistantRows(period, scope, matchesLevel).map(row => analyseTracerCommodity(row));
  const matches = rows.filter(row => selectedStatus(row, scope.status));
  const facilities = new Set(matches.map(facilityKey));
  const stockouts = rows.filter(row => row.quantity === 0).length;
  const low = rows.filter(row => selectedStatus(row, 'low')).length;
  const availability = rows.length ? rows.filter(row => row.quantity > 0).length / rows.length : null;
  const mosRows = rows.map(row => row.mos).filter(Number.isFinite);
  const averageMos = mosRows.length ? mosRows.reduce((sum, value) => sum + Math.min(12, Math.max(0, value)), 0) / mosRows.length : null;
  const groups = new Map();
  matches.forEach(row => {
    const key = facilityKey(row), group = groups.get(key) || { row, records: 0, stockouts: 0, low: 0 };
    group.records++; group.stockouts += Number(row.quantity === 0); group.low += Number(selectedStatus(row, 'low')); groups.set(key, group);
  });
  return {
    text: programmeNote(scope) + (rows.length ? `${matches.length.toLocaleString()} matching commodity observations across ${facilities.size} reporting ${facilities.size === 1 ? 'unit' : 'units'}. In the full selected scope, availability is ${percent(availability)}; ${stockouts.toLocaleString()} observations have an explicitly reported zero quantity and ${low.toLocaleString()} have positive stock below two calculated MOS. Average submitted MOS is ${averageMos === null ? 'not available' : averageMos.toFixed(1)} (12-month cap). Missing reports are not stock-outs. Availability uses all scoped observations before the status filter; low-stock bands use SOH / AMC. ${observationBasis}` : 'No submitted commodity observations match this scope. That is not evidence of zero stock.'),
    columns: ['Reporting unit', 'District', 'Records', 'Zero quantity', 'Below 2 MOS'],
    rows: [...groups.values()].sort((a, b) => b.stockouts - a.stockouts || b.low - a.low).slice(0, 10).map(({ row, records, stockouts, low }) => [row.facility, row.district, records, stockouts, low]),
    total: groups.size,
    actions: [{ label: 'Show facilities', page: 'facilities', scope }, { label: 'View commodities', page: 'commodities', scope }, { label: 'Compare last week', question: 'Compare with last week' }],
    facts: { observations: rows.length, matched: matches.length, reportingUnits: facilities.size, stockouts, low, availability, averageMos },
  };
}

export function assistantReporting(period, scope, matchesLevel) {
  if (scope.programme !== 'all' || scope.commodity !== 'all') return { requiresScopeReset: true, text: 'Programme-specific or commodity-specific reporting obligations cannot be established from missing stock rows. Clear those filters to inspect verified district and facility reporting.', actions: [{ label: 'All programme reporting', question: 'Check who reported for all programmes and all commodities' }] };
  const inScope = row => (scope.province === 'all' || row.province === scope.province) && (scope.district === 'all' || (row.district || row.name) === scope.district);
  const districts = primaryCareDistrictRows(period).filter(inScope);
  const units = facilityReportingRows(period).filter(inScope).filter(row => matchesLevel(row.facilityLevel, scope.facilityLevel)).filter(row => scope.facility === 'all' || `${row.province}|${row.district}|${row.facilityLevel}|${row.name}` === scope.facility);
  const missing = units.filter(row => !row.reported);
  const listed = scope.status === 'missing' ? missing : units;
  return { text: `${districts.filter(row => row.submitted).length} of ${districts.length} districts have complete primary-care submissions. A district needs both Health Centre and Health Post SOH reports, or valid combined evidence; a hospital-only report does not qualify. In the selected facility-level scope, ${units.length - missing.length} of ${units.length} expected/reporting units submitted; ${missing.length} did not report. Missing reports are not zero stock.`, columns: ['Reporting unit', 'District', 'Level', 'Status'], rows: listed.slice(0, 10).map(row => [row.name, row.district, row.facilityLevel, row.reported ? 'Reported' : 'Did not report']), total: listed.length, actions: [{ label: 'Open reporting rate', page: 'reporting', scope }, { label: 'Show non-reporting', question: 'Show missing reports' }] };
}

export function assistantComparison(current, previous, scope, matchesLevel) {
  const now = assistantRows(current, scope, matchesLevel), before = assistantRows(previous, scope, matchesLevel);
  if (!now.length || !before.length) return { text: 'Both weeks need detailed observations in this scope before I can calculate a change. Missing observations are not zero stock.', actions: [] };
  const summarise = rows => ({ rows: rows.length, availability: rows.filter(row => row.quantity > 0).length / rows.length, stockouts: rows.filter(row => row.quantity === 0).length });
  const a = summarise(before), b = summarise(now);
  const uniqueRows = rows => {
    const map = new Map(), duplicates = new Set();
    rows.forEach(row => { const key = recordKey(row); if (map.has(key)) duplicates.add(key); map.set(key, row); });
    duplicates.forEach(key => map.delete(key));
    for (const [key, row] of map) if (!Number.isFinite(row.quantity) || row.quantity < 0) map.delete(key);
    return map;
  };
  const currentKeys = uniqueRows(now), priorKeys = uniqueRows(before);
  const keys = [...currentKeys.keys()].filter(key => priorKeys.has(key));
  const pairedChange = keys.length ? keys.reduce((sum, key) => sum + Number(currentKeys.get(key).quantity > 0) - Number(priorKeys.get(key).quantity > 0), 0) / keys.length : null;
  const delta = (b.availability - a.availability) * 100;
  return { text: programmeNote(scope) + `Before the stock-status filter, full-scope availability ${Math.abs(delta) < .05 ? 'was unchanged at the displayed precision' : `${delta > 0 ? 'increased' : 'declined'} by ${Math.abs(delta).toFixed(1)} percentage points`}, from ${percent(a.availability)} to ${percent(b.availability)}. Observation coverage changed from ${a.rows} to ${b.rows}; confirmed zero quantities changed from ${a.stockouts} to ${b.stockouts}. ${keys.length} unambiguous facility-commodity-programme records occur in both weeks${pairedChange === null ? '.' : `; their like-for-like availability change is ${(pairedChange * 100).toFixed(1)} percentage points.`} Duplicate identities are excluded from paired comparison. Coverage and commodity mix may affect the overall movement; no cause is assumed. ${observationBasis}`, columns: ['Reporting week', 'Observations', 'Availability', 'Zero quantity'], rows: [[previous.label, a.rows, percent(a.availability), a.stockouts], [current.label, b.rows, percent(b.availability), b.stockouts]], facts: { previous: a, current: b, matchedRecords: keys.length, pairedChange }, actions: [{ label: 'Open comparison', page: 'comparison', scope: { ...scope, status: 'all' }, previousPeriodId: previous.id }, { label: 'Current facilities', page: 'facilities', scope }] };
}

export function assistantRecurring(periods, scope, matchesLevel, unchanged = false) {
  const counts = new Map();
  let previous = new Map(), previousDate = null, pairs = 0;
  for (const period of [...periods].sort((a, b) => a.reportDate.localeCompare(b.reportDate))) {
    const rows = assistantRows(period, scope, matchesLevel);
    const current = new Map(), duplicate = new Set();
    rows.forEach(row => { const key = recordKey(row); if (current.has(key)) duplicate.add(key); current.set(key, row); });
    duplicate.forEach(key => current.delete(key));
    const adjacent = previousDate && (Date.parse(period.reportDate) - Date.parse(previousDate)) / 86400000 === 7;
    if (adjacent && previous.size && current.size) {
      pairs++;
      current.forEach((row, key) => {
        const prior = previous.get(key);
        const repeated = prior && (unchanged ? [row.quantity, row.amc, row.mos, prior.quantity, prior.amc, prior.mos].every(Number.isFinite) && row.quantity === prior.quantity && row.amc === prior.amc && row.mos === prior.mos : row.quantity === 0 && prior.quantity === 0);
        if (!repeated) return;
        const group = counts.get(row.item) || { units: new Set(), weeks: new Set() };
        group.units.add(facilityKey(row)); group.weeks.add(previousDate); group.weeks.add(period.reportDate); counts.set(row.item, group);
      });
    }
    previous = current; previousDate = period.reportDate;
  }
  return pairs ? { text: programmeNote(scope) + `${counts.size} commodities have ${unchanged ? 'identical numeric SOH, AMC and submitted MOS' : 'confirmed zero quantities in the same reporting unit'} across at least two adjacent reporting weeks, within up to eight available weeks. Gaps and absent records break the comparison; duplicate identities are excluded. ${unchanged ? 'Repeated figures are a review flag, not proof of an error or fabricated reporting.' : 'These are recurring observed stock-outs, not forecasts or cumulative stock balances.'} ${observationBasis}`, columns: ['Commodity', 'Reporting units', 'Observed weeks'], rows: [...counts.entries()].sort((a, b) => b[1].units.size - a[1].units.size).slice(0, 10).map(([name, group]) => [name, group.units.size, group.weeks.size]), total: counts.size, actions: [{ label: 'Current stock-outs', question: 'Show stock-outs' }, { label: 'Compare last week', question: 'Compare with last week' }] } : { text: 'At least two adjacent reporting weeks with detailed data are needed to check recurring stock-outs or unchanged figures. Missing weeks have not been treated as zero stock.', actions: [] };
}
