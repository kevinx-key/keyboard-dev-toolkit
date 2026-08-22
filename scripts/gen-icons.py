"""Generate blue keycap icons for Tauri."""
from PIL import Image, ImageDraw, ImageFont
import os, sys

def create_icon(size):
    img = Image.new('RGBA', (size, size), (0, 0, 0, 0))
    draw = ImageDraw.Draw(img)

    top_color = (96, 165, 250, 255)
    base_color = (37, 99, 235, 255)
    highlight = (255, 255, 255, 76)
    shadow = (0, 0, 0, 25)

    pad = max(size // 10, 3)
    r = max(size // 12, 2)
    base_top = int(size * 0.2)
    draw.rounded_rectangle([pad, base_top, size - pad, size - pad], radius=r, fill=base_color)

    top_h = int(size * 0.18)
    draw.rounded_rectangle([pad, pad, size - pad, pad + top_h], radius=max(r // 2, 1), fill=top_color)

    hl_h = max(size // 20, 1)
    draw.rounded_rectangle([pad, pad, size - pad, pad + hl_h], radius=hl_h // 2, fill=highlight)

    draw.rounded_rectangle([pad, base_top, size - pad, base_top + int(size * 0.06)], radius=2, fill=shadow)

    font_size = int(size * 0.45)
    try:
        font = ImageFont.truetype("arial.ttf", font_size)
    except:
        font = ImageFont.load_default()

    bbox = draw.textbbox((0, 0), "K", font=font)
    tw, th = bbox[2] - bbox[0], bbox[3] - bbox[1]
    tx = (size - tw) // 2
    ty = base_top + (size - pad - base_top - th) // 2
    draw.text((tx, ty), "K", fill=(255, 255, 255, 255), font=font)

    grid_size = max(size // 12, 2)
    gap = grid_size // 2
    gx = size - pad - grid_size * 3 - gap * 2
    gy = size - pad - grid_size * 3 - gap * 2
    grid_color = (255, 255, 255, 76)
    for row in range(3):
        for col in range(3):
            cx = gx + col * (grid_size + gap)
            cy = gy + row * (grid_size + gap)
            draw.rectangle([cx, cy, cx + grid_size, cy + grid_size], fill=grid_color)

    return img


base = r"K:\0AMAC\kle-editor\website-clone\src-tauri\icons"

sizes = [
    ("32x32.png", 32),
    ("128x128.png", 128),
    ("128x128@2x.png", 256),
    ("Square30x30Logo.png", 30),
    ("Square44x44Logo.png", 44),
    ("Square71x71Logo.png", 71),
    ("Square89x89Logo.png", 89),
    ("Square107x107Logo.png", 107),
    ("Square142x142Logo.png", 142),
    ("Square150x150Logo.png", 150),
    ("Square284x284Logo.png", 284),
    ("Square310x310Logo.png", 310),
    ("StoreLogo.png", 50),
    ("icon.png", 512),
]

for name, sz in sizes:
    img = create_icon(sz)
    img.save(os.path.join(base, name), 'PNG')
    print(f"  {name} ({sz}x{sz})")

# ICO multi-res
ico_imgs = []
for s in [32, 64, 128, 256]:
    ico_imgs.append(create_icon(s))
ico_path = os.path.join(base, "icon.ico")
ico_imgs[0].save(ico_path, format='ICO', sizes=[(s, s) for s in [32, 64, 128, 256]], append_images=ico_imgs[1:])
print("  icon.ico ✓")

# ICNS - skip on Windows
print("  icon.icns (skipped - macOS only)")

# Also generate public/favicon.ico and favicon.png
favicon_img = create_icon(32)
favicon_img.save(r"K:\0AMAC\kle-editor\website-clone\public\favicon.ico", format='ICO', sizes=[(32, 32)])
print("  public/favicon.ico ✓")

favicon_png = create_icon(196)
favicon_png.save(r"K:\0AMAC\kle-editor\website-clone\public\favicon.png", 'PNG')
print("  public/favicon.png ✓")

print("\nDone! All icons regenerated.")
