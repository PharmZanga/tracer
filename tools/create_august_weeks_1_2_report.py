from pathlib import Path
import json
from collections import defaultdict
from datetime import datetime

import matplotlib.pyplot as plt
from reportlab.lib import colors
from reportlab.lib.enums import TA_CENTER, TA_LEFT
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib.units import cm
from reportlab.platypus import (
    SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle, PageBreak, Image, KeepTogether
)

ROOT = Path(__file__).resolve().parents[1]
DATA_PATH = ROOT / "tmp" / "august-weeks-1-2-report-data.json"
OUTPUT_DIR = ROOT / "output" / "pdf"
CHART_DIR = ROOT / "tmp" / "august-report-charts"
OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
CHART_DIR.mkdir(parents=True, exist_ok=True)
PDF_PATH = OUTPUT_DIR / "National_Weekly_Supply_Chain_Tracer_Report_August_Weeks_1_2_2026.pdf"

GREEN = "#087E4A"
DARK_GREEN = "#063D2C"
MID_GREEN = "#5FAF6D"
AMBER = "#D08A00"
RED = "#C5281C"
BLUE = "#2764B8"
LIGHT = "#F2F7F4"
TEXT = "#15271F"

with DATA_PATH.open(encoding="utf-8") as handle:
    source = json.load(handle)
periods = sorted(source["periods"], key=lambda row: row["reportDate"])
w1, w2 = periods
weekly_stock = source.get("weeklyStock", [])
central_report = source.get("centralReport")

def pct(value):
    return f"{value * 100:.1f}%"

def number(value):
    return f"{value:,.0f}"

def weighted_metrics(items):
    total_rows = sum(item.get("rows", 0) for item in items)
    output = {"rows": total_rows}
    for field in ("availability", "mos", "stockoutRate"):
        output[field] = sum(item.get(field, 0) * item.get("rows", 0) for item in items) / total_rows if total_rows else 0
    for field in ("stockout", "nearCritical", "understocked", "accordingToPlan", "abovePlan", "riskRows"):
        output[field] = sum(item.get(field, 0) for item in items)
    return output

combined_national = weighted_metrics([w1["national"], w2["national"]])

def combine_dimension(key):
    groups = defaultdict(list)
    for period in periods:
        for item in period.get(key, []):
            groups[item["name"]].append(item)
    return [{"name": name, **weighted_metrics(items)} for name, items in groups.items()]

combined_provinces = combine_dimension("provinces")
combined_levels = combine_dimension("facilityLevels")
combined_programmes = combine_dimension("programmes")

def find_level(label):
    aliases = {
        "Health Post": ["HEALTH POST"],
        "Health Centre": ["HEALTH CENTRE"],
        "Level 1 Hospital": ["LEVEL 1 HOSPITAL"],
        "Level 2 Hospital": ["LEVEL 2/GENERAL HOSPITAL", "LEVEL 2 HOSPITAL"],
        "Level 3 Hospital": ["LEVEL 3 HOSPITAL"],
    }
    candidates = [item for item in combined_levels if item["name"] in aliases[label]]
    return weighted_metrics(candidates) if candidates else {"availability": 0, "mos": 0, "rows": 0}

level_groups = [
    ("Health Post", find_level("Health Post")),
    ("Health Centre", find_level("Health Centre")),
    ("Level 1 Hospital", find_level("Level 1 Hospital")),
    ("Level 2 Hospital", find_level("Level 2 Hospital")),
    ("Level 3 Hospital", find_level("Level 3 Hospital")),
]

def aggregate_group(items, names):
    matches = [item for item in items if item["name"] in names]
    return weighted_metrics(matches) if matches else {"availability": 0, "mos": 0, "rows": 0}

primary = aggregate_group(combined_levels, ["HEALTH POST", "HEALTH CENTRE"])
specialised_names = [
    "MENTAL HEALTH UNITS", "EYE/OPHTHALMOLOGY HOSPITAL", "TB-DS/TB-MDR UNITS",
    "NATIONAL HEART HOSPITAL", "RENAL UNITS", "CANCER DISEASES HOSPITAL", "WOMEN AND NEWBORN HOSPITAL",
]
specialised = aggregate_group(combined_levels, specialised_names)

def chart_path(name):
    return CHART_DIR / name

plt.rcParams.update({"font.family": "DejaVu Sans", "font.size": 9})

