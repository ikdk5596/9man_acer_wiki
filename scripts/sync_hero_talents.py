"""Sync supplied talent tables without replacing hero stats, skills or artwork."""
from pathlib import Path
import argparse
import json
import re

ROOT = Path(__file__).resolve().parents[1]
SOURCES = ROOT / 'docs/talents'
RETURN_LINK = '[영웅 도감으로 돌아가기](/hero/)'
START = '<!-- hero-talents:start -->'
END = '<!-- hero-talents:end -->'


def talent_markdown(name):
    short_name = name.split(' (')[0]
    source = (SOURCES / f'{short_name}.md').read_text(encoding='utf-8-sig')
    if source.splitlines()[0] != f'# {short_name}':
        raise ValueError(f'Talent source name mismatch: {name}')
    body = source[source.index('## 초급재능'):].strip()
    if re.findall(r'^## (.+)$', body, re.M) != ['초급재능', '중급재능', '고급재능']:
        raise ValueError(f'Talent headings mismatch: {name}')
    body = re.sub(r'^## ', '### ', body, flags=re.M).replace('*', r'\*')
    return f'{START}\n\n## 재능\n\n{body}\n\n{END}'


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--check', action='store_true')
    args = parser.parse_args()
    records = json.loads((ROOT / 'scripts/data/heroes.json').read_text(encoding='utf-8'))
    names = {r['name'].split(' (')[0] for r in records}
    assert len(names) == len(records) == 59
    assert names == {p.stem for p in SOURCES.glob('*.md')}
    updates = []
    for record in records:
        path = ROOT / 'docs/hero' / ('_'.join(record['name'].split()) + '.md')
        old = path.read_text(encoding='utf-8')
        block = talent_markdown(record['name'])
        if START in old:
            assert old.count(START) == old.count(END) == 1, path
            start, rest = old.split(START)
            _, end = rest.split(END)
            new = start + block + end
        else:
            assert old.count(RETURN_LINK) == 1, path
            new = old.replace(RETURN_LINK, block + '\n\n' + RETURN_LINK)
        if new != old:
            updates.append((path, new))
    if args.check:
        assert not updates, f'{len(updates)} hero talent pages need syncing'
    else:
        for path, text in updates:
            path.write_text(text, encoding='utf-8')
    print(f'PASS: {len(records)} hero talent sources; {len(updates)} pages updated' if not args.check
          else f'PASS: all {len(records)} hero talent pages match the sources')


if __name__ == '__main__':
    main()
