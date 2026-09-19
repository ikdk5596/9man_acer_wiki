from PIL import Image
import os

BASE = r"C:\Workspace\9man_acers\9man_acer_wiki\docs\public\images\soldiers"

TOOLTIP_BG = (255, 247, 231)
PORTRAIT_OFFSET = (16, 11)
PORTRAIT_SIZE = (66, 63)
SKILL_OFFSET = (13, 23)
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
    raw_dir = os.path.join(BASE, "장창_raw")
    out_dir = os.path.join(BASE, "장창", "icons")
    os.makedirs(out_dir, exist_ok=True)

    for lvl in range(1, 7):
        src = os.path.join(raw_dir, f"level{lvl:02d}.png")
        dst = os.path.join(out_dir, f"level{lvl:02d}.png")
        box = crop(src, dst, PORTRAIT_OFFSET, PORTRAIT_SIZE)
        print(src, "->", box)

    skill_map = {
        "skill_기병_압도.png": "level01_skill_기병_압도.png",
        "skill_찌르기.png": "level01_skill_찌르기.png",
    }
    for src_name, dst_name in skill_map.items():
        src = os.path.join(raw_dir, src_name)
        dst = os.path.join(out_dir, dst_name)
        box = crop(src, dst, SKILL_OFFSET, SKILL_SIZE)
        print(src, "->", box)

    print("done")