# National weekly trend
fig, ax1 = plt.subplots(figsize=(8.2, 3.6))
labels = ["Week 1\n9 Aug", "Week 2\n16 Aug"]
availability = [w1["national"]["availability"] * 100, w2["national"]["availability"] * 100]
mos = [w1["national"]["mos"], w2["national"]["mos"]]
bars = ax1.bar(labels, availability, color=["#6BAE6D", GREEN], width=.48)
ax1.set_ylim(0, 100); ax1.set_ylabel("Availability (%)", color=GREEN); ax1.grid(axis="y", alpha=.25)
for bar, value in zip(bars, availability): ax1.text(bar.get_x()+bar.get_width()/2, value+2, f"{value:.1f}%", ha="center", weight="bold")
ax2 = ax1.twinx(); ax2.plot(labels, mos, color=BLUE, marker="o", linewidth=2.5); ax2.set_ylim(0, max(5, max(mos)+1)); ax2.set_ylabel("Months of stock", color=BLUE)
for x, value in enumerate(mos): ax2.annotate(f"{value:.2f}", (x, value), xytext=(0,8), textcoords="offset points", ha="center", color=BLUE, weight="bold")
ax1.set_title("National tracer availability and months of stock")
fig.tight_layout(); fig.savefig(chart_path("national_trend.png"), dpi=180, bbox_inches="tight"); plt.close(fig)

# Level of care chart
fig, ax1 = plt.subplots(figsize=(8.4, 3.8))
level_labels = [name.replace(" ", "\n") for name, _ in level_groups]
level_avail = [metric["availability"]*100 for _, metric in level_groups]
level_mos = [metric["mos"] for _, metric in level_groups]
bars = ax1.bar(range(len(level_labels)), level_avail, color=MID_GREEN, width=.62)
ax1.set_xticks(range(len(level_labels)), level_labels); ax1.set_ylim(0,100); ax1.set_ylabel("Availability (%)", color=GREEN); ax1.grid(axis="y", alpha=.25)
for bar, value in zip(bars, level_avail): ax1.text(bar.get_x()+bar.get_width()/2, max(4,value-8), f"{value:.1f}%", ha="center", color="white", weight="bold")
ax2=ax1.twinx(); ax2.plot(range(len(level_labels)), level_mos, color=BLUE, marker="o", linewidth=2.5); ax2.set_ylabel("Months of stock", color=BLUE); ax2.set_ylim(0,max(5,max(level_mos)+1))
for x,value in enumerate(level_mos): ax2.annotate(f"{value:.1f}",(x,value),xytext=(0,8),textcoords="offset points",ha="center",color=BLUE,weight="bold")
ax1.set_title("Combined reporting period: availability and MOS by level of care")
fig.tight_layout(); fig.savefig(chart_path("level_of_care.png"), dpi=180, bbox_inches="tight"); plt.close(fig)

# Province chart
province_sorted = sorted(combined_provinces, key=lambda item:item["availability"], reverse=True)
fig, ax1 = plt.subplots(figsize=(8.4, 4.4))
names = [item["name"].replace(" PROVINCE", "") for item in province_sorted]
values = [item["availability"]*100 for item in province_sorted]
mos_values = [item["mos"] for item in province_sorted]
bars = ax1.barh(names[::-1], values[::-1], color=MID_GREEN)
ax1.set_xlim(0,100); ax1.set_xlabel("Availability (%)"); ax1.grid(axis="x", alpha=.25)
for bar,value in zip(bars,values[::-1]): ax1.text(value+1,bar.get_y()+bar.get_height()/2,f"{value:.1f}%",va="center",fontsize=8)
ax2=ax1.twiny(); ax2.plot(mos_values[::-1], range(len(names)), color=BLUE, marker="o", linewidth=1.8); ax2.set_xlabel("Average MOS",color=BLUE); ax2.set_xlim(0,max(5,max(mos_values)+1))
ax1.set_title("Provincial tracer availability and months of stock")
fig.tight_layout(); fig.savefig(chart_path("province_performance.png"), dpi=180, bbox_inches="tight"); plt.close(fig)

