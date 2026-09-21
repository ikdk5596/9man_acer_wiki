"""Check all four built catalogs, their index coverage, links and images."""
from __future__ import annotations

import argparse
from html.parser import HTMLParser
from pathlib import Path
from urllib.parse import unquote, urljoin, urlparse

ROOT = Path(__file__).resolve().parents[1]
DOCS = ROOT / "docs"
DIST = DOCS / ".vitepress" / "dist"
EXPECTED = {"policies": 51, "soldiers": 26, "equipment": 66, "hero": 59}


class References(HTMLParser):
    def __init__(self, text: str):
        super().__init__()
        self.links: list[str] = []
        self.images: list[str] = []
        self.feed(text)

    def handle_starttag(self, tag: str, attrs):
        attrs = dict(attrs)
        if tag == "a" and attrs.get("href"):
            self.links.append(attrs["href"])
        if tag == "img" and attrs.get("src"):
            self.images.append(attrs["src"])


def local_target(reference: str, page_url: str, base: str) -> Path | None:
    parsed = urlparse(urljoin(page_url, reference))
    if parsed.scheme not in {"http", "https"} or parsed.netloc != "wiki.invalid":
        return None
    path = unquote(parsed.path)
    assert path.startswith(base), f"Link escapes deployment base: {reference} on {page_url}"
    relative = path[len(base):]
    target = DIST / relative
    if path.endswith("/"):
        target /= "index.html"
    elif not target.is_file():
        target = target.with_name(target.name + ".html")
    assert target.is_file(), f"Missing target: {reference} on {page_url} -> {target}"
    return target


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--base", default="/9man_acer_wiki/")
    args = parser.parse_args()
    base = "/" + args.base.strip("/") + "/" if args.base.strip("/") else "/"
    home_url = "https://wiki.invalid" + base
    home = References((DIST / "index.html").read_text(encoding="utf-8"))
    home_targets = {local_target(ref, home_url, base) for ref in home.links}
    for catalog, count in EXPECTED.items():
        sources = sorted(path for path in (DOCS / catalog).rglob("*.md") if path.name != "index.md")
        assert len(sources) == count, (catalog, len(sources), count)
        index = DIST / catalog / "index.html"
        assert index in home_targets, f"Catalog not linked from home: {catalog}"
        index_url = home_url + catalog + "/"
        index_refs = References(index.read_text(encoding="utf-8"))
        linked = {local_target(ref, index_url, base) for ref in index_refs.links}
        for source in [(DOCS / catalog / "index.md"), *sources]:
            relative = source.relative_to(DOCS).with_suffix(".html")
            built = DIST / relative
            assert built.is_file(), f"Missing built page: {source}"
            if source.name != "index.md":
                assert built in linked, f"Detail missing from catalog index: {source}"
            page_url = home_url + relative.as_posix()
            refs = References(built.read_text(encoding="utf-8"))
            for ref in [*refs.links, *refs.images]:
                local_target(ref, page_url, base)
        print(f"PASS: {catalog}: {count} detail pages, index coverage, links and images ({base}).")


if __name__ == "__main__":
    main()
