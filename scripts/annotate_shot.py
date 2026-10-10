"""Turns a hand-taken screenshot into a connect-guide image: crop it to
what matters, blur personal details, outline what to click - the same
red outline `frontend/scripts/capture-screens.mjs` puts on our own screens.

    python scripts/annotate_shot.py raw.png \\
        backend/platform_mcp/static/platform_mcp/connect/gemini-web/1.png \\
        --crop 0,0,1600,900 --box 1210,520,260,64 --blur 40,20,300,40

Coordinates are pixels of the RAW image (x,y,width,height); --box and
--blur may repeat. The output is at most --max-width wide (default 1600 -
a 2x screenshot of an 800px area) and stripped of metadata. Needs Pillow
(dev only: `pip install pillow`). The shot list: docs/connect-screenshots.md.
"""

import argparse

from PIL import Image, ImageDraw, ImageFilter

RED = (214, 57, 57)  # Tabler's danger red, as on the scripted screenshots


def rect(value: str) -> tuple[int, int, int, int]:
    x, y, w, h = (int(part) for part in value.split(","))
    return x, y, w, h


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("source")
    parser.add_argument("target")
    parser.add_argument("--crop", type=rect, help="keep only this area")
    parser.add_argument("--box", type=rect, action="append", default=[], help="outline this area (what to click)")
    parser.add_argument("--blur", type=rect, action="append", default=[], help="blur this area (names, emails, chats)")
    parser.add_argument("--max-width", type=int, default=1600)
    args = parser.parse_args()

    image = Image.open(args.source).convert("RGB")
    scale = image.width / 800 if image.width >= 1600 else 1  # line width that reads the same at 1x and 2x

    for x, y, w, h in args.blur:
        area = (x, y, x + w, y + h)
        image.paste(image.crop(area).filter(ImageFilter.GaussianBlur(12 * scale)), area)

    draw = ImageDraw.Draw(image)
    for x, y, w, h in args.box:
        pad = round(4 * scale)
        draw.rounded_rectangle(
            (x - pad, y - pad, x + w + pad, y + h + pad), radius=round(8 * scale), outline=RED, width=round(4 * scale)
        )

    if args.crop:
        x, y, w, h = args.crop
        image = image.crop((x, y, x + w, y + h))
    if image.width > args.max_width:
        image = image.resize((args.max_width, round(image.height * args.max_width / image.width)), Image.LANCZOS)

    image.save(args.target, optimize=True)
    print(f"Wrote {args.target} ({image.width}x{image.height})")


if __name__ == "__main__":
    main()