# Imbalance chart
categories = ["Stocked out", "Near critical\n(<1 MOS)", "Understocked\n(1-<2 MOS)", "According to\nplan (2-4 MOS)", "Above plan\n(>4 MOS)"]
imbalance_values = [
    combined_national["stockout"], combined_national["nearCritical"], combined_national["understocked"],
    combined_national["accordingToPlan"], combined_national["abovePlan"],
]
imbalance_pct = [value/combined_national["rows"]*100 for value in imbalance_values]
fig, ax=plt.subplots(figsize=(8.4,3.8))
bars=ax.bar(categories,imbalance_pct,color=[RED,"#E57E25",AMBER,GREEN,BLUE])
ax.set_ylim(0,max(35,max(imbalance_pct)+7));ax.set_ylabel("Share of submitted commodity rows (%)");ax.grid(axis="y",alpha=.25)
for bar,value in zip(bars,imbalance_pct): ax.text(bar.get_x()+bar.get_width()/2,value+1,f"{value:.1f}%",ha="center",weight="bold")
ax.set_title("National stock imbalance profile, pooled across Weeks 1 and 2")
fig.tight_layout();fig.savefig(chart_path("imbalances.png"),dpi=180,bbox_inches="tight");plt.close(fig)

# Programme chart
priority_programmes = sorted(combined_programmes, key=lambda item: (item["availability"], item["mos"]))[:14]
fig, ax1=plt.subplots(figsize=(8.5,5.2))
p_names=[item["name"] for item in priority_programmes][::-1]
p_avail=[item["availability"]*100 for item in priority_programmes][::-1]
p_mos=[item["mos"] for item in priority_programmes][::-1]
colors_list=[RED if value<60 else AMBER if value<75 else MID_GREEN for value in p_avail]
bars=ax1.barh(p_names,p_avail,color=colors_list);ax1.set_xlim(0,100);ax1.set_xlabel("Availability (%)");ax1.grid(axis="x",alpha=.25)
for bar,value in zip(bars,p_avail):ax1.text(value+1,bar.get_y()+bar.get_height()/2,f"{value:.0f}%",va="center",fontsize=8)
ax2=ax1.twiny();ax2.plot(p_mos,range(len(p_names)),color=BLUE,marker="o",linewidth=1.7);ax2.set_xlim(0,max(5,max(p_mos)+1));ax2.set_xlabel("Average MOS",color=BLUE)
ax1.set_title("Lowest-performing tracer programme categories")
fig.tight_layout();fig.savefig(chart_path("programmes.png"),dpi=180,bbox_inches="tight");plt.close(fig)

# reporting chart
expected = [w1["counts"]["expectedDistricts"], w2["counts"]["expectedDistricts"]]
submitted = [w1["counts"]["districtSubmissionFootprint"], w2["counts"]["districtSubmissionFootprint"]]
fig,ax=plt.subplots(figsize=(8.2,3.6))
x=range(2); width=.33
ax.bar([i-width/2 for i in x],expected,width,label="Expected districts",color="#C9D8D0")
ax.bar([i+width/2 for i in x],submitted,width,label="Districts submitted",color=GREEN)
ax.set_xticks(list(x),labels);ax.set_ylim(0,130);ax.set_ylabel("Districts");ax.grid(axis="y",alpha=.25);ax.legend(frameon=False,loc="upper left")
for i,(exp,sub) in enumerate(zip(expected,submitted)): ax.text(i+width/2,sub+3,f"{sub}/{exp} ({sub/exp*100:.1f}%)",ha="center",fontsize=9,weight="bold")
ax.set_title("District reporting completeness")
fig.tight_layout();fig.savefig(chart_path("reporting.png"),dpi=180,bbox_inches="tight");plt.close(fig)

# ZAMMSA weekly availability and central stock profile
stock_dates = sorted({item["date"] for item in weekly_stock})
emms = {item["date"]: item for item in weekly_stock if item["stream"] == "EMMS"}
lab = {item["date"]: item for item in weekly_stock if item["stream"] == "LAB"}
fig, ax = plt.subplots(figsize=(8.2, 3.3))
x = range(len(stock_dates)); width = .34
emms_values = [emms.get(date, {}).get("overallAvailability", 0) * 100 for date in stock_dates]
lab_values = [lab.get(date, {}).get("overallAvailability", 0) * 100 for date in stock_dates]
ax.bar([i-width/2 for i in x], emms_values, width, label="EMMS", color=GREEN)
ax.bar([i+width/2 for i in x], lab_values, width, label="Laboratory", color=BLUE)
ax.set_xticks(list(x), [datetime.fromisoformat(date).strftime("%d %b") for date in stock_dates]); ax.set_ylim(0,100)
ax.set_ylabel("Central availability (%)"); ax.grid(axis="y", alpha=.25); ax.legend(frameon=False, loc="upper right")
for i, (emms_value, lab_value) in enumerate(zip(emms_values, lab_values)):
    ax.text(i-width/2, emms_value+2, f"{emms_value:.1f}%", ha="center", fontsize=8, weight="bold")
    ax.text(i+width/2, lab_value+2, f"{lab_value:.1f}%", ha="center", fontsize=8, weight="bold")
