import cv2
import numpy as np
from PIL import Image
import os

SRC_HERO = r"C:\Users\ikdk5\AppData\Roaming\Hermes\composer-images\image_908157.png"
MODEL = r"C:\Users\ikdk5\AppData\Local\Temp\sr_models\ESPCN_x4.pb"
OUT = r"C:\Workspace\9man_acers\9man_acer_wiki\docs\public\images\hero_hunter.png"

# 1. remove black background, get RGBA cropped character
im = Image.open(SRC_HERO).convert("RGBA")
w, h = im.size
px = im.load()
out = Image.new("RGBA", (w, h), (0, 0, 0, 0))
opx = out.load()


def is_dark(r, g, b, tol=30):
    return r < tol and g < tol and b < tol


for y in range(h):
    for x in range(w):
        r, g, b, a = px[x, y]
        if is_dark(r, g, b):
            opx[x, y] = (0, 0, 0, 0)
        else:
            opx[x, y] = (r, g, b, 255)

bbox = out.getbbox()
cropped = out.crop(bbox)
print("cropped size:", cropped.size)

# 2. split alpha, super-resolve RGB channels with ESPCN x4, upscale alpha with LANCZOS
rgb = cropped.convert("RGB")
alpha = cropped.split()[-1]

rgb_np = cv2.cvtColor(np.array(rgb), cv2.COLOR_RGB2BGR)

sr = cv2.dnn_superres.DnnSuperResImpl_create()
sr.readModel(MODEL)
sr.setModel("espcn", 4)
upscaled_bgr = sr.upsample(rgb_np)
print("upscaled size:", upscaled_bgr.shape)

upscaled_rgb = cv2.cvtColor(upscaled_bgr, cv2.COLOR_BGR2RGB)
upscaled_pil = Image.fromarray(upscaled_rgb)

# upscale alpha channel to match (nearest to keep hard edges of transparency)
alpha_up = alpha.resize(upscaled_pil.size, Image.LANCZOS)

result = upscaled_pil.convert("RGBA")
result.putalpha(alpha_up)

# clean up: fully transparent pixels should not carry stray color (avoid halo)
result_np = np.array(result)
mask = result_np[:, :, 3] < 10
result_np[mask] = [0, 0, 0, 0]
result = Image.fromarray(result_np)

result.save(OUT)
print("saved:", OUT, result.size)
