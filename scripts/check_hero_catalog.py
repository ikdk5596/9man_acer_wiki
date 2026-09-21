"""Validate generated hero records, PNGs, page contents and built card links."""
from pathlib import Path
from html.parser import HTMLParser
from urllib.parse import unquote, urljoin
import hashlib
import json
import argparse
from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
records = json.loads((ROOT / 'scripts/data/heroes.json').read_text(encoding='utf-8'))
dist = ROOT / 'docs/.vitepress/dist'
parser = argparse.ArgumentParser()
parser.add_argument('--base', default='/9man_acer_wiki/')
args = parser.parse_args()
base = '/' + args.base.strip('/') + '/' if args.base.strip('/') else '/'

class Cards(HTMLParser):
    def __init__(self):
        super().__init__()
        self.links = []
        self.images = []
    def handle_starttag(self, tag, attrs):
        attrs = dict(attrs)
        if tag == 'a' and 'icon-card' in attrs.get('class', '').split():
            self.links.append(attrs['href'])
        if tag == 'img' and '/images/hero/' in attrs.get('src', ''):
            self.images.append(attrs['src'])

index = Cards()
index.feed((dist / 'hero/index.html').read_text(encoding='utf-8'))
assert len(index.links) == len(index.images) == len(records) == 59
assert len(set(index.links)) == len(records)
for record in records:
    stem = '_'.join(record['name'].split())
    page = ROOT / 'docs/hero' / f'{stem}.md'
    text = page.read_text(encoding='utf-8')
    assert f'# {record["name"]}' in text
    assert f'## {record["skill"]}' in text
    assert record['description'].replace('*', r'\*') in text
    for key in ('hp', 'attack'):
        assert record[key] in text
    assert (dist / 'hero' / f'{stem}.html').is_file()
    original = ROOT / 'docs/public/images/hero' / f'{stem}.png'
    deployed = dist / 'images/hero' / f'{stem}.png'
    assert hashlib.sha256(original.read_bytes()).digest() == hashlib.sha256(deployed.read_bytes()).digest()
    with Image.open(original) as image:
        assert image.mode == 'RGBA' and image.getextrema()[3] == (0, 255)
for href in index.links:
    route = unquote(urljoin(f'{base}hero/', href))
    assert route.startswith(base), href
    assert (dist / (route.removeprefix(base) + '.html')).exists(), href
for src in index.images:
    path = unquote(src)
    assert path.startswith(f'{base}images/hero/'), src
    assert (dist / path.removeprefix(base)).exists(), src
print(f'PASS: {len(records)} records, RGBA PNGs, detail pages, card links and built assets; {len(set(r["troop"] for r in records))} troop groups.')
