from pathlib import Path

from PIL import Image, ImageDraw, ImageFont


OUTPUT = Path(__file__).resolve().parents[1] / "outputs" / "provincial-imbalances-week4-week5.png"
AVERAGE_OUTPUT = Path(__file__).resolve().parents[1] / "outputs" / "provincial-imbalances-two-week-average.png"
FONT_DIR = Path("C:/Windows/Fonts")

CATEGORIES = [
    ("According to plan (2–4 MOS)", "#00A651"),
    ("Emergency (>0–0.5 MOS)", "#ED7D31"),
    ("Excess stock (≥12 MOS)", "#BDD7EE"),
    ("Overstocked (>4–<12 MOS)", "#FFC000"),
    ("Understocked (>0.5–<2 MOS)", "#A5A5A5"),
    ("Stocked out (0 MOS)", "#E60000"),
]

PERIODS = [
    ("WEEK 4 — ENDING 26 JULY 2026", [
        ("CENTRAL", [27,14,0.1,31.1,19.8,8]), ("COPPERBELT", [16.7,24.5,0,22.1,16.2,20.6]),
        ("EASTERN", [21,23,0,20.9,21.3,13.8]), ("LUAPULA", [23.9,19,0.3,28,17.4,11.4]),
        ("LUSAKA", [22.2,12.6,0,27.9,19.7,17.7]), ("MUCHINGA", [24.1,10.1,0,31.6,15.8,18.4]),
        ("NORTH-WESTERN", [24.8,10.5,0.2,36.8,15.6,12.1]), ("NORTHERN", [17.1,24.9,0.2,26.4,15.3,16.1]),
        ("SOUTHERN", [18.4,23.3,0,25.6,16.4,16.4]), ("WESTERN", [20.1,20.8,0,19.7,18.8,20.7]),
        ("NATIONAL", [21.2,19.1,0.1,26.4,17.7,15.6]),
    ]),
    ("WEEK 5 — ENDING 2 AUGUST 2026", [
        ("CENTRAL", [25.8,9.3,0,30.1,18.4,16.3]), ("COPPERBELT", [18.4,25.9,0,22.3,14.7,18.7]),
        ("EASTERN", [20.4,21.7,0,22.8,20.6,14.5]), ("LUAPULA", [20.4,17.2,0,27.4,16.5,18.4]),
        ("LUSAKA", [23.6,4.8,0.1,25.2,18.2,28.1]), ("MUCHINGA", [28,2.5,0,29.7,16.8,22.9]),
        ("NORTH-WESTERN", [21.8,10,0,37.1,14.3,16.8]), ("NORTHERN", [17,24.8,0,26.5,15.2,16.5]),
        ("SOUTHERN", [18.5,9.9,0,27.6,15.4,28.5]), ("WESTERN", [16.5,22.8,0,22.3,20.4,18]),
        ("NATIONAL", [20.5,15.8,0,26.9,17,19.8]),
    ]),
]

AVERAGE_ROWS = [
    ("CENTRAL", [26.4,11.7,0.1,30.7,19.1,12.1]),
    ("COPPERBELT", [17.5,25.2,0,22.2,15.4,19.7]),
    ("EASTERN", [20.7,22.4,0,21.8,21,14.2]),
    ("LUAPULA", [22.1,18.1,0.1,27.7,17,15]),
    ("LUSAKA", [22.8,8.9,0.1,26.6,18.9,22.6]),
    ("MUCHINGA", [26.1,6.2,0,30.6,16.3,20.7]),
    ("NORTH-WESTERN", [23.3,10.3,0.1,36.9,14.9,14.5]),
    ("NORTHERN", [17.1,24.8,0.1,26.4,15.3,16.3]),
    ("SOUTHERN", [18.4,16.5,0,26.6,15.9,22.5]),
    ("WESTERN", [18.3,21.8,0,21,19.6,19.3]),
    ("NATIONAL", [20.8,17.5,0,26.7,17.3,17.7]),
]


def font(name, size):
    return ImageFont.truetype(str(FONT_DIR / name), size)


TITLE_FONT = font("arialbd.ttf", 34)
PANEL_FONT = font("arialbd.ttf", 27)
AXIS_FONT = font("arial.ttf", 18)
LABEL_FONT = font("arial.ttf", 17)
VALUE_FONT = font("arialbd.ttf", 15)
LEGEND_FONT = font("arial.ttf", 18)
NOTE_FONT = font("arial.ttf", 15)


def centered(draw, xy, text, used_font, fill="#333333"):
    box = draw.textbbox((0, 0), text, font=used_font)
    draw.text((xy[0] - (box[2] - box[0]) / 2, xy[1] - (box[3] - box[1]) / 2), text, font=used_font, fill=fill)


