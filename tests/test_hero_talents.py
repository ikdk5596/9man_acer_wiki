"""Check the supplied talent tables against every published hero page."""
from pathlib import Path
import json
import re
import unittest

ROOT = Path(__file__).resolve().parents[1]
SOURCES = ROOT / 'docs/talents'
RECORDS = json.loads((ROOT / 'scripts/data/heroes.json').read_text(encoding='utf-8'))


def tables(text):
    sections = {}
    level = None
    for line in text.splitlines():
        heading = re.fullmatch(r'#{2,3} (초급재능|중급재능|고급재능)', line)
        if heading:
            level = heading[1]
            sections[level] = []
        elif line.startswith('#'):
            level = None
        elif level and line.startswith('|'):
            sections[level].append(line.replace(r'\*', '*'))
    return sections


class HeroTalents(unittest.TestCase):
    def test_all_source_tables_are_preserved_in_the_matching_hero(self):
        self.assertEqual(len(RECORDS), 59)
        self.assertEqual({p.stem for p in SOURCES.glob('*.md')},
                         {r['name'].split(' (')[0] for r in RECORDS})
        missing = []
        for record in RECORDS:
            source = (SOURCES / (record['name'].split(' (')[0] + '.md')).read_text(encoding='utf-8-sig')
            page = (ROOT / 'docs/hero' / ('_'.join(record['name'].split()) + '.md')).read_text(encoding='utf-8')
            expected = tables(source)
            self.assertEqual(list(expected), ['초급재능', '중급재능', '고급재능'])
            if tables(page) != expected:
                missing.append(record['name'])
            for rows in expected.values():
                self.assertGreater(len(rows), 2)
                for row in rows[2:]:
                    cells = row.strip('|').split('|')
                    self.assertEqual(len(cells), 2)
                    self.assertRegex(cells[1].strip(), r'^\d+$')
        self.assertEqual(missing, [], 'Missing or altered talent tables')


if __name__ == '__main__':
    unittest.main()
