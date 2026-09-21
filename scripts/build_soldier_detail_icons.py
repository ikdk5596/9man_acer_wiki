"""Create soldier icons from saved roster/detail captures; preserve originals.

Uses clean roster captures, without popup frames or level badges.
Run from any working directory with Python + Pillow + NumPy + SciPy.
"""
from pathlib import Path
import argparse
import json
import os
from PIL import Image, ImageDraw, ImageFont
from soldier_color_regions import roster_regions, roster_icon

ROOT = Path(__file__).resolve().parents[1]
ASSETS = ROOT / "docs/public/images/soldiers"
SOURCES = ROOT.parent / '9man_wiki/wiki_assets/9man_acer_wiki_archive/docs/public/images/soldiers/_roster_raw2'
OUTPUT = ASSETS / "roster_icons"
DISPLAY_NAMES = json.loads((ROOT / 'scripts/data/soldier_names.json').read_text(encoding='utf-8'))
SCRATCH = Path("C:/Users/ikdk5/AppData/Local/hermes/cache/scratch")
ROSTER_NAMES = [
    "장창", "긴_창", "장과", "맥도",
    "장검", "쌍창", "칼과_방패", "무거운_방패",
    "창과_방패", "망치와_방패", "검과_방패", "도끼와_방패",
]


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--output', type=Path, default=OUTPUT)
    args = parser.parse_args()
    args.output.mkdir(parents=True, exist_ok=True)
    SCRATCH.mkdir(parents=True, exist_ok=True)
    # Sources and reading order are verified; no pixel coordinates are stored.
    mounted = [
        "장궁", "쇠뇌", "독궁", "사냥꾼",
        "강화_쇠뇌", "화궁", "기병_검", "기병_창",
        "기병_대도", "중기병", "기병_활", "기병_도끼",
    ]
    sources = [
        ('roster_full.png', ROSTER_NAMES, 12, 0),
        ('archers_cavalry.png', mounted, 12, 0),
        ('siege.png', ['투석차', '쇠뇌차'], 10, 8),
    ]
    crops = {}
    report = []
    for filename, names, expected, skip in sources:
        source = SOURCES / filename
        image = Image.open(source).convert('RGB')
        boxes = roster_regions(image)
        assert len(boxes) == expected, (filename, len(boxes), expected)
        selected = boxes[skip:]
        assert len(selected) == len(names)
        for name, box in zip(names, selected):
            assert name not in crops, name
            crops[name] = roster_icon(image, box)
            report.append({'name': name, 'source': os.path.relpath(source, ROOT), 'detected_box': box})
    assert len(crops) == 26, f"Expected 26 unique soldiers, got {len(crops)}"
    sheet = Image.new("RGB", (780, 650), "#fff7e7")
    draw = ImageDraw.Draw(sheet)
    font = ImageFont.truetype("C:/Windows/Fonts/malgun.ttf", 14)
    for index, (name, icon) in enumerate(crops.items()):
        icon.save(args.output / f"{name}.png")
        x, y = (index % 6) * 130, (index // 6) * 130
        thumb = icon.resize((82, 82), Image.Resampling.NEAREST)
        sheet.paste(thumb, (x + 24, y + 8), thumb)
        label = DISPLAY_NAMES.get(name, {}).get('name', name.replace("_", " "))
        draw.text((x + 2, y + 94), label, font=font, fill="black")
    sheet.save(SCRATCH / "soldier_detail_icons.jpg")
    (SCRATCH / 'soldier_roster_color_regions.json').write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding='utf-8')
    print(f"Created {len(crops)} color-region icons in {args.output}")
    print(SCRATCH / "soldier_detail_icons.jpg")


if __name__ == "__main__":
    main()
