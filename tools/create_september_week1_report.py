import json
import sys
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont
from docx import Document
from docx.enum.section import WD_SECTION
from docx.enum.text import WD_ALIGN_PARAGRAPH
from docx.enum.table import WD_CELL_VERTICAL_ALIGNMENT
from docx.oxml import OxmlElement
from docx.oxml.ns import qn
from docx.shared import Inches, Pt, RGBColor


GREEN = "006B4F"
DARK = "102A43"
LIGHT_GREEN = "E8F3EE"
LIGHT_BLUE = "EAF2F8"
LIGHT_RED = "FCEDEC"
GRID = "D9E2E7"


def shade(cell, color):
    cell_pr = cell._tc.get_or_add_tcPr()
    shd = OxmlElement("w:shd")
    shd.set(qn("w:fill"), color)
    cell_pr.append(shd)


def set_cell_border(cell, color=GRID):
    tc_pr = cell._tc.get_or_add_tcPr()
    borders = tc_pr.first_child_found_in("w:tcBorders")
    if borders is None:
        borders = OxmlElement("w:tcBorders")
        tc_pr.append(borders)
    for edge in ("top", "left", "bottom", "right"):
        tag = "w:" + edge
        element = borders.find(qn(tag))
        if element is None:
            element = OxmlElement(tag)
            borders.append(element)
        element.set(qn("w:val"), "single")
        element.set(qn("w:sz"), "4")
        element.set(qn("w:color"), color)


def set_cell_text(cell, text, bold=False, color="000000", size=9, align=WD_ALIGN_PARAGRAPH.LEFT):
    cell.text = ""
    paragraph = cell.paragraphs[0]
    paragraph.alignment = align
    paragraph.paragraph_format.space_after = Pt(0)
    run = paragraph.add_run(str(text))
    run.bold = bold
    run.font.name = "Aptos"
    run.font.size = Pt(size)
    run.font.color.rgb = RGBColor.from_string(color)
    cell.vertical_alignment = WD_CELL_VERTICAL_ALIGNMENT.CENTER
    set_cell_border(cell)


def add_table(document, headers, rows, widths=None):
    table = document.add_table(rows=1, cols=len(headers))
    table.style = "Table Grid"
    table.autofit = False
    for index, header in enumerate(headers):
        cell = table.rows[0].cells[index]
        shade(cell, GREEN)
        set_cell_text(cell, header, bold=True, color="FFFFFF", size=8, align=WD_ALIGN_PARAGRAPH.CENTER)
        if widths:
            cell.width = Inches(widths[index])
    for row_index, row in enumerate(rows):
        cells = table.add_row().cells
        for index, value in enumerate(row):
            if row_index % 2 == 1:
                shade(cells[index], "F7FAF8")
            alignment = WD_ALIGN_PARAGRAPH.CENTER if index else WD_ALIGN_PARAGRAPH.LEFT
            set_cell_text(cells[index], value, size=8, align=alignment)
            if widths:
                cells[index].width = Inches(widths[index])
    document.add_paragraph().paragraph_format.space_after = Pt(2)
    return table


def add_heading(document, text):
    paragraph = document.add_paragraph()
    paragraph.style = document.styles["Heading 1"]
    paragraph.paragraph_format.space_before = Pt(13)
    paragraph.paragraph_format.space_after = Pt(6)
    run = paragraph.add_run(text)
    run.font.color.rgb = RGBColor(0, 0, 0)
    return paragraph


def add_body(document, text):
    paragraph = document.add_paragraph()
    paragraph.style = document.styles["Normal"]
    paragraph.paragraph_format.space_after = Pt(7)
    paragraph.paragraph_format.line_spacing = 1.12
    paragraph.add_run(text)
    return paragraph


def add_bullet(document, text):
    paragraph = document.add_paragraph(style="List Bullet")
    paragraph.paragraph_format.space_after = Pt(3)
    paragraph.add_run(text)


