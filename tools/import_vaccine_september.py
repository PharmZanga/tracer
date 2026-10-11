"""Read the supplied September sheet without modifying the workbook."""
import datetime
import hashlib
import json
import math
import pathlib
import sys
import openpyxl

source = pathlib.Path(sys.argv[1])
root = pathlib.Path(__file__).resolve().parents[1]
book = openpyxl.load_workbook(source, read_only=True, data_only=True)
sheet = book['SEPTEMBER 2026']
iterator = sheet.iter_rows(values_only=True)
headers = next(iterator)
names = {'BCG':'BCG','BOPV':'BOPV','DPT':'DPT','IPV-5':'IPV-5','MR-10':'MR-10','MR-5':'MR-5','PCV-4':'PCV-4','ROTAVAC':'Rotavac','MALARIA VACCINE':'Malaria Vaccine','TD':'Td','HEP B VACCINE':'Hep B Vaccine','HPV':'HPV'}
columns = [(i,names[str(h).strip().upper()]) for i,h in enumerate(headers) if str(h).strip().upper() in names]
assert len(columns)==12
def number(value):
    if isinstance(value,(float,int)) and not isinstance(value,bool) and math.isfinite(value): return value
    if isinstance(value,str):
        try: return float(value.replace(',','').strip())
        except ValueError: pass
    return None
def expiry(value):
    if isinstance(value,(datetime.date,datetime.datetime)): return value.isoformat()[:10]
    return value.strip() if isinstance(value,str) and not value.startswith('#') else None
rows=[]
locations=[]
for index,row in enumerate(iterator,2):
    province=str(row[0] or '').strip().replace(' PHO','').replace(' Province','')
    district=str(row[1] or '').strip()
    district={'MWANSABOMBWE DHO':'Mwansabombwe','Senga':'Senga Hill'}.get(district,district)
    if not province or not district: continue
    locations.append([province,district])
    for col,vaccine in columns:
        stock,amc,mos = [number(row[col+i]) for i in range(3)]
        if stock is None and amc is None: continue
        rows.append({'province':province,'district':district,'vaccine':vaccine,'stock':stock,'amc':amc,'mos':mos,'expiryDate':expiry(row[col+3]),'vvmStage':number(row[col+4]),'sourceRow':index})
data={'id':'2026-09','label':'September 2026','sourceSheet':sheet.title,'sourceFile':source.name,'sourceSha256':hashlib.sha256(source.read_bytes()).hexdigest(),'rows':rows}
target=root/'public/data/vaccines/2026-09.json'
target.parent.mkdir(parents=True,exist_ok=True)
target.write_text(json.dumps(data,separators=(',',':'),allow_nan=False),encoding='utf-8')
print(json.dumps({'rows':len(rows),'locations':locations,'stock':sum(r['stock'] or 0 for r in rows),'amc':sum(r['amc'] or 0 for r in rows)},indent=2))
