import {formatReportPercent} from './reportNarrative.js';

export const comparisonSections = [
  ['national', 'National Overview'], ['levels', 'Availability by Level of Care'],
  ['provinces', 'Provincial Performance'], ['programmes', 'Programme Performance'],
  ['coverage', 'Coverage and Methodology'],
];

export const comparisonMos = value => Number.isFinite(value) ? value.toFixed(1) : 'N/R';
export const comparisonPercent = value => Number.isFinite(value) ? formatReportPercent(value) : 'N/R';

export function defaultComparisonPeriods(options) {
  return options.slice(0, 3).map(option => option.id);
}

export function comparisonChanges(values, metric, multiplier = 1) {
  if (values.length < 2) return [];
  const pairs = values.slice(1).map((_, i) => [i, i + 1]);
  if (values.length > 2) pairs.push([0, values.length - 1]);
  return pairs.map(([from, to]) => ({from, to, value: Number.isFinite(values[from]?.[metric]) && Number.isFinite(values[to]?.[metric])
    ? (values[to][metric] - values[from][metric]) * multiplier : null}));
}

export function comparisonChange(value, unit = 'pp') {
  if (!Number.isFinite(value)) return 'N/R';
  const rounded = Math.round(value * 10) / 10;
  return `${rounded > 0 ? '+' : ''}${rounded.toFixed(1)} ${unit}`;
}

export function comparisonGroups(periods, section) {
  const names = section === 'national' ? ['National'] : [...new Set(periods.flatMap(period => period[section].map(row => row.name)))].sort();
  return names.map(name => ({name, values: periods.map(period => section === 'national' ? period.national
    : period[section].find(row => row.name === name) || {availability: null, mos: null, rows: 0})}));
}

export function comparisonNarrative(periods, groups, subject) {
  const first = periods[0], last = periods.at(-1);
  if (!first || !last) return [];
  const narrative = [];
  if (subject === 'National') {
    narrative.push(`National tracer availability was ${periods.map(period => `${comparisonPercent(period.national.availability)} in ${period.label}`).join(', ')}. Average stock coverage was ${periods.map(period => `${comparisonMos(period.national.mos)} MOS in ${period.shortLabel}`).join(', ')}.`);
    comparisonChanges(periods.map(period => period.national), 'availability', 100).forEach(change => {
      const mos = comparisonChanges(periods.map(period => period.national), 'mos').find(pair => pair.from === change.from && pair.to === change.to);
      narrative.push(`From ${periods[change.from].shortLabel} to ${periods[change.to].shortLabel}, availability changed by ${comparisonChange(change.value)} and average stock coverage changed by ${comparisonChange(mos?.value, 'months')}.`);
    });
  } else {
    const observed = groups.filter(group => Number.isFinite(group.values[0].availability) && Number.isFinite(group.values.at(-1).availability));
    const ranked = observed.map(group => ({...group, change: (group.values.at(-1).availability - group.values[0].availability) * 100})).sort((a, b) => a.change - b.change || a.name.localeCompare(b.name));
    if (ranked.length) {
      const describe = group => `${group.name}: ${comparisonPercent(group.values[0].availability)} to ${comparisonPercent(group.values.at(-1).availability)} (${comparisonChange(group.change)})`;
      narrative.push(`${subject} comparison covers ${groups.length} groups. Between ${first.shortLabel} and ${last.shortLabel}, the lowest availability change was recorded in ${describe(ranked[0])}${ranked.length > 1 ? `; the highest was recorded in ${describe(ranked.at(-1))}` : ''}.`);
    } else narrative.push(`No ${subject.toLowerCase()} groups have verified availability in both ${first.shortLabel} and ${last.shortLabel}; a first-to-last change cannot be calculated.`);
  }
  narrative.push('Read availability alongside MOS: positive stock does not establish adequate stock coverage. Changes in reporting coverage and commodity mix can affect comparisons; missing submissions are not evidence of zero stock.');
  return narrative;
}