def add_figure(document, image_path, caption, width=6.45):
    paragraph = document.add_paragraph()
    paragraph.alignment = WD_ALIGN_PARAGRAPH.CENTER
    paragraph.paragraph_format.space_after = Pt(2)
    paragraph.add_run().add_picture(str(image_path), width=Inches(width))
    caption_p = document.add_paragraph()
    caption_p.alignment = WD_ALIGN_PARAGRAPH.CENTER
    caption_p.paragraph_format.space_after = Pt(8)
    run = caption_p.add_run(caption)
    run.italic = True
    run.font.size = Pt(8)
    run.font.color.rgb = RGBColor(70, 85, 95)


def name(value):
    return value.title().replace("North-Western", "North-Western").replace("Tb-", "TB-")


def pct(value):
    return f"{value * 100:.1f}%"


def mos(value):
    return f"{value:.2f}"


def create_charts(data, outdir):
    period = data["period"]
    previous = data["previous"]
    outdir.mkdir(parents=True, exist_ok=True)
    plt.rcParams.update({"font.family": "DejaVu Sans", "font.size": 9})

    national = period["national"]
    statuses = [
        ("Stocked out", national["stockout"], "#C0392B"),
        ("Emergency", national["nearCritical"], "#F39C12"),
        ("Understocked", national["understocked"], "#F4D03F"),
        ("According to plan", national["accordingToPlan"], "#239B56"),
        ("Overstocked", national["abovePlan"], "#2874A6"),
        ("MOS data gap", national["dataGap"], "#95A5A6"),
    ]
    fig, ax = plt.subplots(figsize=(8.1, 3.8))
    labels = [x[0] for x in statuses]
    values = [x[1] / national["rows"] * 100 for x in statuses]
    bars = ax.bar(labels, values, color=[x[2] for x in statuses])
    ax.set_ylim(0, max(values) + 7)
    ax.set_ylabel("Submitted commodity rows (%)")
    ax.set_title("National stock status profile, 6 September 2026", loc="left", fontweight="bold", color=DARK)
    ax.spines[["top", "right"]].set_visible(False)
    ax.grid(axis="y", color="#E5ECEA")
    ax.set_axisbelow(True)
    for bar, value in zip(bars, values):
        ax.text(bar.get_x() + bar.get_width() / 2, value + .8, f"{value:.1f}%", ha="center", fontweight="bold")
    fig.tight_layout(); fig.savefig(outdir / "stock_status.png", dpi=220); plt.close(fig)

    provinces = sorted(period["provinces"], key=lambda x: x["availability"])
    fig, ax1 = plt.subplots(figsize=(8.1, 4.7))
    labels = [name(x["name"].replace(" PROVINCE", "")) for x in provinces]
    availability = [x["availability"] * 100 for x in provinces]
    ax1.barh(labels, availability, color="#239B56")
    ax1.set_xlim(70, 100); ax1.set_xlabel("Availability (%)")
    ax1.set_title("Provincial tracer availability and average MOS", loc="left", fontweight="bold", color=DARK)
    ax1.grid(axis="x", color="#E5ECEA"); ax1.set_axisbelow(True)
    ax2 = ax1.twiny(); ax2.plot([x["mos"] for x in provinces], labels, "o-", color="#1F4E79", linewidth=2, label="Average MOS")
    ax2.set_xlim(0, 5); ax2.set_xlabel("Average MOS")
    for y, item in enumerate(provinces): ax1.text(item["availability"] * 100 + .35, y, pct(item["availability"]), va="center", fontsize=8)
    fig.tight_layout(); fig.savefig(outdir / "province_availability.png", dpi=220); plt.close(fig)

    level_map = {x["name"]: x for x in period["facilityLevels"]}
    levels = ["HEALTH CENTRE", "HEALTH POST", "LEVEL 1 HOSPITAL", "LEVEL 2/GENERAL HOSPITAL", "LEVEL 3 HOSPITAL"]
    selected = [level_map[x] for x in levels]
    fig, ax1 = plt.subplots(figsize=(8.1, 3.9))
    labels = ["Health centre", "Health post", "Level 1", "Level 2", "Level 3"]
    x = list(range(len(labels)))
    ax1.bar(x, [item["availability"] * 100 for item in selected], color="#60B15D", width=.58)
    ax1.set_ylim(0, 105); ax1.set_xticks(x, labels); ax1.set_ylabel("Availability (%)")
    ax1.set_title("Level of care performance", loc="left", fontweight="bold", color=DARK)
    ax1.grid(axis="y", color="#E5ECEA"); ax1.set_axisbelow(True)
    ax2 = ax1.twinx(); ax2.plot(x, [item["mos"] for item in selected], "o-", color="#1F4E79", linewidth=2.5); ax2.set_ylim(0, 5); ax2.set_ylabel("Average MOS")
    for i, item in enumerate(selected): ax1.text(i, item["availability"] * 100 + 2, pct(item["availability"]), ha="center", fontweight="bold", fontsize=8)
    fig.tight_layout(); fig.savefig(outdir / "level_of_care.png", dpi=220); plt.close(fig)

    focus = sorted(period["programmes"], key=lambda x: x["availability"])[:8]
    fig, ax = plt.subplots(figsize=(8.1, 4.2))
    labels = [name(x["name"]).replace("Tb-Ds/Tb-Mdr Units", "TB-DS/TB-MDR") for x in focus]
    values = [x["availability"] * 100 for x in focus]
    ax.barh(labels[::-1], values[::-1], color="#D3544D")
    ax.set_xlim(0, 100); ax.set_xlabel("Availability (%)")
    ax.set_title("Lowest-performing programmes and specialised reporting units", loc="left", fontweight="bold", color=DARK)
    ax.grid(axis="x", color="#E5ECEA"); ax.set_axisbelow(True)
    for y, value in enumerate(values[::-1]): ax.text(value + 1.2, y, f"{value:.1f}%", va="center", fontsize=8)
    fig.tight_layout(); fig.savefig(outdir / "programme_availability.png", dpi=220); plt.close(fig)

    fig, ax = plt.subplots(figsize=(7.6, 3.7))
    labels = ["30 Aug", "6 Sep"]
    values = [previous["counts"].get("districts", 116) / 116 * 100, period["counts"]["districts"] / period["counts"]["expectedDistricts"] * 100]
    bars = ax.bar(labels, values, color=["#6C9BD2", "#239B56"], width=.48)
    ax.set_ylim(0, 105); ax.set_ylabel("Complete district reports (%)")
    ax.set_title("Reporting completeness", loc="left", fontweight="bold", color=DARK)
    ax.spines[["top", "right"]].set_visible(False); ax.grid(axis="y", color="#E5ECEA"); ax.set_axisbelow(True)
    for bar, value, count in zip(bars, values, [previous["counts"].get("districts", 116), period["counts"]["districts"]]): ax.text(bar.get_x()+bar.get_width()/2, value+2, f"{count}/116\n{value:.1f}%", ha="center", fontweight="bold")
    fig.tight_layout(); fig.savefig(outdir / "reporting_completeness.png", dpi=220); plt.close(fig)


