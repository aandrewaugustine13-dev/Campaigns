#!/usr/bin/env python3
"""Fix the grey background on prairie_mid.png for the Chisholm Trail parallax system.

Reads the source prairie layer PNG, converts to RGBA, keys out the flat grey
background (~RGB 172,172,174) using saturation/luminance thresholds, applies a
soft Gaussian-blurred mask for anti-aliased edges, crops to content bounds, and
writes the result to the canonical runtime path.
"""

from __future__ import annotations

import argparse
from pathlib import Path

from PIL import Image, ImageFilter

# Default paths (relative to the repo root when run as: python scripts/fix_prairie_mid_bg.py)
_DEFAULT_INPUT = "public/backgrounds/chisholm/prairie_mid-1.png"
_DEFAULT_OUTPUT = "public/backgrounds/chisholm/prairie_mid.png"

# Grey-keying thresholds
_SAT_THRESHOLD = 15       # max_channel - min_channel must be < this for grey detection
_LUM_MIN = 145            # mean (R+G+B)/3 lower bound
_LUM_MAX = 190            # mean (R+G+B)/3 upper bound
_GAUSSIAN_SIGMA = 1.0     # blur radius for soft edges on the mask
_SIGMA_TO_RADIUS_MULTIPLIER = 2  # kernel half-width as a multiple of sigma

# Crop parameters
_ALPHA_CONTENT_THRESHOLD = 20   # alpha > this is considered content
_CROP_PADDING = 15              # pixels of padding added around the content bounding box


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Key out grey background from prairie_mid.png and save as RGBA PNG."
    )
    parser.add_argument(
        "--input",
        default=_DEFAULT_INPUT,
        help=f"Source PNG path (default: {_DEFAULT_INPUT})",
    )
    parser.add_argument(
        "--output",
        default=_DEFAULT_OUTPUT,
        help=f"Destination PNG path (default: {_DEFAULT_OUTPUT})",
    )
    parser.add_argument(
        "--sat-threshold",
        type=int,
        default=_SAT_THRESHOLD,
        help=f"Saturation threshold for grey detection (default: {_SAT_THRESHOLD})",
    )
    parser.add_argument(
        "--lum-min",
        type=int,
        default=_LUM_MIN,
        help=f"Minimum mean luminance for grey detection (default: {_LUM_MIN})",
    )
    parser.add_argument(
        "--lum-max",
        type=int,
        default=_LUM_MAX,
        help=f"Maximum mean luminance for grey detection (default: {_LUM_MAX})",
    )
    parser.add_argument(
        "--sigma",
        type=float,
        default=_GAUSSIAN_SIGMA,
        help=f"Gaussian blur sigma for soft mask edges (default: {_GAUSSIAN_SIGMA})",
    )
    parser.add_argument(
        "--padding",
        type=int,
        default=_CROP_PADDING,
        help=f"Pixels of padding around content bounding box (default: {_CROP_PADDING})",
    )
    return parser.parse_args()


def clamp(value: int, minimum: int, maximum: int) -> int:
    return max(minimum, min(maximum, value))


def key_out_grey(
    img: Image.Image,
    sat_threshold: int,
    lum_min: int,
    lum_max: int,
    sigma: float,
) -> Image.Image:
    """Return a copy of *img* with the grey background keyed out (alpha = 0).

    Grey is defined as: saturation (max_channel - min_channel) < sat_threshold
    AND mean luminance between lum_min and lum_max.

    A Gaussian blur is applied to the mask before zeroing alpha, producing
    soft anti-aliased edges instead of hard cutoffs.
    """
    rgba = img.convert("RGBA")
    pixels = rgba.load()
    width, height = rgba.size

    # Build a greyscale mask image: 0 = keep transparent, 255 = keep opaque.
    # Start with fully opaque (255) everywhere, then mark grey pixels as 0.
    mask = Image.new("L", (width, height), 255)
    mask_pixels = mask.load()

    for y in range(height):
        for x in range(width):
            r, g, b, a = pixels[x, y]
            saturation = max(r, g, b) - min(r, g, b)
            luminance = (r + g + b) // 3
            if saturation < sat_threshold and lum_min <= luminance <= lum_max:
                mask_pixels[x, y] = 0

    # Soft edges: blur the mask so grey-to-content transitions are smooth
    if sigma > 0:
        radius = int(round(sigma * _SIGMA_TO_RADIUS_MULTIPLIER))
        mask = mask.filter(ImageFilter.GaussianBlur(radius=radius))

    # Apply mask: where mask value is low, reduce existing alpha proportionally
    mask_pixels = mask.load()
    for y in range(height):
        for x in range(width):
            r, g, b, a = pixels[x, y]
            new_alpha = (a * mask_pixels[x, y]) // 255
            pixels[x, y] = (r, g, b, new_alpha)

    return rgba


