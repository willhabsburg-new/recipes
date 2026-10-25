"""Render the PWA icons into public/. Needs Pillow: python3 scripts/make_icons.py"""

import math
from pathlib import Path

from PIL import Image, ImageDraw

BG = (22, 24, 29)
ACCENT = (245, 158, 11)
OUT = Path(__file__).resolve().parents[1] / "public"
S = 1024  # draw large, downscale for antialiasing


def draw_mark(d: ImageDraw.ImageDraw, scale: float) -> None:
    """A steaming bowl, centred, occupying `scale` of the canvas."""
    c = S / 2
    u = S * scale / 10  # one "unit" of the mark
    # bowl: lower half of an ellipse plus a rim bar
    bowl = [c - 4 * u, c - 2.4 * u, c + 4 * u, c + 4.6 * u]
    d.chord(bowl, 0, 180, fill=ACCENT)
    d.rounded_rectangle([c - 4.6 * u, c + 0.7 * u, c + 4.6 * u, c + 1.5 * u], radius=0.4 * u, fill=ACCENT)
    d.rectangle([c - 4 * u, c + 1.1 * u, c + 4 * u, c + 1.4 * u], fill=ACCENT)
    d.rounded_rectangle([c - 1.6 * u, c + 4.2 * u, c + 1.6 * u, c + 4.8 * u], radius=0.3 * u, fill=ACCENT)
    # steam: three wavy strokes
    for dx in (-2, 0, 2):
        r = 0.21 * u
        for i in range(401):  # a round brush stamped along the curve
            t = i / 400
            y = c - 0.2 * u - t * 3.8 * u
            x = c + dx * u + math.sin(t * math.pi * 2) * 0.45 * u
            d.ellipse([x - r, y - r, x + r, y + r], fill=ACCENT)


def render(name: str, size: int, *, rounded: bool, scale: float) -> None:
    img = Image.new("RGBA", (S, S), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    if rounded:
        d.rounded_rectangle([0, 0, S - 1, S - 1], radius=S * 0.22, fill=BG)
    else:
        d.rectangle([0, 0, S, S], fill=BG)
    draw_mark(d, scale)
    img.resize((size, size), Image.LANCZOS).save(OUT / name)


render("pwa-192.png", 192, rounded=True, scale=0.78)
render("pwa-512.png", 512, rounded=True, scale=0.78)
render("maskable-512.png", 512, rounded=False, scale=0.6)  # stays inside the 80% safe zone
render("apple-touch-icon.png", 180, rounded=False, scale=0.7)
render("favicon-48.png", 48, rounded=True, scale=0.8)
print("icons written to", OUT)
