import re

path = "docs/policies/index.md"
with open(path, encoding="utf-8") as f:
    content = f.read()

lines = content.split("\n")
out = []
for line in lines:
    if line.startswith("| 번호 | 정책명 | 효과 | 필요 조건 | 증거 |"):
        out.append("| 번호 | 정책명 | 효과 | 필요 조건 |")
    elif line.startswith("|---:|---|---|---|:---:|"):
        out.append("|---:|---|---|---|")
    elif re.match(r'^\| <a id="p\d+"></a>\d+ \|', line):
        new_line = re.sub(r"\s*\|\s*\[보기\]\([^)]+\)\s*\|$", " |", line)
        out.append(new_line)
    else:
        out.append(line)

with open(path, "w", encoding="utf-8") as f:
    f.write("\n".join(out))
print("policies updated")
