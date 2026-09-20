"""Check soldier catalog pages, icons, and production subpath links.

Run after `npm run build`: python scripts/check_soldier_pages.py
Only uses the Python standard library.
"""
from html.parser import HTMLParser
from pathlib import Path
from urllib.parse import unquote, urljoin, urlparse
import re

ROOT = Path(__file__).resolve().parents[1]
DOCS = ROOT / "docs"
DIST = DOCS / ".vitepress/dist"
BASE = "https://example.test/9man_acer_wiki/"


class Elements(HTMLParser):
    def __init__(self, text):
        super().__init__()
        self.cards = []
        self.images = []
        self.links = []
        self.feed(text)

    def handle_starttag(self, tag, attrs):
        attrs = dict(attrs)
        if tag == "a" and "href" in attrs:
            self.links.append(attrs["href"])
            if "icon-card" in attrs.get("class", "").split():
                self.cards.append(attrs["href"])
        if tag == "img" and "src" in attrs:
            self.images.append(attrs["src"])


def main():
    source = Elements((DOCS / "soldiers/index.md").read_text(encoding="utf-8"))
    assert len(source.cards) == len(set(source.cards)) == 26, source.cards
    expected = {path.stem for path in (DOCS / "public/images/soldiers/detail_icons").glob("*.png")}
    assert set(source.cards) == expected, "Icons and list entries disagree"
    pages = {path.stem for path in (DOCS / "soldiers").glob("*.md") if path.stem != "index"}
    assert pages == expected, (pages - expected, expected - pages)
    for name in expected:
        page = DOCS / "soldiers" / f"{name}.md"
        text = page.read_text(encoding="utf-8")
        assert "## 레벨별 기본 능력치" in text, page
        assert "## 스킬" in text, page
        assert re.search(r"\]\(/soldiers/\)", text), f"Missing return link: {page}"
        assert "비용 계수" not in text, page
        assert "_raw/" not in text, f"Raw evidence leaked: {page}"
        for image in Elements(text).images:
            assert (DOCS / "public" / image.lstrip("/")).is_file(), (page, image)
    built = Elements((DIST / "soldiers/index.html").read_text(encoding="utf-8"))
    assert len(built.cards) == 26, len(built.cards)
    for href in built.cards:
        url = urlparse(urljoin(BASE + "soldiers/", href))
        assert url.path.startswith("/9man_acer_wiki/soldiers/"), href
        relative = unquote(url.path.removeprefix("/9man_acer_wiki/"))
        html = DIST / (relative + ".html")
        assert html.is_file(), html
        detail = Elements(html.read_text(encoding="utf-8"))
        assert "/9man_acer_wiki/soldiers/" in detail.links, html
        for image in detail.images:
            if image.startswith("http") or image.startswith("data:"):
                continue
            url = urlparse(urljoin(BASE + relative, image))
            assert url.path.startswith("/9man_acer_wiki/"), (html, image)
            asset = DIST / unquote(url.path.removeprefix("/9man_acer_wiki/"))
            assert asset.is_file(), asset
    print("PASS: 26 unique catalog entries, detail pages, icons, return links, and built subpath assets.")


if __name__ == "__main__":
    main()
