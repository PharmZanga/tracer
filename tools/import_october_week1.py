"""Import eight October Week 1 sources; Central/Eastern remain missing."""
import json
from pathlib import Path
from import_september_week5 import load_generator, load_periods, reporting_expectations, compact_bootstrap, DATA_MODULES, BOOTSTRAP

ROOT=Path(__file__).resolve().parents[1]
DIRECTORY=Path(r'C:\Users\Zanga Musakuzi\Desktop\NSCCU DATA ANALYSIS\PROVINCIAL  tracer SUBMISSION\province submissions\october\week 1')
FILES={
 'LUSAKA PROVINCE':'09.10.2026-LUSAKA PROVINCE 2026 TRACER WEEKLY REPORT PROVINCES.xlsx',
 'COPPERBELT PROVINCE':'11.10.26  COPPERBELT PROVINCE  TRACER WEEKLY REPORT PROVINCES.xlsx',
 'LUAPULA PROVINCE':'11.10.26_LUAPULA PROVINCE 2026 TRACER WEEKLY REPORT.xlsx',
 'NORTH-WESTERN PROVINCE':'11-10-2026 NORTHWESTERN TRACER WEEKLY REPORT.xlsx',
 'WESTERN PROVINCE':'11-10-2026 WESTERN PROVINCE 2025 TRACER WEEKLY REPORT  (1).xlsx',
 'MUCHINGA PROVINCE':'MUCHINGA 09_10_2026.xlsx',
 'NORTHERN PROVINCE':'NORTHERN PROVINCE-TRACER WEEKLY REPORT PROVINCES-4 to 10th October,2026.xlsx',
 'SOUTHERN PROVINCE':'SOUTHERN PROVINCE 2026 TRACER WEEKLY REPORT PROVINCES-WEEK ENDING 09.10.26 (1).xlsx',
}
def main():
 generator=load_generator()
 config={'rawSources':[{'province':province,'path':DIRECTORY/name,'primaryCareSummaryLayout':True} for province,name in FILES.items()], 'source':'October Week 1: eight provincial submissions; Central and Eastern not received','reportDate':'2026-10-11','label':'Week 1 - 11 October 2026','month':'2026-10','week':'Week 1'}
 for source in config['rawSources']:
  if not source['path'].is_file(): raise FileNotFoundError(source['path'])
 period=generator.summarize(config)
 assert period['counts']['provinces']==8,period['counts']
 assert not any(f['province'] in {'CENTRAL PROVINCE','EASTERN PROVINCE'} for f in period['facilities'])
 history=[p for path in DATA_MODULES for p in load_periods(path)]
 periods=history+[period]
 expected_districts,expected_facilities=reporting_expectations(generator,periods)
 generator.build_reporting_quality(periods,expected_districts,expected_facilities)
 assert len(period['dataQuality']['districts'])==116
 output=ROOT/'public/data/tracer/2026/oct.json'
 output.write_text(json.dumps({'tracerReportingPeriods':[period]},separators=(',',':')),encoding='utf-8')
 BOOTSTRAP.write_text('// Compact latest-period fallback. Full history is fetched from public/data at runtime.\nexport const tracerBootstrapPeriod = '+json.dumps(compact_bootstrap(period),separators=(',',':'))+';\n',encoding='utf-8')
 print(json.dumps({'counts':period['counts'],'provinces':period['dataQuality']['provinces']},indent=2))
if __name__=='__main__': main()
