"""
Font Processor — .ttf/.otf/.woff/.woff2 → bitmap atlas + MSDF + vector outlines.

Dependencies:
  Required: fonttools, Pillow
  Optional: brotli (WOFF2), msdf-atlas-gen binary (MSDF atlas)
"""

import json
import logging
import math
import shutil
import subprocess
from pathlib import Path

from processors import BaseProcessor, ProcessedOutput, ProcessorResult

logger = logging.getLogger(__name__)

# Dependency checks
try:
    from fontTools.ttLib import TTFont
    from fontTools.pens.svgPathPen import SVGPathPen
    _HAS_FONTTOOLS = True
except ImportError:
    _HAS_FONTTOOLS = False

try:
    from PIL import Image, ImageDraw, ImageFont
    _HAS_PILLOW = True
except ImportError:
    _HAS_PILLOW = False

try:
    import brotli  # noqa: F401
    _HAS_BROTLI = True
except ImportError:
    _HAS_BROTLI = False

_HAS_MSDF = shutil.which("msdf-atlas-gen") is not None

# ASCII printable range
_CHAR_START = 0x20
_CHAR_END = 0x7E
_CHARS = [chr(c) for c in range(_CHAR_START, _CHAR_END + 1)]
_FONT_SIZE = 48
_MAX_ATLAS = 2048


