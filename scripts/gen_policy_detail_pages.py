import re
import os

SRC = r"C:\Workspace\9man_acers\9man_acer_wiki\docs\policies\index.md"
OUT_DIR = r"C:\Workspace\9man_acers\9man_acer_wiki\docs\policies"

with open(SRC, encoding="utf-8") as f:
    content = f.read()

# parse rows like: | <a id="p1"></a>1 | 풍성한 수확 | 효과... | 조건... |
row_re = re.compile(
    r'^\| <a id="p(\d+)"></a>\d+ \| (.+?) \| (.+?) \| (.+?) \|$', re.MULTILINE
)
rows = row_re.findall(content)
print("parsed rows:", len(rows))

policies = []
for num, name, effect, condition in rows:
    n = int(num)
    icon_file = f"{n:03d}_{name.replace(' ', '_')}.png"
    policies.append({
        "num": n,
        "name": name,
        "effect": effect,
        "condition": condition,
        "icon": icon_file,
    })

policies.sort(key=lambda p: p["num"])
assert len(policies) == 51, len(policies)

# verify icon files exist
icons_dir = os.path.join(OUT_DIR, "..", "public", "images", "policies", "icons")
missing = [p["icon"] for p in policies if not os.path.exists(os.path.join(icons_dir, p["icon"]))]
print("missing icons:", missing)

# --- generate individual pages ---
detail_dir = os.path.join(OUT_DIR, "list")
os.makedirs(detail_dir, exist_ok=True)

for p in policies:
    page = f"""# {p['name']}

<div class="policy-detail">
<img src="/images/policies/icons/{p['icon']}" alt="{p['name']}" class="policy-detail-icon">

| 항목 | 내용 |
|---|---|
| 번호 | No.{p['num']} |
| 효과 | {p['effect']} |
| 필요 조건 | {p['condition']} |

</div>

[← 정책 도감으로 돌아가기](/policies/)
"""
    with open(os.path.join(detail_dir, f"{p['num']:03d}.md"), "w", encoding="utf-8") as f:
        f.write(page)

print("detail pages written:", len(policies))

# --- generate new index.md (icon grid only, links to detail pages) ---
cards = []
for p in policies:
    cards.append(
        f'<a class="icon-card" href="/policies/list/{p["num"]:03d}">'
        f'<img src="/images/policies/icons/{p["icon"]}" alt="{p["name"]}">'
        f'<span class="icon-name">{p["name"]}</span>'
        f'<span class="icon-num">No.{p["num"]}</span></a>'
    )

index = "# 정책 도감\n\n<div class=\"icon-grid\">\n" + "\n".join(cards) + "\n</div>\n"
with open(SRC, "w", encoding="utf-8") as f:
    f.write(index)

print("index.md rewritten")
