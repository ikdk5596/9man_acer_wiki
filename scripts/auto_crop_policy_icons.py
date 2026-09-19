"""
정책 팝업 스크린샷에서 아이콘 영역을 자동 검출해 크롭한다.
팝업 위치가 스크린샷마다 다르므로, 크림색 툴팁 배경(bbox)의 좌상단을 찾고
거기서 고정 오프셋(14,13)만큼 이동한 65x65 영역을 아이콘으로 crop한다.
(오프셋은 여러 샘플에서 아이콘 테두리 위치를 직접 검증해 확정한 값이다.)
"""
from PIL import Image
import os

BASE = r"C:\Workspace\9man_acers\9man_acer_wiki\docs\public\images"

TOOLTIP_BG = (255, 247, 231)  # fff7e7
ICON_OFFSET = (14, 13)
ICON_SIZE = 65


def close(c1, c2, tol=8):
    return all(abs(a - b) <= tol for a, b in zip(c1, c2))


def tooltip_top_left(im):
    px = im.load()
    minx, miny, maxx = None, None, None
    for y in range(im.height):
        for x in range(im.width):
            if close(px[x, y], TOOLTIP_BG):
                if minx is None or x < minx:
                    minx = x
                if maxx is None or x > maxx:
                    maxx = x
                if miny is None or y < miny:
                    miny = y
        if minx is not None and y > (miny or 0) + 5 and maxx is not None and (maxx - minx) > 200:
            # once we've located a wide tooltip band, stop early is unsafe (bbox may extend);
            # keep scanning to get full bbox instead
            pass
    return minx, miny


def crop_icon(src, dst):
    im = Image.open(src).convert("RGB")
    tx, ty = tooltip_top_left(im)
    if tx is None:
        return None
    ox, oy = ICON_OFFSET
    box = (tx + ox, ty + oy, tx + ox + ICON_SIZE, ty + oy + ICON_SIZE)
    im.crop(box).save(dst)
    return box


if __name__ == "__main__":
    pol_dir = os.path.join(BASE, "policies")
    out_dir = os.path.join(pol_dir, "icons")
    os.makedirs(out_dir, exist_ok=True)
    ok, fail = [], []
    for f in sorted(os.listdir(pol_dir)):
        if not f.lower().endswith(".png"):
            continue
        if f == "endpoint_51.png":
            continue
        src = os.path.join(pol_dir, f)
        dst = os.path.join(out_dir, f)
        box = crop_icon(src, dst)
        if box is None:
            fail.append(f)
        else:
            ok.append((f, box))
    print("OK:", len(ok))
    print("FAIL:", fail)