def rotated_label(image, center_x, top_y, text):
    box = LABEL_FONT.getbbox(text)
    label = Image.new("RGBA", (box[2] - box[0] + 16, box[3] - box[1] + 16), (255, 255, 255, 0))
    ImageDraw.Draw(label).text((8, 5), text, font=LABEL_FONT, fill="#555555")
    label = label.rotate(42, expand=True, resample=Image.Resampling.BICUBIC)
    image.alpha_composite(label, (int(center_x - label.width / 2), int(top_y)))


def draw_period(image, draw, title, rows, panel_top):
    left, right = 145, 1760
    plot_top, plot_bottom = panel_top + 65, panel_top + 530
    plot_height = plot_bottom - plot_top
    centered(draw, (950, panel_top + 20), title, PANEL_FONT, "#4F4F4F")

    for tick in range(0, 101, 10):
        y = plot_bottom - plot_height * tick / 100
        draw.line((left, y, right, y), fill="#D9D9D9", width=2)
        label = f"{tick}%"
        box = draw.textbbox((0, 0), label, font=AXIS_FONT)
        draw.text((left - 18 - (box[2] - box[0]), y - 9), label, font=AXIS_FONT, fill="#555555")

    plot_width = right - left
    step = plot_width / len(rows)
    bar_width = min(86, step * 0.64)
    for index, (province, values) in enumerate(rows):
        center_x = left + step * (index + 0.5)
        bottom_value = 0.0
        for category_index, value in enumerate(values):
            y_bottom = plot_bottom - plot_height * bottom_value / 100
            y_top = plot_bottom - plot_height * (bottom_value + value) / 100
            draw.rectangle((center_x - bar_width / 2, y_top, center_x + bar_width / 2, y_bottom), fill=CATEGORIES[category_index][1])
            if value >= 4:
                centered(draw, (center_x, (y_top + y_bottom) / 2), f"{value:.1f}%", VALUE_FONT, "#111111")
            bottom_value += value
        draw.rectangle((center_x - bar_width / 2, plot_top, center_x + bar_width / 2, plot_bottom), outline="#FFFFFF", width=1)
        rotated_label(image, center_x, plot_bottom + 8, province)

    draw.line((left, plot_top, left, plot_bottom), fill="#AFAFAF", width=2)
    draw.line((left, plot_bottom, right, plot_bottom), fill="#AFAFAF", width=2)


def draw_legend(draw, start_y=1530):
    positions = [(165, start_y), (650, start_y), (1120, start_y), (165, start_y + 50), (650, start_y + 50), (1120, start_y + 50)]
    for (label, colour), (x, y) in zip(CATEGORIES, positions):
        draw.rectangle((x, y, x + 22, y + 22), fill=colour)
        draw.text((x + 32, y - 1), label, font=LEGEND_FONT, fill="#555555")


def main():
    OUTPUT.parent.mkdir(parents=True, exist_ok=True)
    image = Image.new("RGBA", (1900, 1660), "white")
    draw = ImageDraw.Draw(image)
    centered(draw, (950, 45), "PROVINCIAL IMBALANCES — TWO-WEEK COMPARISON", TITLE_FONT, "#4F4F4F")
    draw_period(image, draw, PERIODS[0][0], PERIODS[0][1], 90)
    draw_period(image, draw, PERIODS[1][0], PERIODS[1][1], 790)
    draw_legend(draw)
    centered(draw, (950, 1640), "Source: cleaned national tracer submissions · Percentages may differ by 0.1% due to rounding", NOTE_FONT, "#666666")
    image.convert("RGB").save(OUTPUT, quality=95, dpi=(180, 180))
    print(OUTPUT)

    average = Image.new("RGBA", (1900, 920), "white")
    average_draw = ImageDraw.Draw(average)
    centered(average_draw, (950, 45), "PROVINCIAL IMBALANCES — COMBINED TWO-WEEK AVERAGE", TITLE_FONT, "#4F4F4F")
    draw_period(average, average_draw, "WEIGHTED AVERAGE: WEEK 4 + WEEK 5", AVERAGE_ROWS, 90)
    draw_legend(average_draw, 775)
    centered(average_draw, (950, 900), "Weighted by submitted commodity rows: 48,829 national observations across both weeks", NOTE_FONT, "#666666")
    average.convert("RGB").save(AVERAGE_OUTPUT, quality=95, dpi=(180, 180))
    print(AVERAGE_OUTPUT)


if __name__ == "__main__":
    main()
