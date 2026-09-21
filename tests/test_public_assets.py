"""Keep research captures and obsolete crops out of published assets."""
from pathlib import Path
import html
import unittest
from urllib.parse import unquote

ROOT = Path(__file__).resolve().parents[1]
PUBLIC = ROOT / 'docs/public'


class PublicAssets(unittest.TestCase):
    def test_every_public_image_is_referenced_by_site_source(self):
        sources = []
        for path in (ROOT / 'docs').rglob('*'):
            if not path.is_file() or path.suffix not in {'.md', '.vue', '.css', '.ts', '.mts'}:
                continue
            if {'dist', 'cache', 'talents'}.intersection(path.relative_to(ROOT / 'docs').parts):
                continue
            sources.append(unquote(html.unescape(path.read_text(encoding='utf-8'))))
        source = '\n'.join(sources)
        unused = [path.relative_to(PUBLIC).as_posix()
                  for path in (PUBLIC / 'images').rglob('*') if path.is_file()
                  and '/' + path.relative_to(PUBLIC).as_posix() not in source]
        self.assertEqual(unused, [], f'{len(unused)} unused images would be published')

    def test_research_and_obsolete_crop_folders_are_not_public(self):
        forbidden = [path.relative_to(PUBLIC).as_posix()
                     for path in (PUBLIC / 'images').rglob('*') if path.is_dir()
                     and ('_raw' in path.name or path.name in {'hero_tmp', 'detail_icons', 'roster'})]
        self.assertEqual(forbidden, [])


if __name__ == '__main__':
    unittest.main()