ax.set_title("ZAMMSA weekly availability: EMMS and laboratory streams")
fig.tight_layout(); fig.savefig(chart_path("zammsa_weekly.png"), dpi=180, bbox_inches="tight"); plt.close(fig)

central_summary = central_report.get("summary", {}) if central_report else {}
central_categories = sorted(central_report.get("categories", []), key=lambda item: item.get("belowTwoMos", 0), reverse=True)[:10] if central_report else []
if central_categories:
    fig, ax = plt.subplots(figsize=(8.4, 4.0))
    labels = [item["name"] for item in central_categories][::-1]
    low = [item.get("belowTwoMos", 0) for item in central_categories][::-1]
    listed = [item.get("listed", 0) for item in central_categories][::-1]
    ax.barh(labels, listed, color="#D7E5DD", label="Listed")
    ax.barh(labels, low, color=AMBER, label="Below 2 MOS")
    ax.set_xlabel("Items"); ax.grid(axis="x", alpha=.22); ax.legend(frameon=False, loc="lower right")
    ax.set_title("Central stock categories with the most items below 2 MOS")
    fig.tight_layout(); fig.savefig(chart_path("zammsa_central_risk.png"), dpi=180, bbox_inches="tight"); plt.close(fig)

styles = getSampleStyleSheet()
styles.add(ParagraphStyle(name="TitleWhite", parent=styles["Title"], fontName="Helvetica-Bold", fontSize=28, leading=34, textColor=colors.white, alignment=TA_LEFT, spaceAfter=10))
styles.add(ParagraphStyle(name="HeadingGreen", parent=styles["Heading1"], fontName="Helvetica-Bold", fontSize=17, leading=21, textColor=colors.HexColor(DARK_GREEN), spaceAfter=8))
styles.add(ParagraphStyle(name="Subhead", parent=styles["Heading2"], fontName="Helvetica-Bold", fontSize=12, leading=15, textColor=colors.HexColor(GREEN), spaceBefore=5, spaceAfter=5))
styles.add(ParagraphStyle(name="Body", parent=styles["BodyText"], fontName="Helvetica", fontSize=9.2, leading=13, textColor=colors.HexColor(TEXT), spaceAfter=6))
styles.add(ParagraphStyle(name="Small", parent=styles["BodyText"], fontName="Helvetica", fontSize=7.5, leading=10, textColor=colors.HexColor(TEXT)))
styles.add(ParagraphStyle(name="KPI", parent=styles["BodyText"], fontName="Helvetica-Bold", fontSize=22, leading=25, textColor=colors.HexColor(GREEN), alignment=TA_CENTER))
styles.add(ParagraphStyle(name="KPIlabel", parent=styles["BodyText"], fontName="Helvetica-Bold", fontSize=8.5, leading=10, textColor=colors.HexColor(TEXT), alignment=TA_CENTER))

def heading(text): return Paragraph(text, styles["HeadingGreen"])
def body(text): return Paragraph(text, styles["Body"])
def small(text): return Paragraph(text, styles["Small"])

def kpi(label, value, note, color=GREEN):
    value_style = ParagraphStyle("x", parent=styles["KPI"], textColor=colors.HexColor(color))
    return Table([[Paragraph(label, styles["KPIlabel"])],[Paragraph(value, value_style)],[small(note)]], colWidths=[3.65*cm], rowHeights=[.55*cm,.92*cm,.62*cm], style=[("BOX",(0,0),(-1,-1),.5,colors.HexColor("#CCDCD4")),("BACKGROUND",(0,0),(-1,-1),colors.white),("VALIGN",(0,0),(-1,-1),"MIDDLE"),("LEFTPADDING",(0,0),(-1,-1),6),("RIGHTPADDING",(0,0),(-1,-1),6)])

