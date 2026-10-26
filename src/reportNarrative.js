import {rankedReportRows, reportGroupName} from './reportChartData.js';

const valid = (value) => typeof value === 'number' && Number.isFinite(value);
export const formatReportPercent = (value) => valid(value) ? `${(Math.round(value * 1000) / 10).toFixed(1)}%` : 'not available';
const percent = formatReportPercent;
const mos = (value) => valid(value) ? `${value.toFixed(1)} MOS` : 'MOS not available';
export const reportingWeeks = (count) => `${count} reporting ${count === 1 ? 'week' : 'weeks'}`;

export function reportPeriodRange(periods) {
  if (!periods.length) return 'Reporting dates unavailable';
  const start=new Date(`${periods[0].reportDate}T00:00:00Z`);
  const end=new Date(`${periods.at(-1).reportDate}T00:00:00Z`);
  if (!Number.isFinite(start.getTime()) || !Number.isFinite(end.getTime())) return 'Reporting dates unavailable';
  start.setUTCDate(start.getUTCDate()-6);
  const format=date=>date.toLocaleDateString('en-GB',{day:'numeric',month:'long',year:'numeric',timeZone:'UTC'});
  return start.getUTCFullYear()===end.getUTCFullYear() && start.getUTCMonth()===end.getUTCMonth()
    ? `${start.getUTCDate()}-${format(end)}` : `${format(start)} to ${format(end)}`;
}

export function reportAverageMos(rows) {
  const values = rows.map(row => row.mos).filter(valid).map(value => Math.min(12, Math.max(0, value)));
  return values.length ? Math.round(values.reduce((sum, value) => sum + value, 0) / values.length * 100) / 100 : null;
}

export function describeChange(value, unit = 'percentage points') {
  if (!valid(value)) return `Change in ${unit} could not be verified.`;
  const amount = Math.abs(value).toFixed(1);
  if (Number(amount) === 0) return `remained unchanged at the displayed precision`;
  return `${value > 0 ? 'increased' : 'declined'} by ${amount} ${unit}`;
}

export function performanceNarrative(rows, subject) {
  const ranked = rows.filter((row) => valid(row.availability) && row.rows !== 0)
    .slice().sort((a, b) => a.availability - b.availability);
  if (!ranked.length) return [`No verified availability observations are available for ${subject}.`];
  const label = (row) => row.label || row.name || 'Unnamed reported group';
  const low = ranked[0], high = ranked.at(-1);
  const position = (row) => `${label(row)} (${percent(row.availability)} availability; ${mos(row.mos)})`;
  const paragraphs = [];
  if (ranked.length === 1) paragraphs.push(`${subject} analysis covers ${position(low)}. A between-group comparison is not possible with only one reported group.`);
  else if (low.availability === high.availability) paragraphs.push(`${subject} availability was uniform at ${percent(low.availability)} across ${ranked.length} reported groups. Equal availability does not establish equal stock coverage or commodity mix.`);
  else paragraphs.push(`${subject} availability ranged from ${percent(low.availability)} in ${label(low)} to ${percent(high.availability)} in ${label(high)}, a gap of ${((high.availability - low.availability) * 100).toFixed(1)} percentage points. The lower-availability groups were ${ranked.slice(0, Math.min(3, ranked.length - 1)).map(position).join('; ')}. The highest reported availability was recorded in ${position(high)}. These contrasts identify where commodity-level follow-up should be concentrated; they do not establish the cause of the differences.`);
  const uneven = ranked.filter((row) => valid(row.mos) && row.mos >= 2 && row.availability < 1);
  if (uneven.length) {
    const examples = uneven.slice(0, 3).map(label).join(', ');
    const groups = uneven.length > 3 ? `${uneven.length} reported groups, including ${examples}` : examples;
    paragraphs.push(`In ${groups}, average stock coverage was at least two months despite availability below 100%. This combination indicates that an adequate average can coexist with unavailable tracer items; it should not be interpreted as all commodities being adequately stocked. Review the affected items and facilities individually before setting replenishment or redistribution priorities.`);
  }
  paragraphs.push('Interpret comparisons alongside reporting completeness and the commodity mix. Differences in submitted observations can change aggregate availability even when the underlying stock position has not changed proportionately.');
  return paragraphs;
}

const observedPerformance = rows => rankedReportRows(rows.filter(row => valid(row.availability) && row.rows !== 0), true);
const list = entries => entries.length < 2 ? entries[0] || '' : `${entries.slice(0,-1).join(', ')} and ${entries.at(-1)}`;

