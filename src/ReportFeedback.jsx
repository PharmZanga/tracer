export function ReportKeyFindings({feedback}) {
  return <><h3>Key findings</h3>{feedback.findings.map(text => <p className="national-report-narrative" key={text}>{text}</p>)}</>;
}

export function ReportInterventions({feedback}) {
  return <><ol>{feedback.interventions.map(item => <li key={item.title}><strong>{item.title}: </strong>{item.text}</li>)}</ol>
    <h3>Proposed action tracker</h3><table><thead><tr><th>Action</th><th>Proposed responsible team</th><th>Target review</th></tr></thead><tbody>{feedback.interventions.map(item => <tr key={item.title}><td>{item.title}</td><td>{item.owner}</td><td>{item.timing}</td></tr>)}</tbody></table>
    <p>Confirm responsible officers, commodity and facility details, deadlines and progress in the operational action tracker; the proposed actions above do not record completed interventions.</p></>;
}

export function ReportConclusion({feedback}) {
  return feedback.conclusion.map(text => <p className="national-report-narrative" key={text}>{text}</p>);
}
