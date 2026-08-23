from pathlib import Path

from PIL import Image, ImageDraw


ROOT = Path(__file__).resolve().parent.parent
BACKGROUND = "#315c53"
PAPER = "#f7faf9"


def draw_icon(size: int, destination: str) -> None:
    image = Image.new("RGB", (size, size), BACKGROUND)
    draw = ImageDraw.Draw(image)
    scale = size / 512
    box = tuple(round(value * scale) for value in (134, 112, 378, 400))
    draw.rounded_rectangle(box, radius=round(42 * scale), fill=PAPER)
    width = max(3, round(25 * scale))
    for start, end in [((184, 190), (328, 190)), ((184, 256), (328, 256)), ((184, 322), (274, 322))]:
        scaled_start = tuple(round(value * scale) for value in start)
        scaled_end = tuple(round(value * scale) for value in end)
        draw.line([scaled_start, scaled_end], fill=BACKGROUND, width=width)
        radius = width // 2
        for x, y in (scaled_start, scaled_end):
            draw.ellipse((x - radius, y - radius, x + radius, y + radius), fill=BACKGROUND)
    image.save(ROOT / destination, optimize=True)


draw_icon(512, "icon-maskable-512.png")
draw_icon(180, "apple-touch-icon.png")
