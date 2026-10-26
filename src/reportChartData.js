import {stockImbalanceShares} from './reportSections.js';

const provinceNames = {
  'CENTRAL PROVINCE': 'Central', 'COPPERBELT PROVINCE': 'Copperbelt',
  'EASTERN PROVINCE': 'Eastern', 'LUAPULA PROVINCE': 'Luapula',
  'LUSAKA PROVINCE': 'Lusaka', 'MUCHINGA PROVINCE': 'Muchinga',
  'NORTH-WESTERN PROVINCE': 'North-Western', 'NORTHERN PROVINCE': 'Northern',
  'SOUTHERN PROVINCE': 'Southern', 'WESTERN PROVINCE': 'Western',
};
const groupNames = {
  'Health Centre/Health Post': 'Health Centres/Health Posts',
  'Level 1 Hospital': 'Level 1 Hospitals', 'Level 2 Hospital': 'Level 2 Hospitals',
  'Level 3/Specialised Hospital': 'Level 3/Specialised Hospitals',
  'HEALTH CENTRE': 'Health Centres', 'HEALTH POST': 'Health Posts',
  'LEVEL 1 HOSPITAL': 'Level 1 Hospitals', 'LEVEL 2/GENERAL HOSPITAL': 'Level 2/General Hospitals',
  'LEVEL 3 HOSPITAL': 'Level 3 Hospitals', 'TB-DS/TB-MDR UNITS': 'TB-DS/TB-MDR Units',
  'MENTAL HEALTH UNITS': 'Mental Health Units', 'RENAL UNITS': 'Renal Units',
  'EYE/OPHTHALMOLOGY HOSPITAL': 'Eye/Ophthalmology Hospitals', 'CANCER': 'Cancer units',
  'NATIONAL HEART HOSPITAL': 'National Heart Hospital',
  'WOMEN AND NEWBORN HOSPITAL': 'Women and Newborn Hospitals', 'ART': 'ART sites',
};
const chartNames = {
  'Health Centre/Health Post': ['Health Centre /', 'Health Post'],
  'Level 1 Hospital': ['Level 1', 'Hospital'], 'Level 2 Hospital': ['Level 2', 'Hospital'],
  'Level 3/Specialised Hospital': ['Level 3 /', 'Specialised Hospital'],
  'HEALTH CENTRE': ['Health', 'Centre'], 'HEALTH POST': ['Health', 'Post'],
  'LEVEL 1 HOSPITAL': ['Level 1', 'Hospital'], 'LEVEL 2/GENERAL HOSPITAL': ['Level 2 /', 'General', 'Hospital'],
  'LEVEL 3 HOSPITAL': ['Level 3', 'Hospital'], 'TB-DS/TB-MDR UNITS': ['TB-DS/', 'TB-MDR', 'Units'],
  'MENTAL HEALTH UNITS': ['Mental', 'Health', 'Units'], 'RENAL UNITS': ['Renal', 'Units'],
  'EYE/OPHTHALMOLOGY HOSPITAL': ['Eye /', 'Ophthalmology', 'Hospital'], 'CANCER': ['Cancer'],
  'NATIONAL HEART HOSPITAL': ['National', 'Heart', 'Hospital'],
  'WOMEN AND NEWBORN HOSPITAL': ['Women and', 'Newborn', 'Hospital'], 'ART': ['ART'],
};

export function reportGroupName(row, {short = false} = {}) {
  const name = row.label || row.name || 'Unnamed reported group';
  return provinceNames[name] ? `${provinceNames[name]}${short ? '' : ' Province'}` : groupNames[name] || name;
}

export function reportChartLabels(row, province = false) {
  if (province) return [reportGroupName(row, {short: true})];
  const name = row.label || row.name || 'Unnamed reported group';
  if (chartNames[name]) return chartNames[name];
  const lines = [];
  for (const word of name.split(/\s+/)) {
    if (!lines.length || `${lines.at(-1)} ${word}`.length > 16) lines.push(word);
    else lines[lines.length - 1] += ` ${word}`;
  }
  return lines;
}

export function rankedReportRows(rows, descending = false) {
  return [...rows].sort((a, b) => {
    if (!Number.isFinite(a.availability)) return Number.isFinite(b.availability) ? 1 : 0;
    if (!Number.isFinite(b.availability)) return -1;
    return (a.availability - b.availability) * (descending ? -1 : 1);
  });
}

export function reportMosMaximum(rows) {
  return Math.max(6, ...rows.filter(row => Number.isFinite(row.mos)).map(row => Math.ceil(row.mos)));
}

export function reportAvailabilityGap(rows) {
  const values = rows.map(row => row.availability).filter(Number.isFinite);
  return values.length > 1 ? (Math.max(...values) - Math.min(...values)) * 100 : null;
}

export function reportImbalanceRows(rows) {
  return rankedReportRows(rows).map(row => ({...row, shares: stockImbalanceShares(row)}));
}
