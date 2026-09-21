"""Color-boundary crops must follow the image, not fixed coordinates."""
from pathlib import Path
import sys
import unittest
from PIL import Image, ImageOps

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / 'scripts'))
from soldier_color_regions import roster_regions, skill_regions

ASSETS = ROOT.parent / '9man_wiki/wiki_assets/9man_acer_wiki_archive/docs/public/images/soldiers'
SOURCE = ROOT.parent / '9man_wiki/wiki_assets/soldier_skill_retakes'


class ColorCrops(unittest.TestCase):
    def test_roster_detects_only_complete_cards_and_follows_translation(self):
        for path, count in [(ASSETS / '_roster_raw2/roster_full.png', 12),
                            (ASSETS / '_roster_raw2/archers_cavalry.png', 12),
                            (ASSETS / '_roster_raw2/siege.png', 10)]:
            with self.subTest(source=path.name):
                image = Image.open(path).convert('RGB')
                boxes = roster_regions(image)
                self.assertEqual(len(boxes), count)
                shifted = ImageOps.expand(image, border=(37, 23, 9, 11), fill='black')
                self.assertEqual(roster_regions(shifted),
                                 [(x0 + 37, y0 + 23, x1 + 37, y1 + 23) for x0, y0, x1, y1 in boxes])

    def test_skill_pair_follows_color_boundaries_after_translation(self):
        for name in ('장창', '긴_창', '장검'):
            image = Image.open(SOURCE / f'{name}.jpg').convert('RGB')
            boxes = skill_regions(image)
            self.assertEqual(len(boxes), 2)
            shifted = ImageOps.expand(image, border=(41, 19, 3, 7), fill='black')
            self.assertEqual(skill_regions(shifted),
                             [(x0 + 41, y0 + 19, x1 + 41, y1 + 19) for x0, y0, x1, y1 in boxes])
            for x0, y0, x1, y1 in boxes:
                self.assertLessEqual(abs((x1 - x0) - (y1 - y0)), 2)

    def test_missing_regions_fail_closed(self):
        blank = Image.new('RGB', (800, 800), '#fff7e7')
        self.assertEqual(roster_regions(blank), [])
        with self.assertRaises(ValueError):
            skill_regions(blank)


if __name__ == '__main__':
    unittest.main()
