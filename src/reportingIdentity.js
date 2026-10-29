export function reportingTextKey(value) {
  return String(value || '').toUpperCase().replace(/[^A-Z0-9]+/g, ' ').trim();
}

export function reportingUnitKey(row) {
  const level = reportingTextKey(row.facilityLevel);
  let name = reportingTextKey(String(row.name || row.facility || '')
    .replace(/\s+\d{1,2}[/.\-]\d{1,2}[/.\-]\d{2,4}\s*$/, ''));
  if (level === 'HEALTH CENTRE' || level === 'HEALTH POST') name = level;
  name = name.replace(/\bDISTTCT\b/g, 'DISTRICT')
    .replace(/\bDH$/, 'DISTRICT HOSPITAL')
    .replace(/\bDISTRICT HOS(?:P)?$/, 'DISTRICT HOSPITAL');
  if (name === 'LEVY MWANAWASA UTH') name = 'LEVY MWANAWASA UNIVERSITY TEACHING HOSPITAL';
  // Reviewed source/expectation aliases, limited to their own district and level.
  const localAliases = {
    'CHITAMBO|CHTAMBO HOSPITAL': 'CHITAMBO DISTRICT HOSPITAL',
    'GWEMBE|GWEMBE': 'GWEMBE DISTRICT HOSPITAL',
    'ITEZHI TEZHI|ITEZHI TEZHI': 'ITEZHI TEZHI DISTRICT HOSPITAL',
  };
  if (level === 'LEVEL 1 HOSPITAL') name = localAliases[`${reportingTextKey(row.district)}|${name}`] || name;
  return [row.province, row.district, level, name].map(reportingTextKey).join('|');
}

export function matchesReportingSelection(row, selection) {
  if (!selection || selection === 'all') return true;
  const [province, district, facilityLevel, ...name] = selection.split('|');
  return reportingUnitKey(row) === reportingUnitKey({province, district, facilityLevel, name: name.join('|')});
}
