"""BR-65 / BR-67 watermark stamper for render images (pure function, Pillow only).

- BR-65 (SRS_v2.2.txt:1910): "Ảnh/video render của tài khoản Free luôn có watermark."
- BR-67 (SRS_v2.2.txt:1922): Free only downloads a watermarked PNG render whose long edge is
  at most the configured limit ("cạnh dài ≤1080px").

This module has no DB access and does not read ``settings``: the caller passes the text, the
long-edge limit and the opacity, so it is unit-testable in isolation.

Scope limit: watermarking applies to raster images only. GLB/OBJ meshes cannot carry a visible
image watermark from this backend; for mesh formats the only enforcement available here is the
``watermark`` block sent in the bake payload to the editor worker (see ``bake_service``).
"""

import io
import math

from PIL import Image, ImageDraw, ImageFont, ImageOps

# Layout parameters of the stamp itself (rendering choices, not business rules).
_PERCENT_SCALE = 100          # opacity is expressed in percent
_ALPHA_CHANNEL_MAX = 255      # 8-bit alpha channel
_FONT_DIVISOR = 12            # font height = long edge / 12, so the mark scales with the image
_MIN_FONT_PX = 12             # keeps the mark legible on very small images
_STROKE_DIVISOR = 15          # outline width relative to the font size
_ROTATION_DEGREES = 30        # diagonal tiling angle
_TEXT_FILL_RGB = (255, 255, 255)
_STROKE_FILL_RGB = (0, 0, 0)


def stamp(image_bytes: bytes, *, text: str, max_edge_px: int, opacity_percent: int) -> bytes:
    """Return a PNG: the input downscaled so its long edge is <= ``max_edge_px`` (never
    upscaled) with ``text`` tiled diagonally across it at ``opacity_percent`` alpha."""
    if not text.strip():
        raise ValueError("Watermark text must not be empty")
    if max_edge_px <= 0:
        raise ValueError("max_edge_px must be positive")
    if not 0 < opacity_percent <= _PERCENT_SCALE:
        raise ValueError("opacity_percent must be in (0, 100]")

    with Image.open(io.BytesIO(image_bytes)) as source:
        source.load()
        image = ImageOps.exif_transpose(source).convert("RGBA")

    # Image.thumbnail keeps the aspect ratio and never enlarges the image.
    image.thumbnail((max_edge_px, max_edge_px), Image.Resampling.LANCZOS)

    stamped = Image.alpha_composite(image, _tiled_text_layer(image.size, text, opacity_percent))
    output = io.BytesIO()
    stamped.save(output, format="PNG")
    return output.getvalue()


def _tiled_text_layer(size: tuple[int, int], text: str, opacity_percent: int) -> Image.Image:
    width, height = size
    font_px = max(_MIN_FONT_PX, max(width, height) // _FONT_DIVISOR)
    font = ImageFont.load_default(size=font_px)
    stroke = max(1, font_px // _STROKE_DIVISOR)
    left, top, right, bottom = font.getbbox(text, stroke_width=stroke)
    text_w, text_h = right - left, bottom - top
    step_x, step_y = text_w + font_px, text_h + font_px

    alpha = round(_ALPHA_CHANNEL_MAX * opacity_percent / _PERCENT_SCALE)
    # A square canvas covering the image diagonal, so the rotated tiling has no empty corners.
    side = math.ceil(math.hypot(width, height)) + step_x
    layer = Image.new("RGBA", (side, side), (0, 0, 0, 0))
    draw = ImageDraw.Draw(layer)
    for row, y in enumerate(range(0, side, step_y)):
        offset = (row % 2) * (step_x // 2)  # brick pattern between rows
        for x in range(-offset, side, step_x):
            draw.text(
                (x, y),
                text,
                font=font,
                fill=(*_TEXT_FILL_RGB, alpha),
                stroke_width=stroke,
                stroke_fill=(*_STROKE_FILL_RGB, alpha),
            )
    layer = layer.rotate(_ROTATION_DEGREES, resample=Image.Resampling.BICUBIC)
    crop_left, crop_top = (side - width) // 2, (side - height) // 2
    return layer.crop((crop_left, crop_top, crop_left + width, crop_top + height))