class FontProcessor(BaseProcessor):
    name = "Font Processor"
    supported_extensions = {".ttf", ".otf", ".woff", ".woff2"}

    @classmethod
    def is_available(cls) -> bool:
        return _HAS_FONTTOOLS and _HAS_PILLOW

    @classmethod
    def process(cls, source_path: Path, output_dir: Path, filename: str) -> ProcessorResult:
        outputs = []
        warnings = []
        metadata = {}

        # Load font
        try:
            tt_font = TTFont(str(source_path))
        except Exception as e:
            if ".woff2" in filename.lower() and not _HAS_BROTLI:
                return ProcessorResult(
                    source_filename=filename,
                    processor_name=cls.name,
                    status="error",
                    error="WOFF2 support requires 'brotli' package: pip install brotli",
                )
            return ProcessorResult(
                source_filename=filename,
                processor_name=cls.name,
                status="error",
                error=f"Failed to load font: {e}",
            )

        # 1. Bitmap atlas
        try:
            atlas_out, atlas_meta = cls._build_bitmap_atlas(source_path, output_dir)
            outputs.append(atlas_out)
            outputs.append(atlas_meta)
            metadata["glyph_count"] = len(_CHARS)
        except Exception as e:
            warnings.append(f"Bitmap atlas failed: {e}")
            logger.warning("Bitmap atlas failed for %s: %s", filename, e)

        # 2. Vector outlines
        try:
            outlines_out = cls._extract_outlines(tt_font, output_dir)
            outputs.append(outlines_out)
        except Exception as e:
            warnings.append(f"Outline extraction failed: {e}")
            logger.warning("Outline extraction failed for %s: %s", filename, e)

        # 3. MSDF atlas (optional)
        if _HAS_MSDF:
            try:
                msdf_outputs = cls._build_msdf_atlas(source_path, output_dir)
                outputs.extend(msdf_outputs)
            except Exception as e:
                warnings.append(f"MSDF atlas failed: {e}")
                logger.warning("MSDF atlas failed for %s: %s", filename, e)

        # Font metadata
        name_table = tt_font.get("name")
        if name_table:
            for record in name_table.names:
                if record.nameID == 1:  # Font Family
                    metadata["family"] = str(record)
                    break

        tt_font.close()

        status = "success" if outputs else "error"
        if warnings and outputs:
            status = "partial"

        return ProcessorResult(
            source_filename=filename,
            processor_name=cls.name,
            status=status,
            outputs=outputs,
            metadata=metadata,
            warnings=warnings,
            error=None if outputs else "No outputs generated",
        )

    @classmethod
    def _build_bitmap_atlas(
        cls, font_path: Path, output_dir: Path
    ) -> tuple[ProcessedOutput, ProcessedOutput]:
        """Render ASCII glyphs into a bitmap atlas with metrics."""
        pil_font = ImageFont.truetype(str(font_path), _FONT_SIZE)

        # Measure all glyphs
        glyph_metrics = {}
        max_w, max_h = 0, 0
        for ch in _CHARS:
            bbox = pil_font.getbbox(ch)
            if bbox is None:
                continue
            x0, y0, x1, y1 = bbox
            w = x1 - x0
            h = y1 - y0
            # Get advance width
            advance = pil_font.getlength(ch)
            glyph_metrics[ch] = {
                "bbox": (x0, y0, x1, y1),
                "w": w,
                "h": h,
                "advance": advance,
                "bearing_x": x0,
                "bearing_y": -y0,  # positive = above baseline
            }
            max_w = max(max_w, w)
            max_h = max(max_h, h)

        if not glyph_metrics:
            raise ValueError("No renderable glyphs found")

        # Grid layout
        cell_w = max_w + 2  # 1px padding each side
        cell_h = max_h + 2
        cols = max(1, min(16, int(math.sqrt(len(glyph_metrics)))))
        rows = math.ceil(len(glyph_metrics) / cols)

        atlas_w = min(cols * cell_w, _MAX_ATLAS)
        atlas_h = min(rows * cell_h, _MAX_ATLAS)

        # Render atlas (white glyphs on transparent)
        atlas = Image.new("RGBA", (atlas_w, atlas_h), (0, 0, 0, 0))
        draw = ImageDraw.Draw(atlas)

        metrics_json = {
            "font_size": _FONT_SIZE,
            "atlas_width": atlas_w,
            "atlas_height": atlas_h,
            "glyphs": {},
        }

        for i, (ch, m) in enumerate(glyph_metrics.items()):
            col = i % cols
            row = i // cols
            x = col * cell_w + 1  # 1px left padding
            y = row * cell_h + 1  # 1px top padding

            # Draw glyph offset by its bearing
            draw_x = x - m["bearing_x"]
            draw_y = y - (-m["bbox"][1])  # offset by top bearing
            draw.text((draw_x, draw_y), ch, fill=(255, 255, 255, 255), font=pil_font)

            # UV coordinates (normalized)
            u0 = x / atlas_w
            v0 = y / atlas_h
            u1 = (x + m["w"]) / atlas_w
            v1 = (y + m["h"]) / atlas_h

            metrics_json["glyphs"][ch] = {
                "x": x, "y": y,
                "w": m["w"], "h": m["h"],
                "advance": round(m["advance"], 2),
                "bearing_x": m["bearing_x"],
                "bearing_y": m["bearing_y"],
                "uv": [round(u0, 6), round(v0, 6), round(u1, 6), round(v1, 6)],
            }

        # Save
        atlas_path = output_dir / "atlas.png"
        atlas.save(str(atlas_path), "PNG")

        metrics_path = output_dir / "atlas_metrics.json"
        metrics_path.write_text(json.dumps(metrics_json, indent=2))

        return (
            ProcessedOutput("atlas.png", f"Bitmap glyph atlas ({_FONT_SIZE}px)", "image/png"),
            ProcessedOutput("atlas_metrics.json", "Glyph metrics with UV coordinates", "application/json"),
        )

    @classmethod
    def _extract_outlines(cls, tt_font: TTFont, output_dir: Path) -> ProcessedOutput:
        """Extract vector outlines as SVG path data."""
        glyph_set = tt_font.getGlyphSet()
        cmap = tt_font.getBestCmap()
        outlines = {}

        for char_code in range(_CHAR_START, _CHAR_END + 1):
            ch = chr(char_code)
            glyph_name = cmap.get(char_code)
            if glyph_name is None:
                continue
            try:
                pen = SVGPathPen(glyph_set)
                glyph_set[glyph_name].draw(pen)
                path_data = pen.getCommands()
                if path_data:
                    outlines[ch] = path_data
            except Exception:
                continue

        outlines_path = output_dir / "outlines.json"
        outlines_path.write_text(json.dumps(outlines, indent=2))

        return ProcessedOutput(
            "outlines.json",
            f"Vector outlines for {len(outlines)} glyphs (SVG path data)",
            "application/json",
        )

    @classmethod
    def _build_msdf_atlas(cls, font_path: Path, output_dir: Path) -> list[ProcessedOutput]:
        """Build MSDF atlas using msdf-atlas-gen binary."""
        atlas_path = output_dir / "msdf_atlas.png"
        metrics_path = output_dir / "msdf_metrics.json"

        charset_range = f"{_CHAR_START}-{_CHAR_END}"
        cmd = [
            "msdf-atlas-gen",
            "-font", str(font_path),
            "-type", "msdf",
            "-imageout", str(atlas_path),
            "-json", str(metrics_path),
            "-charset", charset_range,
            "-size", str(_FONT_SIZE),
        ]

        result = subprocess.run(cmd, capture_output=True, text=True, timeout=30)
        if result.returncode != 0:
            raise RuntimeError(f"msdf-atlas-gen failed: {result.stderr}")

        return [
            ProcessedOutput("msdf_atlas.png", "MSDF glyph atlas", "image/png"),
            ProcessedOutput("msdf_metrics.json", "MSDF glyph metrics", "application/json"),
        ]
