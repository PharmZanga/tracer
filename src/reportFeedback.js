import {formatReportPercent, describeChange} from './reportNarrative.js';
import {facilityReportingSummary, primaryCareDistrictSummary} from './reportingQuality.js';

const numeric = Number.isFinite;
const percent = value => numeric(value) ? formatReportPercent(value) : 'not available';
const mos = value => numeric(value) ? `${value.toFixed(1)} MOS` : 'MOS not available';
const observed = rows => (rows || []).filter(row => row.rows > 0 && numeric(row.availability));
const weakest = rows => observed(rows).filter(row => row.availability < 1).sort((a, b) => a.availability - b.availability || a.name.localeCompare(b.name));
const position = row => `${row.name} (${percent(row.availability)}; ${mos(row.mos)})`;
const list = rows => rows.map(position).join('; ');

export function reportFeedbackReporting(period) {
  if (!period) return null;
  const districts = primaryCareDistrictSummary(period);
  const units = facilityReportingSummary(period);
  return {label: period.label, districts, units: {expected: units.expected, reported: units.reported, missing: units.missing}};
}

function stockShares(row) {
  if (!(row?.rows > 0) || !['stockout', 'nearCritical', 'understocked', 'accordingToPlan', 'abovePlan'].every(key => numeric(row[key]) && row[key] >= 0)) return null;
  const counts = [row.stockout, row.nearCritical, row.understocked, row.accordingToPlan, row.abovePlan, row.overstock || 0, row.dataGap || 0];
  // Summary-only historical data may not contain a complete stock-band partition.
  if (Math.abs(counts.reduce((sum, count) => sum + count, 0) - row.rows) > .01) return null;
  return {below: (row.stockout + row.nearCritical + row.understocked) / row.rows,
    zero: row.stockout / row.rows, surplus: (row.abovePlan + (row.overstock || 0)) / row.rows, gaps: (row.dataGap || 0) / row.rows};
}

function movers(periods, key) {
  if (periods.length < 2) return [];
  const first = new Map(observed(periods[0][key]).map(row => [row.name, row]));
  return observed(periods.at(-1)[key]).filter(row => first.has(row.name))
    .map(row => ({...row, from: first.get(row.name), change: (row.availability - first.get(row.name).availability) * 100}))
    .sort((a, b) => a.change - b.change || a.name.localeCompare(b.name));
}