def create_charts(data, outdir):
    """Create compact report graphics without a Matplotlib dependency."""
    period = data["period"]
    previous = data["previous"]
    outdir.mkdir(parents=True, exist_ok=True)
    font_path = r"C:\Windows\Fonts\arial.ttf"
    bold_path = r"C:\Windows\Fonts\arialbd.ttf"
    font = lambda size, bold=False: ImageFont.truetype(bold_path if bold else font_path, size)
    navy, green, pale, grid = "#102A43", "#239B56", "#F6FAF8", "#D9E2E7"

    def canvas(title, height=760):
        image = Image.new("RGB", (1600, height), "white")
        draw = ImageDraw.Draw(image)
        draw.text((70, 42), title, font=font(35, True), fill=navy)
        return image, draw

    def hbar(path, title, labels, values, suffix="%", colors=None):
        image, draw = canvas(title, max(540, 155 + len(labels) * 62))
        left, right, top = 430, 1450, 125
        max_value = max(values) or 1
        for index, (label, value) in enumerate(zip(labels, values)):
            y = top + index * 58
            draw.text((70, y + 8), label, font=font(22), fill=navy)
            draw.rounded_rectangle((left, y, right, y + 34), radius=5, fill=pale)
            width = int((right - left) * value / max_value)
            draw.rounded_rectangle((left, y, left + width, y + 34), radius=5, fill=(colors[index] if colors else green))
            draw.text((left + width + 14, y + 4), f"{value:.1f}{suffix}", font=font(20, True), fill=navy)
        image.save(path)

    def vbar(path, title, labels, values, colors):
        image, draw = canvas(title, 660)
        left, right, baseline, top = 100, 1500, 540, 145
        max_value = max(values) * 1.18
        gap = 25; width = (right - left - gap * (len(values) - 1)) / len(values)
        for index, (label, value, color) in enumerate(zip(labels, values, colors)):
            x = left + index * (width + gap)
            y = baseline - int((baseline - top) * value / max_value)
            draw.rounded_rectangle((x, y, x + width, baseline), radius=7, fill=color)
            text = f"{value:.1f}%"
            box = draw.textbbox((0, 0), text, font=font(22, True))
            draw.text((x + (width - (box[2] - box[0])) / 2, y - 32), text, font=font(22, True), fill=navy)
            lines = label.split(" ")
            for line_i, line in enumerate(lines):
                box = draw.textbbox((0, 0), line, font=font(17))
                draw.text((x + (width - (box[2] - box[0])) / 2, baseline + 13 + line_i * 20), line, font=font(17), fill=navy)
        image.save(path)

    national = period["national"]
    labels = ["Stocked out", "Emergency", "Understocked", "According to plan", "Overstocked", "MOS data gap"]
    values = [national[key] / national["rows"] * 100 for key in ["stockout", "nearCritical", "understocked", "accordingToPlan", "abovePlan", "dataGap"]]
    vbar(outdir / "stock_status.png", "National stock status profile, 6 September 2026", labels, values, ["#C0392B", "#F39C12", "#F4D03F", "#239B56", "#2874A6", "#95A5A6"])

    provinces = sorted(period["provinces"], key=lambda x: x["availability"])
    hbar(outdir / "province_availability.png", "Provincial tracer availability", [name(x["name"].replace(" PROVINCE", "")) for x in provinces], [x["availability"] * 100 for x in provinces])

    level_map = {x["name"]: x for x in period["facilityLevels"]}
    levels = [level_map[x] for x in ["HEALTH CENTRE", "HEALTH POST", "LEVEL 1 HOSPITAL", "LEVEL 2/GENERAL HOSPITAL", "LEVEL 3 HOSPITAL"]]
    vbar(outdir / "level_of_care.png", "Availability by level of care", ["Health centre", "Health post", "Level 1", "Level 2", "Level 3"], [x["availability"] * 100 for x in levels], ["#60B15D"] * 5)

    focus = sorted(period["programmes"], key=lambda x: x["availability"])[:8]
    hbar(outdir / "programme_availability.png", "Lowest-performing programmes and specialised reporting units", [name(x["name"]).replace("Tb-Ds/Tb-Mdr Units", "TB-DS/TB-MDR") for x in focus], [x["availability"] * 100 for x in focus], colors=["#D3544D"] * len(focus))

    counts = [previous["counts"].get("districts", 116) / 116 * 100, period["counts"]["districts"] / period["counts"]["expectedDistricts"] * 100]
    vbar(outdir / "reporting_completeness.png", "Complete district reporting", ["30 Aug", "6 Sep"], counts, ["#6C9BD2", "#239B56"])


