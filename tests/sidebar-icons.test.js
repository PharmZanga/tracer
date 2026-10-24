import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const source = readFileSync(new URL('../src/App.jsx', import.meta.url), 'utf8');
test('all five sidebar headings have recognisable icons without changing access rules', () => {
  for (const [id, icon] of Object.entries({ overview: 'ChartNoAxesCombined', tracer: 'Syringe', programmes: 'Boxes', zammsa: 'Warehouse', administration: 'ShieldCheck' })) {
    assert.match(source, new RegExp(`id: "${id}", label: "[^"]+", icon: ${icon}`));
  }
  assert.match(source, /GroupIcon size=\{21\} strokeWidth=\{2.1\} aria-hidden="true"/);
  assert.match(source, /visibleDashboardPages = dashboardPages.filter\(\(page\) => !page.adminOnly \|\| isDashboardAdmin\)/);
});
test('sidebar heading labels have a constrained track between stable icons and arrows', () => {
  const css = readFileSync(new URL('../src/dashboardDesign.css', import.meta.url), 'utf8');
  assert.match(css, /grid-template-columns:30px minmax\(0,1fr\) 15px/);
  assert.match(css, /\.sidebar-group-label \{ min-width:0/);
});