def section_image(name, width=17.2*cm):
    # Pass dimensions in the constructor: setting drawWidth after construction can
    # retain the source image's original size in Platypus on some Windows builds.
    source_image = Image(str(chart_path(name)))
    height = source_image.imageHeight / source_image.imageWidth * width
    return Image(str(chart_path(name)), width=width, height=height)

def table(data, widths, header=True, font_size=8):
    converted=[]
    for row in data:
        converted.append([cell if hasattr(cell,"wrap") else small(str(cell)) for cell in row])
    result=Table(converted,colWidths=widths,repeatRows=1 if header else 0)
    style=[("GRID",(0,0),(-1,-1),.25,colors.HexColor("#D8E5DD")),("VALIGN",(0,0),(-1,-1),"TOP"),("LEFTPADDING",(0,0),(-1,-1),5),("RIGHTPADDING",(0,0),(-1,-1),5),("TOPPADDING",(0,0),(-1,-1),5),("BOTTOMPADDING",(0,0),(-1,-1),5)]
    if header: style += [("BACKGROUND",(0,0),(-1,0),colors.HexColor(DARK_GREEN)),("TEXTCOLOR",(0,0),(-1,0),colors.white),("FONTNAME",(0,0),(-1,0),"Helvetica-Bold")]
    result.setStyle(TableStyle(style)); return result

def page_number(canvas, document):
    canvas.saveState(); canvas.setStrokeColor(colors.HexColor(GREEN)); canvas.setLineWidth(1); canvas.line(1.35*cm,1.25*cm,A4[0]-1.35*cm,1.25*cm)
    canvas.setFont("Helvetica",7.5); canvas.setFillColor(colors.HexColor("#496158")); canvas.drawString(1.35*cm,.78*cm,"National Weekly Supply Chain Tracer Report | August 2026")
    canvas.drawRightString(A4[0]-1.35*cm,.78*cm,f"Page {document.page}"); canvas.restoreState()

story=[]
# Cover
cover = Table([[Paragraph("MINISTRY OF HEALTH<br/><font size=9>National Supply Chain Coordinating Unit</font>", ParagraphStyle("cover-left", parent=styles["Body"], textColor=colors.white, fontName="Helvetica-Bold", fontSize=13, leading=18)), Paragraph("WEEKLY TRACER AVAILABILITY REPORT", ParagraphStyle("cover-right",parent=styles["Body"],textColor=colors.white,fontName="Helvetica-Bold",fontSize=12,alignment=TA_CENTER))]], colWidths=[9.6*cm,8.2*cm], rowHeights=[2.2*cm], style=[("BACKGROUND",(0,0),(-1,-1),colors.HexColor(DARK_GREEN)),("VALIGN",(0,0),(-1,-1),"MIDDLE"),("LEFTPADDING",(0,0),(-1,-1),18),("RIGHTPADDING",(0,0),(-1,-1),18)])
story += [cover, Spacer(1,2.1*cm), Paragraph("National Weekly Supply Chain<br/>Tracer Report", styles["HeadingGreen"]), Spacer(1,.3*cm), Paragraph("Weeks 1 and 2, August 2026", ParagraphStyle("cover-title",parent=styles["Title"],fontName="Helvetica-Bold",fontSize=31,leading=37,textColor=colors.HexColor(DARK_GREEN))), Spacer(1,.55*cm), body("Reporting period: <b>9-16 August 2026</b><br/>Prepared by: <b>Zanga Musakuzi, Principal Pharmacist - Data Analytics</b>"), Spacer(1,1.2*cm)]
story += [Table([[Paragraph("<b>Purpose</b><br/>To provide a consolidated national overview of tracer commodity availability, stock adequacy, provincial performance, programme risks, and reporting completeness across the first two August reporting weeks.",styles["Body"]), Paragraph("<b>Data scope</b><br/>Weekly provincial tracer submissions for 9 and 16 August 2026. Central warehouse stock data was not supplied for this reporting period and is therefore not analysed in this report.",styles["Body"])]],colWidths=[8.7*cm,8.7*cm],style=[("BACKGROUND",(0,0),(-1,-1),colors.HexColor(LIGHT)),("BOX",(0,0),(-1,-1),.5,colors.HexColor("#C7DBD0")),("VALIGN",(0,0),(-1,-1),"TOP"),("LEFTPADDING",(0,0),(-1,-1),12),("RIGHTPADDING",(0,0),(-1,-1),12),("TOPPADDING",(0,0),(-1,-1),12),("BOTTOMPADDING",(0,0),(-1,-1),12)])]
story.append(PageBreak())