def _find_content_bbox(
    img: Image.Image, alpha_threshold: int
) -> tuple[int, int, int, int] | None:
    """Return (left, top, right, bottom) bounding box of pixels with alpha > alpha_threshold.

    Returns ``None`` if no qualifying pixels are found.
    """
    pixels = img.load()
    width, height = img.size

    top = height
    bottom = 0
    left = width
    right = 0

    for y in range(height):
        for x in range(width):
            _, _, _, a = pixels[x, y]
            if a > alpha_threshold:
                top = min(top, y)
                bottom = max(bottom, y)
                left = min(left, x)
                right = max(right, x)

    if top > bottom or left > right:
        return None
    return (left, top, right, bottom)


def crop_to_content(img: Image.Image, alpha_threshold: int, padding: int) -> Image.Image:
    """Crop *img* to the bounding box of pixels with alpha > alpha_threshold.

    Adds *padding* pixels on all sides (clamped to image bounds).
    """
    width, height = img.size
    bbox = _find_content_bbox(img, alpha_threshold)

    if bbox is None:
        # No content found — return the image as-is
        return img

    left, top, right, bottom = bbox
    top = clamp(top - padding, 0, height - 1)
    bottom = clamp(bottom + padding, 0, height - 1)
    left = clamp(left - padding, 0, width - 1)
    right = clamp(right + padding, 0, width - 1)

    return img.crop((left, top, right + 1, bottom + 1))


def content_bbox(img: Image.Image, alpha_threshold: int = 0) -> tuple[int, int, int, int] | None:
    """Return (left, top, right, bottom) bounding box of pixels with alpha > alpha_threshold."""
    return _find_content_bbox(img, alpha_threshold)


def main() -> int:
    args = parse_args()
    input_path = Path(args.input)
    output_path = Path(args.output)

    if not input_path.exists():
        raise SystemExit(f"Input file not found: {input_path}")

    print(f"Opening: {input_path}")
    with Image.open(input_path) as src:
        print(f"  Source mode: {src.mode}, size: {src.size}")
        img = src.copy()

    # Step 1 – Key out the grey background
    print(
        f"Keying out grey (sat < {args.sat_threshold}, "
        f"lum {args.lum_min}–{args.lum_max}, sigma={args.sigma}) …"
    )
    img = key_out_grey(
        img,
        sat_threshold=args.sat_threshold,
        lum_min=args.lum_min,
        lum_max=args.lum_max,
        sigma=args.sigma,
    )

    # Step 2 – Crop to content bounds
    print(f"Cropping to content bounds (alpha > {_ALPHA_CONTENT_THRESHOLD}, padding={args.padding}px) …")
    img = crop_to_content(img, alpha_threshold=_ALPHA_CONTENT_THRESHOLD, padding=args.padding)

    # Step 3 – Save
    output_path.parent.mkdir(parents=True, exist_ok=True)
    img.save(output_path, format="PNG")
    print(f"Saved: {output_path}")

    # Step 4 – Verification
    with Image.open(output_path) as verification:
        ver_mode = verification.mode
        ver_size = verification.size
        ver_arr = verification.copy()

    bbox = content_bbox(ver_arr, alpha_threshold=0)
    print("\n--- Verification ---")
    print(f"  Mode:       {ver_mode}")
    print(f"  Dimensions: {ver_size[0]}x{ver_size[1]}")
    print(f"  Content bbox (alpha > 0): {bbox}")

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
