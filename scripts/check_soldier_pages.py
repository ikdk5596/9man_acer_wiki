"""Check soldier catalog pages, icons, and production subpath links.

Run after `npm run build`: python scripts/check_soldier_pages.py
Only uses the Python standard library.
"""
from html.parser import HTMLParser
from pathlib import Path
from urllib.parse import unquote, urljoin, urlparse
import re
import argparse

ROOT = Path(__file__).resolve().parents[1]
DOCS = ROOT / "docs"
DIST = DOCS / ".vitepress/dist"



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
    parser = argparse.ArgumentParser()
    parser.add_argument("--base", default="/9man_acer_wiki/")
    args = parser.parse_args()
    base_path = args.base
    assert base_path.startswith("/") and base_path.endswith("/"), base_path
    base_url = "https://example.test" + base_path
    source = Elements((DOCS / "soldiers/index.md").read_text(encoding="utf-8"))
    assert len(source.cards) == len(set(source.cards)) == 26, source.cards
    expected = {path.stem for path in (DOCS / "public/images/soldiers/roster_icons").glob("*.png")}
    card_names = {Path(unquote(urlparse(href).path)).name for href in source.cards}
    assert card_names == expected, "Icons and list entries disagree"
    for image in source.images:
        assert (DOCS / "public" / unquote(image).lstrip("/")).is_file(), image
    pages = {path.stem for path in (DOCS / "soldiers").glob("*.md") if path.stem != "index"}
    assert pages == expected, (pages - expected, expected - pages)
    for name in expected:
        page = DOCS / "soldiers" / f"{name}.md"
        text = page.read_text(encoding="utf-8")
        if name in {"투석차", "쇠뇌차"}:
            assert "레벨 1로 취급" in text and "## 기본 능력치" in text, page
        else:
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
        url = urlparse(urljoin(base_url + "soldiers/", href))
        assert url.path.startswith(base_path + "soldiers/"), href
        relative = unquote(url.path.removeprefix(base_path))
        html = DIST / (relative + ".html")
        assert html.is_file(), html
        detail = Elements(html.read_text(encoding="utf-8"))
        assert base_path + "soldiers/" in detail.links, html
        for image in detail.images:
            if image.startswith("http") or image.startswith("data:"):
                continue
            url = urlparse(urljoin(base_url + relative, image))
            assert url.path.startswith(base_path), (html, image)
            asset = DIST / unquote(url.path.removeprefix(base_path))
            assert asset.is_file(), asset
    print("PASS: 26 unique catalog entries, detail pages, icons, return links, and built subpath assets.")


if __name__ == "__main__":
    main()
