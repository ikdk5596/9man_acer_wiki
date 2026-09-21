"""Build the screenshot-derived hero catalog (Pillow, NumPy, SciPy).

Run from any directory: python scripts/build_hero_catalog.py
Canonical transcription: scripts/data/heroes.json. Originals live in the research archive.
Only values visible in the source screenshots belong in the transcription.
"""
from collections import defaultdict
from pathlib import Path
import html
import json
import re
from sync_hero_talents import talent_markdown

import numpy as np
from PIL import Image
from scipy import ndimage

ROOT = Path(__file__).resolve().parents[1]
SOURCES = ROOT.parent / '9man_wiki/wiki_assets/9man_acer_wiki_archive/docs/public/images/hero_tmp'
IMAGES = ROOT / 'docs/public/images/hero'
PAGES = ROOT / 'docs/hero'
DATA = ROOT / 'scripts/data/heroes.json'
SOLDIER_NAMES = json.loads((ROOT / 'scripts/data/soldier_names.json').read_text(encoding='utf-8'))


def slug(name):
    return re.sub(r'\s+', '_', name.strip())


def extract(source):
    full = np.array(Image.open(source).convert('RGB'))
    assert full.shape == (931, 506, 3), source
    cream = ((full[:, :, 0] > 220) & (full[:, :, 1] > 210)
             & (full[:, :, 2] > 170) & (full[:, :, 2] < 240))
    rows = np.where(cream[540:610, 80:425].sum(axis=1) > 280)[0]
    bottom = min(577, int(rows[0] + 540 - 5)) if len(rows) else 577
    image = Image.fromarray(full[130:bottom, 2:504])
    rgb = np.array(image).astype(float)
    hsv = np.array(image.convert('HSV'))
    background = ((hsv[:, :, 0] >= 103) & (hsv[:, :, 0] <= 122)
                  & (rgb[:, :, 1] > 125) & (rgb[:, :, 0] < 120)
                  & ((rgb[:, :, 1] - rgb[:, :, 0]) > 42)
                  & ((rgb[:, :, 2] - rgb[:, :, 0]) > 30))
    keep = ~background
    labels, count = ndimage.label(keep)
    for label in range(1, count + 1):
        _, x = np.where(labels == label)
        if len(x) < 12 or x.max() < 36 or x.min() > 465:
            keep[labels == label] = False
    rgba = np.dstack([np.array(image), keep.astype('uint8') * 255])
    rgba[~keep, :3] = 0
    result = Image.fromarray(rgba, 'RGBA')
    box = result.getbbox()
    assert box is not None, source
    return result.crop(box)


def main():
    records = json.loads(DATA.read_text(encoding='utf-8'))
    sources = {p.name for p in SOURCES.glob('*.jpg')}
    assert len(records) == len(sources)
    assert {r['source'] for r in records} == sources
    assert len({slug(r['name']) for r in records}) == len(records)
    IMAGES.mkdir(parents=True, exist_ok=True)
    PAGES.mkdir(parents=True, exist_ok=True)
    groups = defaultdict(list)
    for record in records:
        for key in ('source', 'name', 'troop', 'skill', 'hp', 'attack', 'description'):
            assert isinstance(record[key], str) and record[key].strip(), (key, record)
        name = record['name']
        stem = slug(name)
        image_path = IMAGES / f'{stem}.png'
        extract(SOURCES / record['source']).save(image_path)
        with Image.open(image_path) as image:
            assert image.mode == 'RGBA'
            assert image.getextrema()[3] == (0, 255)
        with Image.open(image_path) as image:
            image.verify()
        troop = record['troop']
        renamed = next(((key, value) for key, value in SOLDIER_NAMES.items()
                        if value['heroTroop'] == troop), None)
        soldier_stem = slug(troop).replace('(', '_').replace(')', '')
        if renamed:
            soldier_stem, naming = renamed
            troop = naming['name']
        soldier = ROOT / 'docs/soldiers' / f'{soldier_stem}.md'
        troop_text = f'[{troop}](/soldiers/{soldier_stem})' if soldier.exists() else troop
        description = record['description'].replace('*', r'\*')
        text = (f'# {name}\n\n'
                f'<img src="/images/hero/{html.escape(stem)}.png" alt="{html.escape(name)}" '
                'style="width: 280px; max-width: 100%; height: 340px; object-fit: contain; object-position: left center; image-rendering: pixelated;">\n\n'
                f'| 항목 | 내용 |\n| --- | --- |\n| 빙의 병종 | {troop_text} |\n'
                f'| HP | {record["hp"]} |\n| 공격력 | {record["attack"]} |\n\n'
                f'## {record["skill"]}\n\n{description}\n\n')

        text += talent_markdown(name) + '\n\n'
        text += '[영웅 도감으로 돌아가기](/hero/)\n'
        (PAGES / f'{stem}.md').write_text(text, encoding='utf-8')
        groups[troop].append(record)
    index = ['# 영웅 도감', '',
             f'총 {len(records)}명의 영웅을 빙의 병종별로 정리했습니다.', '',
             'HP·공격력과 효과의 수치 범위는 게임 화면 표기를 기준으로 합니다.', '']
    for troop, heroes in groups.items():
        index.extend([f'## {troop}', '', '<div class="icon-grid hero-grid">'])
        for record in heroes:
            name = html.escape(record['name'])
            stem = html.escape(slug(record['name']))
            index.append(f'<a class="icon-card" href="./{stem}"><img src="/images/hero/{stem}.png" alt="{name}" loading="lazy"><span class="icon-name">{name}</span></a>')
        index.extend(['</div>', ''])
    index.extend(['<style>', '.hero-grid .icon-card img {',
                  '  width: 100%; height: 160px; object-fit: contain;',
                  '  border-radius: 0; box-shadow: none; image-rendering: pixelated;',
                  '}', '</style>', ''])
    (PAGES / 'index.md').write_text('\n'.join(index), encoding='utf-8')
    print(json.dumps({'heroes': len(records), 'troop_groups': len(groups),
                      'transparent_pngs': len(records), 'detail_pages': len(records)}, ensure_ascii=False))


if __name__ == '__main__':
    main()
