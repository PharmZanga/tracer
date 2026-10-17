export function accessStatusFilter(value) {
  const status = ['pending', 'approved', 'rejected'].includes(value) ? value : 'all';
  const query = `SELECT email, name, province, role, status, requested_at, approved_at, approved_by FROM dashboard_users${status === 'all' ? '' : ' WHERE status = $1'} ORDER BY CASE status WHEN 'pending' THEN 0 ELSE 1 END, requested_at DESC`;
  const options = [['all', 'All statuses'], ['pending', 'Pending'], ['approved', 'Approved'], ['rejected', 'Rejected']];
  const html = `<form method="get" action="/admin" style="display:flex;align-items:end;gap:12px;flex-wrap:wrap;margin-bottom:20px"><label style="margin:0;min-width:180px">Status<select name="status">${options.map(([id, label]) => `<option value="${id}"${id === status ? ' selected' : ''}>${label}</option>`).join('')}</select></label><button type="submit">Apply filter</button></form>`;
  return { query, params: status === 'all' ? [] : [status], html };
}
