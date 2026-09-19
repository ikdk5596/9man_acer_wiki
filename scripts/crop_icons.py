from PIL import Image
import os

BASE = r"C:\Workspace\9man_acers\9man_acer_wiki\docs\public\images"

def crop_save(src, box, dst):
    im = Image.open(src)
    im.crop(box).save(dst)

# --- policies: single icon ---
POLICY_BOX = (340, 466, 405, 531)
pol_dir = os.path.join(BASE, "policies")
out_dir = os.path.join(BASE, "policies", "icons")
os.makedirs(out_dir, exist_ok=True)
count = 0
for f in sorted(os.listdir(pol_dir)):
    if not f.lower().endswith(".png"):
        continue
    if f == "endpoint_51.png":
        continue
    src = os.path.join(pol_dir, f)
    dst = os.path.join(out_dir, f)
    crop_save(src, POLICY_BOX, dst)
    count += 1
print("policies cropped:", count)

# --- soldiers: portrait for base images, skill icon for skill images ---
PORTRAIT_BOX = (321, 307, 391, 377)
SKILL1_BOX = (347, 458, 407, 506)

sold_dir = os.path.join(BASE, "soldiers")
for troop in os.listdir(sold_dir):
    troop_path = os.path.join(sold_dir, troop)
    if not os.path.isdir(troop_path) or troop == "icons":
        continue
    out_icons = os.path.join(troop_path, "icons")
    os.makedirs(out_icons, exist_ok=True)
    for f in sorted(os.listdir(troop_path)):
        if not f.lower().endswith(".png"):
            continue
        src = os.path.join(troop_path, f)
        name, ext = os.path.splitext(f)
        if "_skill_" in name:
            dst = os.path.join(out_icons, f)
            crop_save(src, SKILL1_BOX, dst)
        elif name.startswith("level") and "wrap" not in name:
            dst = os.path.join(out_icons, f)
            crop_save(src, PORTRAIT_BOX, dst)
print("soldiers done")