export function buildReportFeedback({label, national = {}, programmes = [], provinces = [], levels = [], reporting, periods = [], provinceCount, previous}) {
  const findings = [], interventions = [], conclusion = [];
  const latest = periods.at(-1);
  if (latest) {
    label = latest.label; national = latest.national; programmes = latest.programmes; provinces = latest.provinces; levels = latest.levels;
    reporting = latest.reporting;
    findings.push(`Across the selected periods, national reported commodity availability was ${periods.map(period => `${percent(period.national.availability)} in ${period.label}`).join(', ')}. Average stock coverage was ${periods.map(period => `${mos(period.national.mos)} in ${period.shortLabel}`).join(', ')}.`);
    const first = periods[0];
    if (numeric(first.national.availability) && numeric(national.availability)) {
      findings.push(`From ${first.shortLabel} to ${latest.shortLabel}, national availability ${describeChange((national.availability - first.national.availability) * 100)}.${numeric(first.national.mos) && numeric(national.mos) ? ` Average stock coverage ${describeChange(national.mos - first.national.mos, 'months')}.` : ' The change in stock coverage could not be verified.'} These are endpoint changes, not evidence of a sustained trend.`);
    }
    for (const [key, subject] of [['programmes', 'Programme'], ['levels', 'Level-of-care']]) {
      const changes = movers(periods, key);
      const decline = changes.find(row => row.change <= -.05), gain = [...changes].reverse().find(row => row.change >= .05);
      const describe = row => `${row.name} changed from ${percent(row.from.availability)} to ${percent(row.availability)} (${describeChange(row.change)})`;
      if (decline || gain) findings.push(`${subject} performance was uneven between ${first.shortLabel} and ${latest.shortLabel}: ${[decline, gain].filter(Boolean).map(describe).join('; ')}.`);
    }
  } else {
    findings.push(`For ${label}, ${numeric(national.rows) ? national.rows.toLocaleString('en-GB') : 'an unverified number of'} submitted commodity observations${numeric(provinceCount) ? ` from ${provinceCount} ${provinceCount === 1 ? 'province' : 'provinces'}` : ''} were analysed. National reported commodity availability was ${percent(national.availability)}, with average stock coverage of ${mos(national.mos)}.`);
    if (numeric(previous?.availabilityChange)) findings.push(`Compared with the preceding available ${previous.type} period (${previous.label}), availability ${describeChange(previous.availabilityChange * 100)}.${numeric(previous.mosChange) ? ` Average stock coverage ${describeChange(previous.mosChange, 'months')}.` : ''}`);
  }
  const scope = latest ? `In the final selected period (${label})` : 'Within the selected period';
  const stock = stockShares(national);
  if (stock) findings.push(`${scope}, ${percent(stock.below)} of submitted observations were below planned stock levels (below two MOS), while ${percent(stock.surplus)} exceeded four MOS. Zero or near-zero MOS accounted for ${percent(stock.zero)}; missing MOS accounted for ${percent(stock.gaps)}. These are observation shares, not physical quantities available for transfer.`);
  const lowProgrammes = weakest(programmes).slice(0, 3);
  if (lowProgrammes.length) findings.push(`${scope}, the lowest reported programme availability was recorded in ${list(lowProgrammes)}.`);
  const provinceStats = observed(provinces).map(row => ({...row, shares: stockShares(row)})).filter(row => row.shares);
  const shortages = [...provinceStats].filter(row => row.shares.below > 0).sort((a, b) => b.shares.below - a.shares.below || a.name.localeCompare(b.name));
  const zero = [...provinceStats].filter(row => row.shares.zero > 0).sort((a, b) => b.shares.zero - a.shares.zero || a.name.localeCompare(b.name));
  const surplus = [...provinceStats].filter(row => row.shares.surplus > 0).sort((a, b) => b.shares.surplus - a.shares.surplus || a.name.localeCompare(b.name));
  if (shortages.length) findings.push(`${scope}, ${shortages[0].name} recorded the highest proportion of observations below two MOS (${percent(shortages[0].shares.below)}).`);
  if (reporting?.districts?.expected > 0) findings.push(`At the final reporting week (${reporting.label}), DHO primary-care completeness was ${reporting.districts.reported} of ${reporting.districts.expected} districts.${reporting.units?.expected > 0 ? ` Separately, ${reporting.units.reported} of ${reporting.units.expected} expected reporting units submitted; ${reporting.units.missing} did not report.` : ' Overall reporting-unit completeness could not be verified.'} Missing submissions do not establish zero stock.`);

  const add = (title, text, owner, timing = 'By the next weekly review') => interventions.push({title, text, owner, timing});
  if (latest) {
    const declining = movers(periods, 'programmes').filter(row => row.change <= -.05).slice(0, 2);
    if (declining.length) add('Investigate declining programme availability', `Between ${periods[0].shortLabel} and ${latest.shortLabel}, ${declining.map(row => `${row.name} declined from ${percent(row.from.availability)} to ${percent(row.availability)}`).join('; ')}. Compare consistent facilities and commodities, verify reporting coverage, and identify the unavailable items before attributing causes.`, 'Programme managers and Control Tower');
  }
  if (lowProgrammes.length) add('Prioritise the lowest-availability services', `${scope}, prioritise ${list(lowProgrammes)}. Programme managers should identify unavailable tracer items and verify SOH, consumption and outstanding orders before coordinating replenishment.${lowProgrammes.some(row => numeric(row.mos) && row.mos < 2) ? ` Give early review to ${lowProgrammes.filter(row => numeric(row.mos) && row.mos < 2).map(row => row.name).join(', ')}, where average coverage was below two MOS.` : ''}`, 'Programme managers, provincial teams and District Pharmacists', 'Verify promptly; review at the next weekly meeting');
  if (shortages.length) add('Target provincial replenishment review', `${scope}, ${shortages.slice(0, 2).map(row => `${row.name} had ${percent(row.shares.below)} of observations below two MOS`).join('; ')}.${zero.length ? ` Verify zero or near-zero MOS in ${zero.slice(0, 2).map(row => `${row.name} (${percent(row.shares.zero)})`).join('; ')}.` : ''} Provincial teams should trace these observations to the affected commodities and reporting units.`, 'Provincial teams and District Pharmacists');
  const mismatches = weakest([...programmes, ...provinces]).filter(row => numeric(row.mos) && row.mos >= 2 && row.availability < .9)
    .sort((a, b) => b.mos - a.mos || a.availability - b.availability || a.name.localeCompare(b.name)).slice(0, 3);
  if (mismatches.length) add('Investigate shortages alongside stock coverage', `${scope}, review ${list(mismatches)}, where average coverage of at least two MOS coexisted with availability below 90%. Identify the specific unavailable commodities; an adequate average does not establish adequate stock for every item.`, 'Programme managers and provincial pharmacists');
  if (surplus.length) add('Assess specific redistribution matches', `${scope}, examine commodities above four MOS in ${surplus.slice(0, 3).map(row => `${row.name} (${percent(row.shares.surplus)} of observations)`).join('; ')} against shortages of the same items. Confirm quantities, consumption, expiry dates, programme eligibility and receiving-site needs before recommending a transfer.`, 'Provincial pharmacists and Control Tower');
  const missingDistricts = (reporting?.districts?.rows || []).filter(row => !row.submitted);
  const missingByProvince = new Map();
  for (const row of missingDistricts) missingByProvince.set(row.province, (missingByProvince.get(row.province) || 0) + 1);
  const reportingActions = [...missingByProvince].map(([province]) => {
    const rows = reporting.districts.rows.filter(row => row.province === province);
    return `${province}: ${rows.filter(row => row.submitted).length} of ${rows.length} districts complete`;
  });
  if (reportingActions.length || reporting?.units?.missing > 0 || stock?.gaps > 0) add('Close reporting and data-quality gaps', [
    reporting ? `For the final reporting week (${reporting.label}),` : `${scope},`,
    reportingActions.length ? `follow up incomplete primary-care submissions (${reportingActions.join('; ')}).` : '',
    reporting?.units?.missing > 0 ? `Follow up the ${reporting.units.missing} missing expected reporting units separately from district completeness.` : '',
    stock?.gaps > 0 ? `Validate missing MOS affecting ${percent(stock.gaps)} of observations ${latest ? `in ${label}` : 'in the selected period'}; missing values must not be replaced with zero.` : '',
  ].filter(Boolean).join(' '), 'Provincial health offices, programme managers and data teams', 'Before the next submission');
  if (!interventions.length) add('Verify commodity-level evidence', 'The available summaries do not identify a verified priority location or service. Validate availability, MOS and reporting coverage before setting replenishment or redistribution priorities.', 'Programme managers, provincial teams and Control Tower');
  add('Track corrective action', 'Record the priority commodity, affected facility or district, verified issue, agreed response, responsible officer, deadline and progress. Review whether verified shortages were resolved at the next weekly meeting.', 'Programme managers, provincial teams and District Pharmacists');

  const concerns = lowProgrammes.map(row => row.name).join(', ');
  conclusion.push(`${latest ? `The comparison of ${periods.map(period => period.shortLabel).join(', ')} should be interpreted beyond the national average.` : `The national average for ${label} does not by itself establish adequate stock at every facility.`}${concerns ? ` Prioritise commodity-level follow-up in ${concerns}${shortages.length ? ` and the below-two-MOS observations in ${shortages[0].name}` : ''}.` : ' Confirm service-level and facility-level evidence before drawing conclusions about shortages.'} Positive SOH indicates stock presence, not assured continuity of care; observed differences do not establish their causes.`);
  conclusion.push('Programme managers, provincial teams and District Pharmacists should jointly verify affected commodities and facilities, coordinate replenishment and assess redistribution using confirmed quantities, consumption and expiry dates. Agree responsible officers and deadlines in a consolidated action tracker. Subsequent weekly reviews should assess resolution of verified shortages using consistent facilities and commodities, with reporting gaps shown separately.');
  if (!stock) findings.push('A complete stock-band distribution could not be verified from the available summary; no stock-imbalance percentages have been assumed.');
  return {findings, interventions, conclusion};
}
