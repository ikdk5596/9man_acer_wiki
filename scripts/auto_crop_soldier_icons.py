"""
병사 팝업 스크린샷에서 초상화/스킬 아이콘을 자동 검출해 크롭한다.
크림색 툴팁 배경(bbox)의 좌상단을 기준점으로 삼아 고정 오프셋을 적용한다.
- 기본(레벨) 화면: 초상화는 툴팁 좌상단 + (16,11), 크기 66x63
- 스킬 화면: 스킬 아이콘은 툴팁 좌상단 + (13,19), 크기 60x48
오프셋은 여러 샘플에서 육안 검증을 거쳐 확정한 값이다.
"""
from PIL import Image
import os

BASE = r"C:\Workspace\9man_acers\9man_acer_wiki\docs\public\images\soldiers"

TOOLTIP_BG = (255, 247, 231)
PORTRAIT_OFFSET = (16, 11)
PORTRAIT_SIZE = (66, 63)
SKILL_OFFSET = (13, 19)
SKILL_SIZE = (60, 48)


def close(c1, c2, tol=8):
    return all(abs(a - b) <= tol for a, b in zip(c1, c2))


def tooltip_top_left(im):
    px = im.load()
    minx, miny = None, None
    for y in range(im.height):
        for x in range(im.width):
            if close(px[x, y], TOOLTIP_BG):
                if minx is None or x < minx:
                    minx = x
                if miny is None or y < miny:
                    miny = y
    return minx, miny


def crop(path, dst, offset, size):
    im = Image.open(path).convert("RGB")
    tx, ty = tooltip_top_left(im)
    if tx is None:
        return None
    ox, oy = offset
    w, h = size
    box = (tx + ox, ty + oy, tx + ox + w, ty + oy + h)
    im.crop(box).save(dst)
    return box


if __name__ == "__main__":
    ok, fail = [], []
    for troop in os.listdir(BASE):
        troop_path = os.path.join(BASE, troop)
        if not os.path.isdir(troop_path) or troop == "icons":
            continue
        out_icons = os.path.join(troop_path, "icons")
        os.makedirs(out_icons, exist_ok=True)
        for f in sorted(os.listdir(troop_path)):
            if not f.lower().endswith(".png"):
                continue
            src = os.path.join(troop_path, f)
            name, _ = os.path.splitext(f)
            dst = os.path.join(out_icons, f)
            if "_skill_" in name:
                box = crop(src, dst, SKILL_OFFSET, SKILL_SIZE)
            elif name.startswith("level") and "wrap" not in name:
                box = crop(src, dst, PORTRAIT_OFFSET, PORTRAIT_SIZE)
            else:
                continue
            if box is None:
                fail.append(os.path.join(troop, f))
            else:
                ok.append(os.path.join(troop, f))
    print("OK:", len(ok))
    print("FAIL:", fail)
