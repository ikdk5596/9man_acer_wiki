"""Create soldier icons from saved roster/detail captures; preserve originals.

Uses the roster art where available and popup-relative portrait crops otherwise.
Run from any working directory with Python + Pillow + numpy.
"""
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parents[1]
ASSETS = ROOT / "docs/public/images/soldiers"
OUTPUT = ASSETS / "detail_icons"
SCRATCH = Path("C:/Users/ikdk5/AppData/Local/hermes/cache/scratch")
ROSTER_NAMES = [
    "장창", "긴_창", "장과", "맥도",
    "장검", "쌍창", "칼과_방패", "무거운_방패",
    "창과_방패", "망치와_방패", "검과_방패", "도끼와_방패",
]


def popup_icon(source):
    image = Image.open(source).convert("RGB")
    pixels = np.asarray(image).astype(int)
    mask = np.all(np.abs(pixels - (255, 247, 231)) <= 8, axis=2)
    ys, xs = np.where(mask)
    if not len(xs):
        raise ValueError(f"No popup background: {source}")
    x, y = int(xs.min()), int(ys.min())
    # Recalibrated for 958px-wide saved captures, not the older 1028px UI.
    # Cavalry helmets protrude above the frame: retain the whole 77px square.
    return image.crop((x + 7, y + 2, x + 84, y + 79))


def main():
    OUTPUT.mkdir(parents=True, exist_ok=True)
    SCRATCH.mkdir(parents=True, exist_ok=True)
    roster = Image.open(ASSETS / "_roster_raw2/roster_full.png").convert("RGB")
    crops = {}
    for index, name in enumerate(ROSTER_NAMES):
        x = [239, 358, 477, 596][index % 4]
        y = [297, 451, 605][index // 4]
        crops[name] = roster.crop((x, y, x + 82, y + 82))
    retake = ASSETS / "_roster_raw2/archers_cavalry.png"
    if retake.exists():
        image = Image.open(retake).convert("RGB")
        names = [
            "장궁", "쇠뇌", "독궁", "사냥꾼",
            "강화_쇠뇌", "화궁", "기병_검", "기병_창",
            "기병_대도", "중기병", "기병_활", "기병_도끼",
        ]
        for index, name in enumerate(names):
            x = [239, 358, 477, 596][index % 4]
            y = [303, 457, 611][index // 4]
            crops[name] = image.crop((x, y, x + 82, y + 82))
    siege = ASSETS / "_roster_raw2/siege.png"
    if siege.exists():
        image = Image.open(siege).convert("RGB")
        for name, x in [("투석차", 239), ("쇠뇌차", 358)]:
            crops[name] = image.crop((x, 669, x + 82, 751))
    for folder in sorted(ASSETS.iterdir()):
        if not folder.is_dir() or not folder.name.endswith(("_raw", "_raw2")) or folder.name.startswith("_"):
            continue
        name = folder.name.removesuffix("_raw2").removesuffix("_raw")
        if name in crops:
            continue
        source = folder / "level01.png"
        if not source.exists():
            source = folder / "base.png"
        crops[name] = popup_icon(source)
    assert len(crops) == 26, f"Expected 26 unique soldiers, got {len(crops)}"
    sheet = Image.new("RGB", (780, 650), "#fff7e7")
    draw = ImageDraw.Draw(sheet)
    font = ImageFont.truetype("C:/Windows/Fonts/malgun.ttf", 14)
    for index, (name, icon) in enumerate(crops.items()):
        icon.save(OUTPUT / f"{name}.png")
        x, y = (index % 6) * 130, (index // 6) * 130
        sheet.paste(icon.resize((82, 82), Image.Resampling.NEAREST), (x + 24, y + 8))
        draw.text((x + 2, y + 94), name.replace("_", " "), font=font, fill="black")
    sheet.save(SCRATCH / "soldier_detail_icons.jpg")
    print(f"Created {len(crops)} icons in {OUTPUT}")
    print(SCRATCH / "soldier_detail_icons.jpg")


if __name__ == "__main__":
    main()
