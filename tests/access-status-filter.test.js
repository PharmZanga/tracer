import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { accessStatusFilter } from '../server/access-status-filter.js';

test('access approvals default to all statuses and keep pending-first order', () => {
  const filter = accessStatusFilter();
  assert.deepEqual(filter.params, []);
  assert.doesNotMatch(filter.query, /WHERE/);
  assert.match(filter.query, /ORDER BY CASE status WHEN 'pending'/);
  assert.match(filter.html, /value="all" selected/);
  assert.match(filter.html, /method="get" action="\/admin"/);
});
test('each status filters using a bound SQL value and remains selected', () => {
  for (const status of ['pending', 'approved', 'rejected']) {
    const filter = accessStatusFilter(status);
    assert.deepEqual(filter.params, [status]);
    assert.match(filter.query, /WHERE status = \$1 ORDER BY/);
    assert.ok(filter.html.includes(`value="${status}" selected`));
    assert.equal((filter.html.match(/ selected/g) || []).length, 1);
  }
});
test('invalid, repeated and malicious status values cannot enter SQL or HTML', () => {
  for (const value of ['invalid', "' OR 1=1 --", '<script>alert(1)</script>', ['pending', 'approved'], {}]) {
    assert.deepEqual(accessStatusFilter(value), accessStatusFilter('all'));
  }
});
test('status filtering remains behind the existing session and administrator checks', () => {
  const source = readFileSync(new URL('../server/secure-dashboard.js', import.meta.url), 'utf8');
  assert.match(source, /app.get\("\/admin", requireSession, requireAdmin/);
  assert.match(source, /pool.query\(statusFilter.query, statusFilter.params\)/);
});
