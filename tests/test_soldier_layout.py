"""Presentation and value-preservation checks for all soldier detail pages."""
import hashlib
from html.parser import HTMLParser
import json
from pathlib import Path
import re
import unittest

ROOT = Path(__file__).resolve().parents[1]
COLUMNS = ['레벨', 'HP', '공격력']


class Catalog(HTMLParser):
    def __init__(self, text):
        super().__init__()
        self.portraits = {}
        self.current = None
        self.feed(text)

    def handle_starttag(self, tag, attrs):
        attrs = dict(attrs)
        if tag == 'a' and 'icon-card' in attrs.get('class', '').split():
            self.current = attrs['href']
        if tag == 'img' and self.current:
            self.portraits[self.current] = attrs['src']

    def handle_endtag(self, tag):
        if tag == 'a':
            self.current = None


def stat_rows(text):
    prefix = text.split('## 스킬\n', 1)[0]
    tables = []
    for match in re.finditer(r'(?m)^\|[^\n]+\n\|[-:| ]+\n(?:\|[^\n]+\n?)+', prefix):
        lines = match.group().strip().splitlines()
        header = [cell.strip() for cell in lines[0].strip('|').split('|')]
        rows = [[cell.strip() for cell in line.strip('|').split('|')] for line in lines[2:]]
        assert all(len(row) == len(header) for row in rows)
        tables.append((header, rows))
    fixed = {}
    levels = []
    for header, rows in tables:
        if header == ['항목', '수치']:
            fixed.update(dict(rows))
        elif header[0] == '레벨':
            levels.extend(dict(zip(header, row)) for row in rows)
        else:
            raise AssertionError(header)
    if levels:
        return [{**fixed, **row} for row in levels]
    assert fixed
    return [fixed]


def skills_hash(text):
    return hashlib.sha256(text.split('## 스킬\n', 1)[1].encode('utf-8')).hexdigest()


class SoldierLayoutTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.baseline = json.loads((ROOT / 'tests/fixtures/soldier-content.json').read_text(encoding='utf-8'))
        cls.catalog = Catalog((ROOT / 'docs/soldiers/index.md').read_text(encoding='utf-8'))

    def test_every_detail_uses_exactly_one_overview_portrait(self):
        self.assertEqual(len(self.catalog.portraits), 26)
        self.assertEqual(set(self.catalog.portraits), set(self.baseline))
        for name, portrait in self.catalog.portraits.items():
            with self.subTest(soldier=name):
                text = (ROOT / f'docs/soldiers/{name}.md').read_text(encoding='utf-8')
                prefix = text.split('## 스킬\n', 1)[0]
                self.assertEqual(re.findall(r'<img\b[^>]*\bsrc="([^"]+)"', prefix), [portrait])
                self.assertNotRegex(prefix, r'level-strip|level-card|level-badge|레벨별 아이콘')

    def test_all_pages_follow_ssangchang_section_and_table_format(self):
        for name in self.baseline:
            with self.subTest(soldier=name):
                text = (ROOT / f'docs/soldiers/{name}.md').read_text(encoding='utf-8')
                prefix = text.split('## 스킬\n', 1)[0]
                self.assertRegex(text, r'^# (?!병사\().+\n')
                siege = name in {'투석차', '쇠뇌차'}
                headings = ['기본 능력치', '스킬'] if siege else ['기본 능력치', '레벨별 기본 능력치', '스킬']
                self.assertEqual(re.findall(r'^## (.+)$', text, re.M), headings)
                self.assertRegex(prefix, r'(?m)^병과: .+')
                self.assertIn('| 항목 | 수치 |', prefix)
                if not siege:
                    self.assertIn('| ' + ' | '.join(COLUMNS) + ' |', prefix)
                else:
                    self.assertIn('레벨 1로 취급', prefix)

    def test_every_stat_cell_and_entire_skill_section_is_preserved(self):
        for name, original in self.baseline.items():
            with self.subTest(soldier=name):
                text = (ROOT / f'docs/soldiers/{name}.md').read_text(encoding='utf-8')
                self.assertEqual(stat_rows(text), original['stats'])
                self.assertEqual(skills_hash(text), original['skills_sha256'])
                self.assertIn('병과: ' + original['troop'], text)


if __name__ == '__main__':
    unittest.main()
