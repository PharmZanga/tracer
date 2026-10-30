import {availabilityMethodology, reportedAvailabilityBasis} from './tracerAvailability.js';
import './availabilityEvidence.css';

export default function AvailabilityEvidence({rows}) {
  const primary = rows.filter(row => row.availabilityBasis === reportedAvailabilityBasis
    && ['HEALTH CENTRE', 'HEALTH POST', 'PRIMARY CARE - NOT SPECIFIED'].includes(row.facilityLevel) && row.quantity > 0);
  if (!primary.length) return null;
  const verified = primary.filter(row => row.availabilitySource);
  return <details className="availability-evidence">
    <summary>Availability evidence: {verified.length} of {primary.length} district HC/HP percentages verified</summary>
    <p>{availabilityMethodology}</p>
    {verified.length < primary.length && <p role="note">{primary.length - verified.length} submitted district streams have no verified percentage source. A complete average containing these streams is unavailable; stock quantities and MOS remain visible.</p>}
    <div className="availability-evidence-table"><table><thead><tr><th>Province</th><th>District</th><th>Stream</th><th>Submitted percentage</th><th>Source</th></tr></thead>
      <tbody>{primary.map((row, index) => <tr key={`${row.province}|${row.district}|${row.facilityLevel}|${index}`}>
        <td>{row.province}</td><td>{row.district}</td><td>{row.facilityLevel}</td>
        <td>{Number.isFinite(row.availability) ? `${(row.availability * 100).toFixed(1)}%` : 'Unavailable'}</td>
        <td>{row.availabilitySource ? `${row.availabilitySource.workbook} / ${row.availabilitySource.sheet}!${row.availabilitySource.cell}` : 'Source percentage not verified'}</td>
      </tr>)}</tbody></table></div>
  </details>;
}