export function carePerformanceNarrative(rows) {
  const ranked = observedPerformance(rows);
  if (ranked.length < 2 || ranked[0].availability === ranked.at(-1).availability) return performanceNarrative(ranked, 'Level-of-care');
  const high=ranked[0], low=ranked.at(-1);
  const position=row=>`${reportGroupName(row)} (${percent(row.availability)}; ${mos(row.mos)})`;
  const paragraphs=[`Commodity availability varied by level of care, ranging from ${percent(low.availability)} at ${reportGroupName(low)} to ${percent(high.availability)} at ${reportGroupName(high)}, a gap of ${((high.availability-low.availability)*100).toFixed(1)} percentage points. ${reportGroupName(high)} recorded the highest availability (${percent(high.availability)}; ${mos(high.mos)})${ranked.length>2?`, followed by ${list(ranked.slice(1,-1).map(position))}`:''}. ${reportGroupName(low)} recorded the lowest availability (${percent(low.availability)}; ${mos(low.mos)}).`];
  const byId=new Map(rows.map(row=>[row.id,row]));
  const [primary,level1,level2,level3]=['primary','level1','level2','level3'].map(id=>byId.get(id));
  let pattern='The ranking shows differences in reported availability between care levels.';
  if ([primary,level1,level2,level3].every(row=>valid(row?.availability))) {
    if (primary.availability>level2.availability && level2.availability>level1.availability && level1.availability>level3.availability) pattern='Availability was lower at higher levels of care, with the exception of Level 2 Hospitals, which recorded higher availability than Level 1 Hospitals.';
    else if (primary.availability>=level1.availability && level1.availability>=level2.availability && level2.availability>=level3.availability) pattern='Availability was progressively lower across the primary-care and hospital-level groups.';
  }
  paragraphs.push(`${pattern} These differences indicate where commodity-level follow-up should be concentrated. They do not establish the cause of the differences; reporting coverage and commodity mix should be reviewed alongside the stock position.`);
  return paragraphs;
}

export function provincialPerformanceNarrative(rows) {
  const ranked=observedPerformance(rows);
  if (ranked.length<2 || ranked[0].availability===ranked.at(-1).availability) return performanceNarrative(ranked,'Provincial');
  const high=ranked[0], low=ranked.at(-1), withMos=ranked.filter(row=>valid(row.mos)).sort((a,b)=>b.mos-a.mos);
  const range=withMos.length?` Average months of stock (MOS) ranged from ${withMos.at(-1).mos.toFixed(1)} to ${withMos[0].mos.toFixed(1)} months, showing variation in both commodity availability and stock coverage across provinces.`:' Average MOS could not be verified for these provinces.';
  const paragraphs=[`Across the ${ranked.length} reporting provinces, availability ranged from ${percent(low.availability)} in ${reportGroupName(low)} to ${percent(high.availability)} in ${reportGroupName(high)}, a gap of ${((high.availability-low.availability)*100).toFixed(1)} percentage points.${range}`];
  if (withMos.length>=2) {
    const higher=withMos.slice(0,Math.min(3,Math.ceil(withMos.length/2)));
    const lower=withMos.slice(-Math.min(3,Math.floor(withMos.length/2))).reverse();
    paragraphs.push(`${list(higher.map(row=>`${reportGroupName(row)} (${mos(row.mos)})`))} recorded relatively higher average stock coverage. ${list(lower.map(row=>`${reportGroupName(row)} (${mos(row.mos)})`))} recorded comparatively lower coverage. Availability and average MOS measure different aspects of the stock position. ${reportGroupName(low)} reported ${percent(low.availability)} availability with ${mos(low.mos)}; the affected commodities should be reviewed individually rather than assuming that the average stock level describes every item.`);
  }
  paragraphs.push('These patterns highlight where closer monitoring of commodity-specific shortages, stock adequacy and reporting completeness is required. Targeted redistribution may be considered after physical quantities, expiry dates, AMC and programme eligibility have been verified; the aggregate indicators alone do not establish a cause or a transferable quantity.');
  return paragraphs;
}

