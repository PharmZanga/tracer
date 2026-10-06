"""Generate a small reporting-period catalogue without bundling commodity rows."""
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
catalogue = {}
for path in (ROOT / 'public/data/tracer').rglob('*.json'):
    for p in json.loads(path.read_text(encoding='utf-8')).get('tracerReportingPeriods', []):
        catalogue[p['id']] = {k: p[k] for k in ('id','reportDate','month','week','label')}
(ROOT / 'src/reportCatalogue.js').write_text('export const reportCatalogue = ' + json.dumps(sorted(catalogue.values(), key=lambda p: p['reportDate']), separators=(',',':')) + ';\n', encoding='utf-8')
print(f'{len(catalogue)} reporting periods catalogued')
