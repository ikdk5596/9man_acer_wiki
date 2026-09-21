"""Rebuild the six approved skill icons using detected color boundaries."""
from pathlib import Path
import argparse
import hashlib
import json
from PIL import Image, ImageDraw, ImageFont
from soldier_color_regions import skill_regions

ROOT = Path(__file__).resolve().parents[1]
SOURCES = ROOT.parent / '9man_wiki/wiki_assets/soldier_skill_retakes'
OUTPUT = ROOT / 'docs/public/images/soldiers'
SCRATCH = Path('C:/Users/ikdk5/AppData/Local/hermes/cache/scratch')
SKILLS = {'장창': ['기병_압도', '찌르기'], '긴_창': ['기병_압도', '투사'],
          '장검': ['기병_압도', '폭풍참']}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--output', type=Path, default=OUTPUT)
    args = parser.parse_args()
    crops = []
    for name, skills in SKILLS.items():
        source = SOURCES / f'{name}.jpg'
        image = Image.open(source).convert('RGB')
        boxes = skill_regions(image)
        for skill, box in zip(skills, boxes):
            destination = args.output / name / 'icons' / f'level01_skill_{skill}.png'
            crops.append((name, skill, source, destination, box, image.crop(box)))
    assert len(crops) == 6
    sheet = Image.new('RGB', (600, 300), '#fff7e7')
    draw = ImageDraw.Draw(sheet)
    font = ImageFont.truetype('C:/Windows/Fonts/malgun.ttf', 16)
    report = []
    for index, (name, skill, source, destination, box, crop) in enumerate(crops):
        destination.parent.mkdir(parents=True, exist_ok=True)
        crop.save(destination)
        x, y = (index // 2) * 200, (index % 2) * 150
        sheet.paste(crop.resize((100, 100), Image.Resampling.NEAREST), (x + 50, y + 6))
        draw.text((x + 16, y + 113), name.replace('_', ' ') + ' / ' + skill.replace('_', ' '), font=font, fill='black')
        report.append({'soldier': name, 'skill': skill, 'source': str(source),
                       'source_sha256': hashlib.sha256(source.read_bytes()).hexdigest(),
                       'detected_box': box, 'output': str(destination), 'size': crop.size})
    SCRATCH.mkdir(parents=True, exist_ok=True)
    sheet.save(SCRATCH / 'soldier_skills_color_preview.png')
    (SCRATCH / 'soldier_skill_color_regions.json').write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding='utf-8')
    print(json.dumps(report, ensure_ascii=False, indent=2))
    print(SCRATCH / 'soldier_skills_color_preview.png')


if __name__ == '__main__':
    main()