export function programmePerformanceNarrative(rows) {
  const ranked=observedPerformance(rows);
  if (ranked.length<2 || ranked[0].availability===ranked.at(-1).availability) return performanceNarrative(ranked,'Programme');
  const high=ranked[0],low=ranked.at(-1),split=Math.ceil(ranked.length/2);
  const strongest=ranked.slice(0,Math.min(4,split)), weakest=ranked.slice(-Math.min(5,ranked.length-split)).reverse();
  const paragraphs=[`${reportGroupName(high)} recorded the highest tracer commodity availability at ${percent(high.availability)}${strongest.length>1?`, followed by ${list(strongest.slice(1).map(row=>`${reportGroupName(row)} (${percent(row.availability)})`))}`:''}. These were the strongest reported results among the submitted programme and facility-type groups.`,
    `In contrast, lower availability was recorded in ${list(weakest.map(row=>`${reportGroupName(row)} (${percent(row.availability)})`))}. The gap between the highest and lowest service areas was ${((high.availability-low.availability)*100).toFixed(1)} percentage points. These findings identify service areas requiring commodity-level stock-out review; they do not establish the cause of the shortfalls.`];
  const lowCoverage=ranked.filter(row=>row.availability<.75&&valid(row.mos)&&row.mos<2);
  const mixed=ranked.filter(row=>row.availability<.75&&valid(row.mos)&&row.mos>=2).sort((a,b)=>b.mos-a.mos).slice(0,2);
  if (lowCoverage.length || mixed.length) paragraphs.push(`${mixed.length?`${list(mixed.map(row=>`${reportGroupName(row)} held ${mos(row.mos)} despite ${percent(row.availability)} availability`))}. `:''}${lowCoverage.length?`${list(lowCoverage.map(row=>`${reportGroupName(row)} (${percent(row.availability)}; ${mos(row.mos)})`))} combined availability below 75% with average coverage below two months. `:''}An adequate average can coexist with unavailable tracer items. Review the affected commodities individually before agreeing replenishment or redistribution actions.`);
  paragraphs.push('Overall, the differences support closer monitoring and targeted follow-up in the lower-availability service areas to protect continuity of services. Proposed transfers must be supported by verified item-level stock, expiry and programme evidence.');
  return paragraphs;
}

export function reportingRateNarrative(rows) {
  const observed = rows.filter(row => valid(row.expected) && row.expected > 0);
  if (!observed.length) return ['Reporting rates cannot be verified because the expected district-week denominator is unavailable.'];
  const expected = observed.reduce((sum, row) => sum + row.expected, 0);
  const reported = observed.reduce((sum, row) => sum + row.reported, 0);
  const incomplete = observed.filter(row => row.reported < row.expected).sort((a, b) => a.rate - b.rate);
  return [
    `Across the selected period, ${reported.toLocaleString('en-GB')} of ${expected.toLocaleString('en-GB')} expected district-week submissions were complete (${percent(reported / expected)}). ${incomplete.length ? `Reporting follow-up should begin with ${incomplete.slice(0, 3).map(row => `${row.name} (${percent(row.rate)})`).join('; ')}. The missing primary-care streams restrict the completeness of comparisons between provinces.` : 'Every expected district-week had complete primary-care evidence; hospital reporting must still be assessed separately.'}`,
    'Reporting completeness measures submission coverage, not drug availability. Repeated weeks are separate reporting opportunities and must not be presented as unique districts.',
  ];
}

export function imbalanceNarrative(rows) {
  const observed = rows.filter(row => valid(row.rows) && row.rows > 0);
  if (!observed.length) return ['No submitted observations are available to assess provincial stock imbalance.'];
  const shortage = row => ((row.stockout || 0) + (row.nearCritical || 0) + (row.understocked || 0)) / row.rows;
  const excess = row => ((row.abovePlan || 0) + (row.overstock || 0)) / row.rows;
  const plan=row=>(row.accordingToPlan||0)/row.rows;
  const under=row=>((row.nearCritical||0)+(row.understocked||0))/row.rows;
  const zero=row=>(row.stockout||0)/row.rows;
  const leaders=metric=>[...observed].sort((a,b)=>metric(b)-metric(a)).slice(0,3).map(row=>`${reportGroupName(row)} (${percent(metric(row))})`);
  const low = [...observed].sort((a, b) => shortage(b) - shortage(a))[0];
  const high = [...observed].sort((a, b) => excess(b) - excess(a))[0];
  return [
    `The proportion of submitted observations stocked according to plan (2-4 MOS) was highest in ${list(leaders(plan))}. These results describe the share within the planned stock band, rather than the adequacy of every commodity in a province.`,
    `Emergency and understocked observations were most prominent in ${list(leaders(under))}. Zero or near-zero MOS was highest in ${list(leaders(zero))}. Overall, ${reportGroupName(low)} had the largest share below two MOS (${percent(shortage(low))}), identifying a priority for commodity-level replenishment review.`,
    `At the upper end of the stock range, ${list(leaders(excess))} recorded the largest shares above four MOS. ${shortage(low) > 0 && excess(high) > 0 ? 'Shortage and excess pressure therefore coexist across the submitted portfolio. This supports targeted commodity-by-facility review, not a uniform replenishment response.' : 'Review the commodity-level distribution before deciding on replenishment or redistribution.'}`,
    'These are shares of submitted observations, not quantities available for transfer. Confirm physical SOH, AMC, expiry dates and programme eligibility before approving redistribution; missing MOS remains a separate data-quality concern.',
  ];
}

