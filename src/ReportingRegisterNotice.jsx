import {Download} from 'lucide-react';
import {fixedReportingRegister, outsideRegisterRows, usesFixedReportingRegister} from './fixedReportingRoster.js';
import {facilityReportingSummary} from './reportingQuality.js';
import './reportingRegister.css';

export default function ReportingRegisterNotice({period, scope = {}}) {
  if (!usesFixedReportingRegister(period)) return null;
  const summary = facilityReportingSummary(period, scope);
  const outside = outsideRegisterRows(period, scope);
  function exportRegister() {
    const rows = [
      ['Register version', 'Reporting period', 'Province', 'District', 'Reporting unit', 'Level', 'Register status', 'Submission status', 'Source names'],
      ...summary.rows.map(row => [fixedReportingRegister.version, period.id, row.province, row.district,
        row.masterName, row.facilityLevel, 'Registered', row.reported ? 'Reported' : 'Not reported', row.sourceNames.join('; ')]),
      ...outside.map(row => [fixedReportingRegister.version, period.id, row.province, row.district,
        row.name, row.facilityLevel, 'Outside register - review required', 'Excluded from reporting rate', row.sourceNames.join('; ')]),
    ];
    const csv = rows.map(row => row.map(value => `"${String(value ?? '').replace(/^[=+@-]/, "'$&").replace(/"/g, '""')}"`).join(',')).join('\r\n');
    const url = URL.createObjectURL(new Blob(['\uFEFF', csv], {type: 'text/csv;charset=utf-8;'}));
    const link = document.createElement('a');
    link.href = url; link.download = `reporting-register-${period.id}.csv`; link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  return <section className="reporting-register-notice" aria-label="Fixed reporting register">
    <div className="quality-panel-head"><div>
      <h3>Fixed reporting register: {fixedReportingRegister.expectedUnits} units</h3>
      <p>116 districts; 232 HC/HP streams and {fixedReportingRegister.hospitalAndServiceUnits} hospital/service units. {summary.expected} expected in this filter. Missing reports never reduce the denominator.</p>
      <small>{fixedReportingRegister.version}: October baseline applied consistently to 2026. Pending administrative certification; not a physical-facility census.</small>
    </div><button type="button" onClick={exportRegister}><Download size={16} aria-hidden="true" /> Export register</button></div>
    {outside.length > 0 && <details><summary>{outside.length} submitted units outside the register - review required</summary>
      <p>These names are excluded from the numerator and denominator until the register is reviewed. Stock observations remain available. Export includes the full review list.</p>
      <div className="table-scroll"><table><thead><tr><th>Province</th><th>District</th><th>Submitted name</th><th>Level</th></tr></thead>
        <tbody>{outside.slice(0, 20).map(row => <tr key={row.reportingKey}><td>{row.province}</td><td>{row.district}</td><td>{row.name}</td><td>{row.facilityLevel}</td></tr>)}</tbody></table></div>
      {outside.length > 20 && <p>First 20 shown; export for all {outside.length} units.</p>}
    </details>}
  </section>;
}
