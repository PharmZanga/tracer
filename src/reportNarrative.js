const valid = (value) => typeof value === 'number' && Number.isFinite(value);
const percent = (value) => valid(value) ? `${(value * 100).toFixed(1)}%` : 'not available';
const mos = (value) => valid(value) ? `${value.toFixed(1)} MOS` : 'MOS not available';

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
  const label = (row) => row.name || row.label;
  const low = ranked[0], high = ranked.at(-1);
  const position = (row) => `${label(row)} (${percent(row.availability)} availability; ${mos(row.mos)})`;
  const paragraphs = [];
  if (ranked.length === 1) paragraphs.push(`${subject} analysis covers ${position(low)}. A between-group comparison is not possible with only one reported group.`);
  else if (low.availability === high.availability) paragraphs.push(`${subject} availability was uniform at ${percent(low.availability)} across ${ranked.length} reported groups. Equal availability does not establish equal stock coverage or commodity mix.`);
  else paragraphs.push(`${subject} availability ranged from ${percent(low.availability)} in ${label(low)} to ${percent(high.availability)} in ${label(high)}, a gap of ${((high.availability - low.availability) * 100).toFixed(1)} percentage points. The lower-availability groups were ${ranked.slice(0, Math.min(3, ranked.length - 1)).map(position).join('; ')}. The highest reported availability was recorded in ${position(high)}. These contrasts identify where commodity-level follow-up should be concentrated; they do not establish the cause of the differences.`);
  const uneven = ranked.filter((row) => valid(row.mos) && row.mos >= 2 && row.availability < 1);
  if (uneven.length) paragraphs.push(`In ${uneven.map(label).join(', ')}, average stock coverage was at least two months despite availability below 100%. This combination indicates that an adequate average can coexist with unavailable tracer items; it should not be interpreted as all commodities being adequately stocked. Review the affected items and facilities individually before setting replenishment or redistribution priorities.`);
  paragraphs.push('Interpret comparisons alongside reporting completeness and the commodity mix. Differences in submitted observations can change aggregate availability even when the underlying stock position has not changed proportionately.');
  return paragraphs;
}

export function buildReportNarrative(summary) {
  const national = summary.period.national;
  const weeks = summary.weekly || [];
  const overview = [`Reported tracer availability for ${summary.period.label} was ${percent(national.availability)}, with average stock coverage of ${mos(national.mos)}. These indicators describe the submitted observations, not the stock position of non-reporting facilities.`];
  if (valid(summary.availabilityChange)) {
    overview.push(`Compared with the preceding available ${summary.type} period (${summary.previousLabel}), availability ${describeChange(summary.availabilityChange * 100)}.${valid(summary.mosChange) ? ` Average MOS ${describeChange(summary.mosChange, 'months')}.` : ' A corresponding MOS change could not be verified.'} Review reporting coverage and commodity composition before attributing the movement to supply or consumption changes.`);
  }
  const availableWeeks = weeks.filter((week) => valid(week.period.national.availability));
  if (availableWeeks.length > 1) {
    const values = availableWeeks.map((week) => week.period.national.availability);
    overview.push(`Within the selected period, weekly availability ranged from ${percent(Math.min(...values))} to ${percent(Math.max(...values))}; it ${describeChange((values.at(-1) - values[0]) * 100)} between the first and final available observations. This endpoint comparison is not evidence of a sustained trend, particularly where reporting weeks are missing.`);
  } else overview.push('Only one verified weekly availability observation is included. A within-period trend cannot be established from this snapshot.');
  const stock = [];
  const bands = summary.stockStatus || [];
  if (valid(national.rows) && national.rows > 0 && bands.length >= 6) {
    const share = (indexes) => indexes.reduce((sum, i) => sum + bands[i].count, 0) / national.rows;
    stock.push(`The submitted MOS distribution shows ${percent(share([0]))} of observations at zero or near-zero MOS, ${percent(share([1, 2]))} in emergency or understocked bands, ${percent(share([3]))} stocked according to plan and ${percent(share([4]))} above plan. MOS was missing for ${percent(share([5]))} of observations. Percentages use all submitted observations, including MOS gaps.`);
    if (share([0, 1, 2]) > 0 && share([4]) > 0) stock.push('Shortage and excess-stock signals coexist in the submitted portfolio. The aggregate therefore masks an uneven stock position and supports targeted item-by-facility review, rather than a uniform replenishment response. Excess MOS is not proof of transferable stock: verify physical quantities, AMC, expiry dates and programme eligibility before redistribution.');
    if (share([5]) > 0) stock.push('Missing MOS limits classification of part of the portfolio. Resolve these data gaps separately from stock-out follow-up; missing values must not be interpreted as zero stock.');
  }
  const coverage = summary.districtReporting;
  const reporting = coverage && coverage.expected > 0 ? [`At the final reporting week, ${coverage.reported} of ${coverage.expected} expected districts had complete primary-care submissions (${percent(coverage.reported / coverage.expected)}). ${coverage.expected - coverage.reported > 0 ? `The remaining ${coverage.expected - coverage.reported} districts require reporting follow-up; their missing streams limit the completeness of the national assessment.` : 'All expected districts met the primary-care submission requirement; this does not by itself establish complete hospital reporting or accurate commodity values.'} District reporting completeness is distinct from commodity availability.`] : ['District reporting completeness could not be verified for the selected period.'];
  return { overview, stock, reporting, care: performanceNarrative(summary.levelRows || [], 'Level-of-care'), provinces: performanceNarrative(summary.provinces || [], 'Provincial'), programmes: performanceNarrative(summary.programmes || [], 'Programme'), commodities: performanceNarrative(summary.priorityCommodities || [], 'Lowest-availability commodity subset') };
}