export function buildReportNarrative(summary) {
  const national = summary.period.national;
  const weeks = summary.weekly || [];
  const provinces = summary.period.counts?.provinces;
  const recordCount = valid(national.rows) ? national.rows.toLocaleString('en-GB') : 'an unverified number of';
  const overview = [`For ${summary.period.label}, ${recordCount} submitted commodity observations${valid(provinces) ? ` from ${provinces} ${provinces === 1 ? 'province were' : 'provinces were'}` : ' were'} analysed across ${reportingWeeks(weeks.length)}. Reported tracer availability was ${percent(national.availability)}, with average stock coverage of ${mos(national.mos)}. These indicators describe submitted observations and do not establish the stock position of non-reporting facilities.`];
  if (valid(summary.availabilityChange)) {
    overview.push(`Compared with the preceding available ${summary.type} period (${summary.previousLabel}), availability ${describeChange(summary.availabilityChange * 100)}.${valid(summary.mosChange) ? ` Average MOS ${describeChange(summary.mosChange, 'months')}.` : ' A corresponding MOS change could not be verified.'} Review reporting coverage and commodity composition before attributing the movement to supply or consumption changes.`);
  }
  const availableWeeks = weeks.filter((week) => valid(week.period.national.availability));
  if (availableWeeks.length > 1) {
    const values = availableWeeks.map((week) => week.period.national.availability);
    overview.push(`Within the selected period, weekly availability ranged from ${percent(Math.min(...values))} to ${percent(Math.max(...values))}; it ${describeChange((values.at(-1) - values[0]) * 100)} between the first and final available observations. This endpoint comparison is not evidence of a sustained trend, particularly where reporting weeks are missing.`);
  }
  const stock = [];
  const bands = summary.stockStatus || [];
  if (valid(national.rows) && national.rows > 0 && bands.length >= 6) {
    const share = (indexes) => indexes.reduce((sum, i) => sum + bands[i].count, 0) / national.rows;
    stock.push(`Nationally, ${percent(share([3]))} of submitted tracer observations were stocked according to plan (2-4 MOS). However, ${percent(share([1]))} were at emergency levels and ${percent(share([2]))} were understocked; together with the ${percent(share([0]))} at zero or near-zero MOS, ${percent(share([0,1,2]))} were below plan. This distribution identifies the scale of stock pressure within the submitted observations.`);
    stock.push(`Conversely, ${percent(share([4]))} were above four MOS, indicating potential opportunities for targeted stock-balance review. Emergency and understocked bands together accounted for ${percent(share([1,2]))}. MOS was missing for ${percent(share([5]))} of observations. Percentages use all submitted observations, including MOS gaps. Excess MOS is not proof of transferable stock: verify physical quantities, AMC, expiry dates and programme eligibility before redistribution. Missing values must not be interpreted as zero stock.`);
  }
  const coverage = summary.districtReporting;
  const reporting = coverage && coverage.expected > 0 ? [`At the final reporting week, ${coverage.reported} of ${coverage.expected} expected districts had complete primary-care submissions (${percent(coverage.reported / coverage.expected)}). ${coverage.expected - coverage.reported > 0 ? `The remaining ${coverage.expected - coverage.reported} districts require reporting follow-up; their missing streams limit the completeness of the national assessment.` : 'All expected districts met the primary-care submission requirement; this does not by itself establish complete hospital reporting or accurate commodity values.'} District reporting completeness is distinct from commodity availability.`] : ['District reporting completeness could not be verified for the selected period.'];
  if (coverage?.expected > 0) overview[0] += ` At the final reporting week, District Health Office (DHO) reporting completeness stood at ${coverage.reported} of ${coverage.expected} districts (${percent(coverage.reported / coverage.expected)}).`;
  return { overview, stock, reporting, care: carePerformanceNarrative(summary.levelRows || []), provinces: provincialPerformanceNarrative(summary.provinces || []), programmes: programmePerformanceNarrative(summary.programmes || []), commodities: performanceNarrative(summary.priorityCommodities || [], 'Lowest-availability commodity subset') };
}
