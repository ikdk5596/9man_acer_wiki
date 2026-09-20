"""Policy numbers remain in stable paths, not in reader-facing labels."""
from pathlib import Path
import re
import unittest

ROOT = Path(__file__).resolve().parents[1]


class PolicyPresentationTests(unittest.TestCase):
    def test_catalog_and_details_hide_numbers_but_keep_routes(self):
        policies = ROOT / 'docs/policies'
        pages = sorted((policies / 'list').glob('*.md'))
        self.assertEqual(len(pages), 51)
        index = (policies / 'index.md').read_text(encoding='utf-8')
        links = re.findall(r'href="list/(\d{3})"', index)
        self.assertEqual(links, [page.stem for page in pages])
        for page in [policies / 'index.md', *pages]:
            with self.subTest(page=page.name):
                text = page.read_text(encoding='utf-8')
                self.assertNotRegex(text, r'No\.\s*\d+|icon-num|\| 번호 \|')
                if page.name != 'index.md':
                    self.assertIn('| 효과 |', text)
                    self.assertIn('| 필요 조건 |', text)
                    self.assertIn('/images/policies/icons/' + page.stem + '_', text)


if __name__ == '__main__':
    unittest.main()
