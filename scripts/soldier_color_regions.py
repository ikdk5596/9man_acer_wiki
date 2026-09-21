"""Locate complete icon regions by color components, never screen offsets.

Pillow + NumPy + SciPy. Bounds are exclusive, matching Pillow crop().
Ordering identifies already-known roster entries; it never defines crop bounds.
"""
import numpy as np
from scipy import ndimage
from PIL import Image

CREAM = (255, 247, 231)


def color_mask(image, color=CREAM, tolerance=10):
    pixels = np.asarray(image.convert('RGB')).astype(int)
    return np.max(np.abs(pixels - color), axis=2) <= tolerance


def components(mask):
    labels, _ = ndimage.label(mask)
    sizes = np.bincount(labels.ravel())
    for label, slices in enumerate(ndimage.find_objects(labels), 1):
        if slices is None:
            continue
        y, x = slices
        yield (x.start, y.start, x.stop, y.stop), int(sizes[label])


def reading_order(boxes):
    rows = []
    for box in sorted(boxes, key=lambda b: (b[1], b[0])):
        if not rows or abs(box[1] - rows[-1][0][1]) > (box[3] - box[1]) * .25:
            rows.append([box])
        else:
            rows[-1].append(box)
    return [box for row in rows for box in sorted(row)]


def roster_regions(image):
    boxes = []
    for box, area in components(color_mask(image)):
        x0, y0, x1, y1 = box
        width, height = x1 - x0, y1 - y0
        # Reject whole panels, labels and partially clipped bottom-row cards.
        if (35 <= width <= 240 and 35 <= height <= 240
                and .94 <= width / height <= 1.06
                and area / (width * height) >= .35):
            boxes.append(box)
    return reading_order(boxes)


def roster_icon(image, box):
    crop = image.crop(box).convert('RGB')
    labels, _ = ndimage.label(color_mask(crop))
    sizes = np.bincount(labels.ravel())
    sizes[0] = 0
    # Fill enclosed artwork, but keep the card-colored outer corners transparent.
    alpha = ndimage.binary_fill_holes(labels == sizes.argmax()).astype('uint8') * 255
    rgba = np.dstack([np.asarray(crop), alpha])
    rgba[alpha == 0, :3] = 0
    return Image.fromarray(rgba)


def skill_regions(image):
    cream = color_mask(image)
    labels, _ = ndimage.label(cream)
    sizes = np.bincount(labels.ravel())
    if len(sizes) < 2:
        raise ValueError('No popup background found')
    sizes[0] = 0
    popup = ndimage.binary_fill_holes(labels == sizes.argmax())
    inside = ndimage.binary_erosion(popup, iterations=3)
    ink = (~color_mask(image, tolerance=30)) & inside
    ink = ndimage.binary_closing(ink, iterations=1)
    squares = []
    for box, area in components(ink):
        x0, y0, x1, y1 = box
        w, h = x1 - x0, y1 - y0
        if 35 <= w <= 180 and 35 <= h <= 180 and .92 <= w / h <= 1.08:
            squares.append(box)
    pairs = []
    for left in squares:
        for right in squares:
            height = left[3] - left[1]
            if (left[2] < right[0]
                    and abs(left[1] - right[1]) <= height * .1
                    and abs(height - (right[3] - right[1])) <= height * .1
                    and right[0] - left[2] < height):
                pairs.append([left, right])
    if len(pairs) != 1:
        raise ValueError(f'Expected one unambiguous skill pair, found {len(pairs)}')
    return pairs[0]
