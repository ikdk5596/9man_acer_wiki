from PIL import Image
import numpy as np
import cv2
import os

SRC = r"C:\Users\ikdk5\AppData\Local\Temp\panda_frame_0.png"
MODEL = r"C:\Users\ikdk5\AppData\Local\Temp\sr_models\ESPCN_x4.pb"
OUT = r"C:\Workspace\9man_acers\9man_acer_wiki\docs\public\images\hero_hunter.png"

im = Image.open(SRC).convert("RGBA")
w, h = im.size
rgb = np.array(im.convert("RGB"))

# Flood-fill background from all four corners (background is a contiguous
# cream-colored region touching the image edges; panda body doesn't touch edges).
mask = np.zeros((h + 2, w + 2), np.uint8)
flood_img = rgb.copy()
tol = (18, 18, 18)
seeds = [(0, 0), (w - 1, 0), (0, h - 1), (w - 1, h - 1)]
bg_mask_total = np.zeros((h, w), dtype=bool)
for seed in seeds:
    m = np.zeros((h + 2, w + 2), np.uint8)
    cv2.floodFill(flood_img.copy(), m, seed, (0, 0, 0), loDiff=tol, upDiff=tol, flags=4)
    bg_mask_total |= m[1:-1, 1:-1].astype(bool)

alpha = np.where(bg_mask_total, 0, 255).astype(np.uint8)

rgba = np.dstack([rgb, alpha])
out_im = Image.fromarray(rgba, mode="RGBA")
bbox = out_im.getbbox()
cropped = out_im.crop(bbox)
print("cropped size:", cropped.size)
cropped.save(r"C:\Users\ikdk5\AppData\Local\Temp\panda_nobg.png")

# super-resolve RGB x4, keep alpha with LANCZOS resize
rgb_only = cropped.convert("RGB")
alpha_ch = cropped.split()[-1]

rgb_np = cv2.cvtColor(np.array(rgb_only), cv2.COLOR_RGB2BGR)
sr = cv2.dnn_superres.DnnSuperResImpl_create()
sr.readModel(MODEL)
sr.setModel("espcn", 4)
upscaled_bgr = sr.upsample(rgb_np)
upscaled_rgb = cv2.cvtColor(upscaled_bgr, cv2.COLOR_BGR2RGB)
upscaled_pil = Image.fromarray(upscaled_rgb)

alpha_up = alpha_ch.resize(upscaled_pil.size, Image.LANCZOS)

result = upscaled_pil.convert("RGBA")
result.putalpha(alpha_up)

result_np = np.array(result)
mask2 = result_np[:, :, 3] < 10
result_np[mask2] = [0, 0, 0, 0]
result = Image.fromarray(result_np)

result.save(OUT)
print("saved:", OUT, result.size)