# National overview
story += [heading("A. National Overview"), body(f"The combined August Week 1 and Week 2 tracer review covers <b>{number(w1['counts']['rows'] + w2['counts']['rows'])}</b> submitted commodity rows from all <b>10 provinces</b>. National availability decreased modestly from <b>{pct(w1['national']['availability'])}</b> in Week 1 to <b>{pct(w2['national']['availability'])}</b> in Week 2, while average MOS declined from <b>{w1['national']['mos']:.2f}</b> to <b>{w2['national']['mos']:.2f}</b>. The pooled two-week availability was <b>{pct(combined_national['availability'])}</b>.")]
story.append(Table([[kpi("Week 2 availability",pct(w2['national']['availability']),"Selected latest reporting week"),kpi("Week 2 average MOS",f"{w2['national']['mos']:.2f}","Submitted stock position"),kpi("Week 2 stockout rate",pct(w2['national']['stockoutRate']),f"{number(w2['national']['stockout'])} commodity rows",RED),kpi("District reporting",f"{w2['counts']['districtSubmissionFootprint']}/{w2['counts']['expectedDistricts']}",f"{w2['counts']['districtSubmissionFootprint']/w2['counts']['expectedDistricts']*100:.1f}% completion")]],colWidths=[4.3*cm]*4,style=[("VALIGN",(0,0),(-1,-1),"TOP")]))
story += [Spacer(1,.45*cm),section_image("national_trend.png"),Spacer(1,.3*cm),heading("Level-of-care performance")]
story.append(section_image("level_of_care.png"))
story.append(body(f"Primary-care services remained strongest, with health posts at <b>{pct(find_level('Health Post')['availability'])}</b> availability and health centres at <b>{pct(find_level('Health Centre')['availability'])}</b>. Level 1, Level 2 and Level 3 hospital availability was {pct(find_level('Level 1 Hospital')['availability'])}, {pct(find_level('Level 2 Hospital')['availability'])}, and {pct(find_level('Level 3 Hospital')['availability'])}, respectively. Specialised service categories were reviewed separately because their reporting and commodity mix differs from hospital levels."))
story.append(PageBreak())

# Province
story += [heading("B. Provincial Tracer Availability"), body("Provincial results are pooled across the two August reporting weeks. Availability is the proportion of submitted tracer commodities with stock available; MOS reflects submitted stock on hand relative to average monthly consumption.") ,section_image("province_performance.png")]
province_rows=[["Province","Availability","Average MOS","Stockout rate","Submitted rows"]]
for item in province_sorted:
    province_rows.append([item["name"].title(),pct(item["availability"]),f"{item['mos']:.2f}",pct(item["stockoutRate"]),number(item["rows"])])
story.append(table(province_rows,[4.9*cm,3.0*cm,3.0*cm,3.0*cm,3.5*cm]))
top=province_sorted[0]; bottom=province_sorted[-1]
story.append(Spacer(1,.2*cm));story.append(body(f"<b>Interpretation.</b> {top['name'].title()} recorded the highest pooled availability ({pct(top['availability'])}); {bottom['name'].title()} recorded the lowest ({pct(bottom['availability'])}). Provinces with the highest stockout rates should prioritise validation of stock balances and redistribution planning alongside programme teams."))
story.append(PageBreak())

# Imbalances
story += [heading("C. National Stock Imbalances"), body("The imbalance profile uses all submitted commodity rows pooled across Weeks 1 and 2. Stock status follows the tracer convention: stocked out at zero MOS, near critical below one MOS, understocked from one to below two MOS, according to plan from two to four MOS, and above plan at more than four MOS."), section_image("imbalances.png")]
imbalance_rows=[["Stock status","Commodity rows","Share of pooled rows","Operational implication"]]
implications=["Immediate validation and replenishment", "Prevent progression to stockout", "Monitor and prioritise replenishment", "Maintain supply position", "Review for redistribution or consumption validation"]
for cat,value,rate,implication in zip(categories,imbalance_values,imbalance_pct,implications): imbalance_rows.append([cat.replace("\n"," "),number(value),f"{rate:.1f}%",implication])
story.append(table(imbalance_rows,[4.0*cm,3.0*cm,3.5*cm,7.0*cm]))
story.append(PageBreak())

