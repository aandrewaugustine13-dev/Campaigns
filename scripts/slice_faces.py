#!/usr/bin/env python3
"""Slice horizontal face strips into individual status portraits.

Reads all *_states.png files in an input directory, splits each strip into
5 left-to-right panels, trims divider lines / black borders, and writes
results to: <out>/<role>/<status>.png
"""

from __future__ import annotations

import argparse
from pathlib import Path
from typing import Iterable

from PIL import Image

STATUSES = ["neutral", "happy", "tired", "injured", "critical"]


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Slice face strip PNGs into status portraits.")
    parser.add_argument("--in", dest="input_dir", default="public/faces", help="Input directory (default: public/faces)")
    parser.add_argument(
        "--out",
        dest="output_dir",
        default="public/faces/sliced",
        help="Output directory (default: public/faces/sliced)",
    )
    parser.add_argument(
        "--divider",
        type=int,
        default=6,
        help="Pixels to trim from left/right of each split panel before tight trim (default: 6)",
    )
    parser.add_argument(
        "--black-threshold",
        type=int,
        default=8,
        help="RGB threshold for detecting black border pixels during tight trim (default: 8)",
    )
    return parser.parse_args()


def is_black(pixel: tuple[int, ...], threshold: int) -> bool:
    r, g, b = pixel[:3]
    a = pixel[3] if len(pixel) == 4 else 255
    return a > 0 and r <= threshold and g <= threshold and b <= threshold


def row_all_black(img: Image.Image, y: int, threshold: int) -> bool:
    width, _ = img.size
    px = img.load()
    for x in range(width):
        if not is_black(px[x, y], threshold):
            return False
    return True


def col_all_black(img: Image.Image, x: int, threshold: int) -> bool:
    _, height = img.size
    px = img.load()
    for y in range(height):
        if not is_black(px[x, y], threshold):
            return False
    return True


def tight_trim_black_border(img: Image.Image, threshold: int) -> Image.Image:
    """Trim fully-black border rows/columns from all sides."""
    changed = True
    while changed:
        changed = False
        width, height = img.size
        if width <= 1 or height <= 1:
            break

        if row_all_black(img, 0, threshold):
            img = img.crop((0, 1, width, height))
            changed = True
            continue

        width, height = img.size
        if row_all_black(img, height - 1, threshold):
            img = img.crop((0, 0, width, height - 1))
            changed = True
            continue

        width, height = img.size
        if col_all_black(img, 0, threshold):
            img = img.crop((1, 0, width, height))
            changed = True
            continue

        width, height = img.size
        if col_all_black(img, width - 1, threshold):
            img = img.crop((0, 0, width - 1, height))
            changed = True

    return img


def split_bounds(total_width: int, parts: int) -> list[tuple[int, int]]:
    """Return nearly-even integer split bounds from [0, total_width)."""
    bounds: list[tuple[int, int]] = []
    for i in range(parts):
        left = (i * total_width) // parts
        right = ((i + 1) * total_width) // parts
        bounds.append((left, right))
    return bounds


def clamp(value: int, minimum: int, maximum: int) -> int:
    return max(minimum, min(maximum, value))


def iter_state_strips(input_dir: Path) -> Iterable[Path]:
    return sorted(path for path in input_dir.glob("*_states.png") if path.is_file())


def process_strip(strip_path: Path, output_dir: Path, divider: int, black_threshold: int) -> list[Path]:
    role = strip_path.stem.removesuffix("_states")
    out_role_dir = output_dir / role
    out_role_dir.mkdir(parents=True, exist_ok=True)

    with Image.open(strip_path) as strip:
        strip = strip.convert("RGBA")
        width, height = strip.size
        bounds = split_bounds(width, 5)

        generated: list[Path] = []
        for (left, right), status in zip(bounds, STATUSES):
            panel = strip.crop((left, 0, right, height))

            panel_w, panel_h = panel.size
            lr_trim = clamp(divider, 0, max((panel_w - 1) // 2, 0))
            panel = panel.crop((lr_trim, 0, panel_w - lr_trim, panel_h))

            panel = tight_trim_black_border(panel, threshold=black_threshold)

            out_path = out_role_dir / f"{status}.png"
            panel.save(out_path, format="PNG")
            generated.append(out_path)

    return generated


def main() -> int:
    args = parse_args()
    input_dir = Path(args.input_dir)
    output_dir = Path(args.output_dir)

    if not input_dir.exists() or not input_dir.is_dir():
        raise SystemExit(f"Input directory does not exist or is not a directory: {input_dir}")

    strips = list(iter_state_strips(input_dir))
    if not strips:
        print(f"No *_states.png strips found in {input_dir}")
        return 0

    generated_all: list[Path] = []
    processed = 0

    for strip_path in strips:
        generated = process_strip(strip_path, output_dir, divider=args.divider, black_threshold=args.black_threshold)
        generated_all.extend(generated)
        processed += 1

    print(f"Processed {processed} strip(s). Generated {len(generated_all)} panel file(s):")
    for out_path in generated_all:
        print(out_path.as_posix())

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