def build_report(data_path, output_path):
    data = json.loads(Path(data_path).read_text(encoding="utf-8"))
    output_path.parent.mkdir(parents=True, exist_ok=True)
    period = data["period"]
    previous = data["previous"]
    central = data["central"]
    charts = output_path.parent / "charts"
    create_charts(data, charts)

    doc = Document()
    section = doc.sections[0]
    section.top_margin = Inches(.65); section.bottom_margin = Inches(.65)
    section.left_margin = Inches(.7); section.right_margin = Inches(.7)
    section.header_distance = Inches(.25); section.footer_distance = Inches(.3)
    normal = doc.styles["Normal"]
    normal.font.name = "Aptos"; normal.font.size = Pt(10); normal.font.color.rgb = RGBColor(28, 48, 61)
    for style_name, size in [("Title", 22), ("Heading 1", 13), ("Heading 2", 11)]:
        style = doc.styles[style_name]; style.font.name = "Aptos Display"; style.font.size = Pt(size); style.font.bold = True; style.font.color.rgb = RGBColor(0, 0, 0)
    header = section.header.paragraphs[0]
    header.text = "MINISTRY OF HEALTH ZAMBIA   |   NATIONAL SUPPLY CHAIN COORDINATING UNIT"
    header.alignment = WD_ALIGN_PARAGRAPH.CENTER
    for run in header.runs: run.font.size = Pt(8); run.font.bold = True; run.font.color.rgb = RGBColor.from_string(GREEN)
    footer = section.footer.paragraphs[0]; footer.alignment = WD_ALIGN_PARAGRAPH.CENTER
    footer.add_run("Weekly Tracer Availability Report | 6 September 2026")
    for run in footer.runs: run.font.size = Pt(8); run.font.color.rgb = RGBColor(85, 100, 105)

    p = doc.add_paragraph(); p.alignment = WD_ALIGN_PARAGRAPH.CENTER; p.paragraph_format.space_before = Pt(50)
    r = p.add_run("MINISTRY OF HEALTH"); r.bold = True; r.font.size = Pt(14); r.font.color.rgb = RGBColor.from_string(GREEN)
    p = doc.add_paragraph(); p.alignment = WD_ALIGN_PARAGRAPH.CENTER
    r = p.add_run("WEEKLY TRACER AVAILABILITY REPORT"); r.bold = True; r.font.size = Pt(23); r.font.color.rgb = RGBColor(0, 0, 0)
    p = doc.add_paragraph(); p.alignment = WD_ALIGN_PARAGRAPH.CENTER
    r = p.add_run("Reporting period: Week 1 ending 6 September 2026"); r.font.size = Pt(13); r.font.color.rgb = RGBColor.from_string(DARK)
    doc.add_paragraph()
    table = doc.add_table(rows=3, cols=2); table.autofit = False
    meta = [("Prepared by", "Zanga Musakuzi"), ("Role", "Principal Pharmacist - Data Analyst"), ("Data source", "Ten provincial weekly tracer submissions")]
    for index, (label, value) in enumerate(meta):
        shade(table.rows[index].cells[0], LIGHT_GREEN)
        set_cell_text(table.rows[index].cells[0], label, bold=True, color=GREEN, size=10)
        set_cell_text(table.rows[index].cells[1], value, size=10)
    doc.add_page_break()

    add_heading(doc, "A. National Overview")
    availability_delta = (period["national"]["availability"] - previous["national"]["availability"]) * 100
    mos_delta = period["national"]["mos"] - previous["national"]["mos"]
    add_body(doc, f"For the reporting week ending 6 September 2026, tracer commodity data from all 10 provinces was analysed. Complete primary-care reporting was received from {period['counts']['districts']} of {period['counts']['expectedDistricts']} districts ({period['counts']['districts'] / period['counts']['expectedDistricts'] * 100:.1f}%). National tracer commodity availability was {pct(period['national']['availability'])}, compared with {pct(previous['national']['availability'])} on 30 August 2026, a change of {availability_delta:+.1f} percentage points. Average Months of Stock (MOS) was {mos(period['national']['mos'])} months, compared with {mos(previous['national']['mos'])} months in the preceding week ({mos_delta:+.2f} months).")
    add_body(doc, f"The stock-status profile remains imbalanced. Of {period['national']['rows']:,} submitted commodity rows, {pct(period['national']['stockout'] / period['national']['rows'])} were stocked out, {pct(period['national']['nearCritical'] / period['national']['rows'])} were at emergency level, and {pct(period['national']['understocked'] / period['national']['rows'])} were understocked. Only {pct(period['national']['accordingToPlan'] / period['national']['rows'])} were within the 2-4 MOS planning range, while {pct(period['national']['abovePlan'] / period['national']['rows'])} were above plan. This coexistence of shortages and high stock holdings supports targeted redistribution alongside replenishment.")
    add_figure(doc, charts / "stock_status.png", "Figure 1. National stock status profile based on submitted commodity rows.")

    add_heading(doc, "B. Provincial Tracer Availability")
    provinces = sorted(period["provinces"], key=lambda x: x["availability"])
    add_body(doc, f"Provincial availability ranged from {pct(provinces[0]['availability'])} in {name(provinces[0]['name'])} to {pct(provinces[-1]['availability'])} in {name(provinces[-1]['name'])}. Central Province recorded the highest availability ({pct(provinces[-1]['availability'])}) and North-Western Province the lowest ({pct(provinces[0]['availability'])}). North-Western Province nevertheless held 4.26 months of stock on average, illustrating that aggregate stock coverage can coexist with lower item-level availability and uneven commodity distribution.")
    add_table(doc, ["Province", "Availability", "Average MOS", "Stock-out rate"], [[name(x['name'].replace(' PROVINCE','')), pct(x['availability']), mos(x['mos']), pct(x['stockoutRate'])] for x in provinces], [2.5, 1.1, 1.1, 1.1])
    add_figure(doc, charts / "province_availability.png", "Figure 2. Provincial tracer availability and average MOS.")

    add_heading(doc, "C. Level of Care Performance")
    level_map = {x['name']: x for x in period['facilityLevels']}
    hc, hp, l1, l2, l3 = [level_map[x] for x in ['HEALTH CENTRE','HEALTH POST','LEVEL 1 HOSPITAL','LEVEL 2/GENERAL HOSPITAL','LEVEL 3 HOSPITAL']]
    primary_rows = hc['rows'] + hp['rows']
    primary_availability = (hc['availability'] * hc['rows'] + hp['availability'] * hp['rows']) / primary_rows
    primary_mos = (hc['mos'] * hc['rows'] + hp['mos'] * hp['rows']) / primary_rows
    add_body(doc, f"Primary healthcare facilities remained the strongest-performing level of care, with combined Health Centre and Health Post availability of {pct(primary_availability)} and average MOS of {mos(primary_mos)} months. Level 1 hospitals recorded {pct(l1['availability'])} availability and {mos(l1['mos'])} MOS. Level 2 hospitals recorded {pct(l2['availability'])} availability and {mos(l2['mos'])} MOS, while Level 3 hospitals recorded {pct(l3['availability'])} availability and {mos(l3['mos'])} MOS. The lower availability at referral-level facilities requires closer review of order fulfilment, redistribution, and specialised commodity availability.")
    add_figure(doc, charts / "level_of_care.png", "Figure 3. Availability and average MOS by level of care.")

    doc.add_page_break()
    add_heading(doc, "D. Programme and Specialised Service Pressures")
    focus = sorted(period['programmes'], key=lambda x: x['availability'])[:5]
    add_body(doc, "The lowest-performing programme and specialised reporting areas were TB-DS/TB-MDR units, Mental Health Units, Renal Units, Eye/Ophthalmology Hospitals, and Cancer services. These areas combine low availability with substantial stock-out rates and should be prioritised for commodity-level review with the relevant programmes and facilities.")
    add_table(doc, ["Programme or unit", "Availability", "MOS", "Stock-out rate"], [[name(x['name']).replace('Tb-Ds/Tb-Mdr Units','TB-DS/TB-MDR'), pct(x['availability']), mos(x['mos']), pct(x['stockoutRate'])] for x in focus], [2.8, 1.0, .8, 1.2])
    add_figure(doc, charts / "programme_availability.png", "Figure 4. Lowest-performing programmes and specialised reporting units.")

    add_heading(doc, "E. ZAMMSA Central Level Stock Status")
    add_body(doc, f"The latest available ZAMMSA central warehouse snapshot is dated {central['label']}. It lists {central['summary']['listed']:,} ordering codes, of which {central['summary']['belowTwoMos']} were below 2 MOS, {central['summary']['twoToFourMos']} were within 2-4 MOS, and {central['summary']['mosDataGaps']} had MOS data gaps. This central snapshot predates the September tracer reporting week and is presented as contextual information rather than as a same-week comparison.")
    add_body(doc, "The facility-level profile continues to show that availability at central level alone does not guarantee availability at service delivery points. Commodities with adequate central stock but low facility availability should be reviewed for allocation, order fulfilment, and distribution barriers. Commodities constrained at both levels should be prioritised for supply planning and replenishment.")
    categories = central.get('categories', [])[:8]
    if categories:
        add_table(doc, ["Central category", "Listed", "Below 2 MOS", "MOS data gaps"], [[x['name'], x['listed'], x['belowTwoMos'], x['mosDataGaps']] for x in categories], [2.8, .9, 1.1, 1.2])

    add_heading(doc, "F. Reporting Completeness and Data Quality")
    incomplete = [f"{x['district'].title()}, {x['province'].title().replace(' Province','')} Province" for x in period['missingDistricts']]
    add_body(doc, f"The Data Quality Gate counted a district as complete only where both Health Centre and Health Post reporting were present, or where a combined primary-care report was submitted. For the week ending 6 September, {period['counts']['districts']} of {period['counts']['expectedDistricts']} districts ({period['counts']['districts'] / period['counts']['expectedDistricts'] * 100:.1f}%) met this rule. The following districts remain incomplete: {', '.join(incomplete)}.")
    add_body(doc, "Of the incomplete districts, Chitambo, Manyinga and Monze had partial primary-care reporting, while Chama and Mongu did not meet the complete primary-care reporting criterion. These gaps should be followed up with the relevant Provincial and District Health Offices before the next reporting cycle. MOS data gaps were also recorded in 1,122 submitted commodity rows and should be resolved before using those rows for stock-cover decisions.")
    add_figure(doc, charts / "reporting_completeness.png", "Figure 5. Complete district reporting under the Health Centre and Health Post rule.")

    add_heading(doc, "G. Priority Actions")
    for action in [
        "Prioritise replenishment and redistribution for stock-outs, emergency stock and understocked commodities, with emphasis on specialised services and referral facilities.",
        "Review North-Western Province, Lusaka Province and Northern Province for low availability and high stock-out burden; use commodity-level data to identify transfers within and between provinces.",
        "Follow up Chitambo, Chama, Manyinga, Monze and Mongu districts to secure complete Health Centre and Health Post reports in the next reporting week.",
        "Resolve MOS data gaps before using affected items for procurement, redistribution or forecast decisions.",
        "Use the latest ZAMMSA stock snapshot with the tracer findings to distinguish central supply constraints from allocation and distribution gaps.",
    ]:
        add_bullet(doc, action)

    doc.save(output_path)


if __name__ == "__main__":
    build_report(Path(sys.argv[1]), Path(sys.argv[2]))