# Programme
story += [heading("D. Product Category Availability"), body("The chart identifies programme categories with the lowest pooled availability across the two reporting weeks. Results should be interpreted with programme-specific tracer lists and reporting volumes in mind."),section_image("programmes.png")]
program_rows=[["Programme","Availability","Average MOS","Stockout rate","Risk rows"]]
for item in priority_programmes[:10]: program_rows.append([item["name"].title(),pct(item["availability"]),f"{item['mos']:.2f}",pct(item["stockoutRate"]),number(item["riskRows"])])
story.append(table(program_rows,[6.3*cm,3.0*cm,3.0*cm,3.0*cm,2.4*cm]))
story.append(PageBreak())

# ZAMMSA + reporting
story += [heading("E. ZAMMSA Central-Level Stock Status Analysis")]
if central_report:
    story.append(body(f"Matching ZAMMSA weekly inventory data was available for 7 and 14 August 2026, with the central MOS extract dated <b>{central_report['label']}</b>. EMMS availability decreased from <b>{emms_values[0]:.1f}%</b> to <b>{emms_values[-1]:.1f}%</b>, while laboratory availability decreased from <b>{lab_values[0]:.1f}%</b> to <b>{lab_values[-1]:.1f}%</b>. The central extract listed <b>{number(central_summary.get('listed', 0))}</b> commodities; <b>{number(central_summary.get('belowTwoMos', 0))}</b> were below two MOS and <b>{number(central_summary.get('mosDataGaps', 0))}</b> had unresolved MOS data gaps."))
    story.append(section_image("zammsa_weekly.png", width=15.8*cm))
    story.append(Spacer(1,.15*cm))
    if central_categories:
        story.append(section_image("zammsa_central_risk.png", width=15.8*cm))
else:
    story.append(body("A matching ZAMMSA central inventory extract was not available at the time of analysis."))
story += [PageBreak(), heading("F. Reporting Completeness and Data Quality"), body("District reporting is assessed using the primary-care reporting rule in the tracer dataset: health-centre and health-post submission are required for a district to be counted as submitted; hospital-only submissions do not count as primary-care district reporting."), section_image("reporting.png")]
missing_w1=", ".join(f"{item['district'].title()} ({item['province'].replace(' PROVINCE','').title()})" for item in w1["missingDistricts"])
missing_w2=", ".join(f"{item['district'].title()} ({item['province'].replace(' PROVINCE','').title()})" for item in w2["missingDistricts"])
story.append(body(f"<b>Week 1 gaps:</b> {missing_w1 or 'None identified.'}<br/><b>Week 2 gaps:</b> {missing_w2 or 'None identified.'}"))
story.append(PageBreak())

# Conclusion
story += [heading("Conclusion and Recommended Actions"), body(f"The combined review shows relatively stable national availability across the first two August reporting weeks, though the latest week declined to {pct(w2['national']['availability'])}. At the same time, {pct(w2['national']['stockoutRate'])} of Week 2 submitted commodity rows were stocked out, demonstrating that national availability alone should not be used as the sole operational signal."),heading("Priority actions for the coming week")]
actions=[
    ["1", "Validate high-stockout programme categories", "Review the lowest-availability programmes with programme managers and provincial pharmacists; confirm physical stock and order status."],
    ["2", "Act on provincial stockout signals", "Use the provincial performance table to prioritise targeted redistribution and replenishment discussions."],
    ["3", "Close remaining reporting gaps", "Follow up Week 2 missing district reports before the next national consolidation cycle."],
    ["4", "Use central stock to support action", "Reconcile central items below two MOS with facility stockouts, then identify urgent replenishment and redistribution decisions."],
]
story.append(table([["Priority","Action","Recommended next step"]]+actions,[1.5*cm,5.0*cm,10.7*cm]))
story += [Spacer(1,.5*cm),heading("Methodology note"),body("Availability and MOS are calculated from weekly provincial tracer submissions already cleaned for the dashboard. Two-week pooled metrics weight each weekly result by submitted commodity rows. District reporting uses the dashboard primary-care completeness rule. This report is analytical and should be used alongside validation of facility stock cards, transaction history, and central inventory before supply decisions are finalised.")]

document=SimpleDocTemplate(str(PDF_PATH),pagesize=A4,rightMargin=1.35*cm,leftMargin=1.35*cm,topMargin=1.25*cm,bottomMargin=1.65*cm)
document.build(story,onFirstPage=page_number,onLaterPages=page_number)
print(PDF_PATH)
