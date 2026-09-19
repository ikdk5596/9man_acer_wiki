"""
병사 도감 목록 화면(4열 그리드) 스크린샷에서 각 카드의 아이콘만 자동으로
잘라낸다. 카드 배경색(239,227,206)의 연결된 사각 블록을 열/행으로 찾고,
카드 내부에서 아이콘 위치(오프셋 16,44 / 크기 80x80)로 크롭한다.
"""
from PIL import Image
import numpy as np
import os

RAW = r"C:\Workspace\9man_acers\9man_acer_wiki\docs\public\images\soldiers\_roster_raw\roster01.png"
OUT_DIR = r"C:\Workspace\9man_acers\9man_acer_wiki\docs\public\images\soldiers\_roster_icons"

CARD_BG = (239, 227, 206)
ICON_OFFSET = (16, 44)
ICON_SIZE = (80, 80)

# names in reading order (left-to-right, top-to-bottom) as seen on screen
NAMES_ROW1 = ["장창", "긴_창", "장과", "맥도"]
NAMES_ROW2 = ["장검", "쌍창", "칼과_방패", "무거운_방패"]


def close_arr(a, c, tol=6):
    return np.all(np.abs(a.astype(int) - np.array(c)) <= tol, axis=-1)


def find_segments(mask_1d, min_run=5):
    prev = False
    segs = []
    start = None
    for i in range(len(mask_1d)):
        v = mask_1d[i] > min_run
        if v and not prev:
            start = i
        if not v and prev:
            segs.append((start, i - 1))
        prev = v
    if prev:
        segs.append((start, len(mask_1d) - 1))
    return segs


def extract(names, row_range):
    im = Image.open(RAW).convert("RGB")
    arr = np.array(im)
    mask = close_arr(arr, CARD_BG)
    y0, y1 = row_range
    colsum = mask[y0:y1, :].sum(axis=0)
    col_segs = find_segments(colsum)
    # merge adjacent tiny segments (gaps from anti-aliasing)
    merged = []
    for s in col_segs:
        if merged and s[0] - merged[-1][1] < 15:
            merged[-1] = (merged[-1][0], s[1])
        else:
            merged.append(list(s))
    print("col segs:", merged)
    assert len(merged) == len(names), (len(merged), len(names))

    os.makedirs(OUT_DIR, exist_ok=True)
    for (cx0, cx1), name in zip(merged, names):
        ox, oy = ICON_OFFSET
        w, h = ICON_SIZE
        box = (cx0 + ox, y0 + oy, cx0 + ox + w, y0 + oy + h)
        crop = im.crop(box)
        dst = os.path.join(OUT_DIR, f"{name}.png")
        crop.save(dst)
        print(name, box, "->", dst)


if __name__ == "__main__":
    extract(NAMES_ROW1, (244, 398))
    extract(NAMES_ROW2, (408, 564))
