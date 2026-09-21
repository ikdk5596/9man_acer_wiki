"""Requested display names change without breaking existing soldier URLs."""
from pathlib import Path
import json
import re
import unittest

ROOT = Path(__file__).resolve().parents[1]
NAMES = {
    '기병_검': ('검기병', '기병(검)'),
    '기병_대도': ('대도기병', '기병(대도)'),
    '기병_창': ('창기병', '기병(창)'),
    '기병_활': ('궁기병', '기병(활)'),
    '도끼와_방패': ('도끼방패', '도끼&방패'),
    '망치와_방패': ('망치방패', '망치&방패'),
    '창과_방패': ('창방', '창&방패'),
    '칼과_방패': ('칼방', '칼&방패'),
}


class SoldierNames(unittest.TestCase):
    def test_eight_soldier_titles_cards_and_sidebar_keep_original_routes(self):
        catalog = (ROOT / 'docs/soldiers/index.md').read_text(encoding='utf-8')
        config = (ROOT / 'docs/.vitepress/config.mts').read_text(encoding='utf-8')
        for slug, (name, _) in NAMES.items():
            with self.subTest(soldier=slug):
                page = (ROOT / 'docs/soldiers' / f'{slug}.md').read_text(encoding='utf-8')
                self.assertTrue(page.startswith(f'# {name}\n'))
                self.assertIn(f'alt="{name}"', page.split('## 기본 능력치')[0])
                card = re.search(rf'<a class="icon-card" href="{slug}">.*?</a>', catalog).group()
                self.assertIn(f'<span class="icon-name">{name}</span>', card)
                self.assertIn(f'alt="{name}"', card)
                self.assertIn(f"{{ text: '{name}', link: '/soldiers/{slug}' }}", config)
                self.assertTrue((ROOT / 'docs/public/images/soldiers/roster_icons' / f'{slug}.png').is_file())

    def test_hero_labels_follow_names_without_changing_source_troops(self):
        records = json.loads((ROOT / 'scripts/data/heroes.json').read_text(encoding='utf-8'))
        index = (ROOT / 'docs/hero/index.md').read_text(encoding='utf-8')
        for slug, (name, source) in NAMES.items():
            with self.subTest(soldier=slug):
                self.assertIn(f'## {name}\n', index)
                matching = [record for record in records if record['troop'] == source]
                self.assertTrue(matching)
                for record in matching:
                    hero_slug = re.sub(r'\s+', '_', record['name'].strip())
                    page = (ROOT / 'docs/hero' / f'{hero_slug}.md').read_text(encoding='utf-8')
                    self.assertIn(f'| 빙의 병종 | [{name}](/soldiers/{slug}) |', page)


if __name__ == '__main__':
    unittest.main()
