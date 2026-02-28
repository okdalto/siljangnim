"""
SVG Processor — .svg → structured path/shape JSON.

Dependencies:
  Required: xml.etree.ElementTree (stdlib, always available)
  Optional: svgpathtools (more precise path parsing)
"""

import json
import logging
import re
from pathlib import Path
from xml.etree import ElementTree as ET

from processors import BaseProcessor, ProcessedOutput, ProcessorResult

logger = logging.getLogger(__name__)

# Optional dependency
try:
    import svgpathtools
    _HAS_SVGPATHTOOLS = True
except ImportError:
    _HAS_SVGPATHTOOLS = False

_SVG_NS = "http://www.w3.org/2000/svg"
_NS_MAP = {"svg": _SVG_NS}


class SVGProcessor(BaseProcessor):
    name = "SVG Processor"
    supported_extensions = {".svg"}

    @classmethod
    def is_available(cls) -> bool:
        return True  # stdlib only

    @classmethod
    def process(cls, source_path: Path, output_dir: Path, filename: str) -> ProcessorResult:
        warnings = []
        metadata = {}

        try:
            tree = ET.parse(str(source_path))
            root = tree.getroot()
        except ET.ParseError as e:
            return ProcessorResult(
                source_filename=filename,
                processor_name=cls.name,
                status="error",
                error=f"Failed to parse SVG: {e}",
            )

        # Strip namespace prefix for easier matching
        tag = root.tag
        if tag.startswith("{"):
            ns_end = tag.index("}")
            default_ns = tag[1:ns_end]
        else:
            default_ns = ""

        def _strip_ns(tag_name: str) -> str:
            if tag_name.startswith("{"):
                return tag_name.split("}", 1)[1]
            return tag_name

        # Parse viewBox
        viewbox_str = root.get("viewBox", "")
        viewbox = None
        if viewbox_str:
            parts = re.split(r"[,\s]+", viewbox_str.strip())
            if len(parts) == 4:
                try:
                    viewbox = [float(x) for x in parts]
                except ValueError:
                    pass

        if viewbox is None:
            w = _parse_length(root.get("width", "100"))
            h = _parse_length(root.get("height", "100"))
            viewbox = [0, 0, w, h]

        # Collect elements
        paths = []
        circles = []
        rects = []
        ellipses = []
        lines = []
        polylines = []
        polygons = []
        texts = []
        element_count = 0

        for elem in root.iter():
            tag_local = _strip_ns(elem.tag)
            element_count += 1

            style_attrs = _parse_style_attrs(elem)

            if tag_local == "path":
                d = elem.get("d", "")
                if d:
                    paths.append({
                        "d": d,
                        "fill": style_attrs.get("fill"),
                        "stroke": style_attrs.get("stroke"),
                        "stroke_width": style_attrs.get("stroke-width"),
                        "opacity": style_attrs.get("opacity"),
                        "transform": elem.get("transform"),
                    })

            elif tag_local == "circle":
                circles.append({
                    "cx": _float(elem.get("cx", "0")),
                    "cy": _float(elem.get("cy", "0")),
                    "r": _float(elem.get("r", "0")),
                    "fill": style_attrs.get("fill"),
                    "stroke": style_attrs.get("stroke"),
                })

            elif tag_local == "rect":
                rects.append({
                    "x": _float(elem.get("x", "0")),
                    "y": _float(elem.get("y", "0")),
                    "width": _float(elem.get("width", "0")),
                    "height": _float(elem.get("height", "0")),
                    "rx": _float(elem.get("rx", "0")),
                    "ry": _float(elem.get("ry", "0")),
                    "fill": style_attrs.get("fill"),
                    "stroke": style_attrs.get("stroke"),
                })

            elif tag_local == "ellipse":
                ellipses.append({
                    "cx": _float(elem.get("cx", "0")),
                    "cy": _float(elem.get("cy", "0")),
                    "rx": _float(elem.get("rx", "0")),
                    "ry": _float(elem.get("ry", "0")),
                    "fill": style_attrs.get("fill"),
                    "stroke": style_attrs.get("stroke"),
                })

            elif tag_local == "line":
                lines.append({
                    "x1": _float(elem.get("x1", "0")),
                    "y1": _float(elem.get("y1", "0")),
                    "x2": _float(elem.get("x2", "0")),
                    "y2": _float(elem.get("y2", "0")),
                    "stroke": style_attrs.get("stroke"),
                    "stroke_width": style_attrs.get("stroke-width"),
                })

            elif tag_local == "polyline":
                points_str = elem.get("points", "")
                polylines.append({
                    "points": _parse_points(points_str),
                    "fill": style_attrs.get("fill"),
                    "stroke": style_attrs.get("stroke"),
                })

            elif tag_local == "polygon":
                points_str = elem.get("points", "")
                polygons.append({
                    "points": _parse_points(points_str),
                    "fill": style_attrs.get("fill"),
                    "stroke": style_attrs.get("stroke"),
                })

            elif tag_local == "text":
                text_content = "".join(elem.itertext()).strip()
                if text_content:
                    texts.append({
                        "text": text_content,
                        "x": _float(elem.get("x", "0")),
                        "y": _float(elem.get("y", "0")),
                        "font_size": style_attrs.get("font-size"),
                        "fill": style_attrs.get("fill"),
                    })

        svg_data = {
            "viewBox": viewbox,
            "element_count": element_count,
        }
        # Only include non-empty collections
        if paths:
            svg_data["paths"] = paths
        if circles:
            svg_data["circles"] = circles
        if rects:
            svg_data["rects"] = rects
        if ellipses:
            svg_data["ellipses"] = ellipses
        if lines:
            svg_data["lines"] = lines
        if polylines:
            svg_data["polylines"] = polylines
        if polygons:
            svg_data["polygons"] = polygons
        if texts:
            svg_data["texts"] = texts

        metadata["element_count"] = element_count
        metadata["path_count"] = len(paths)
        metadata["shape_count"] = len(circles) + len(rects) + len(ellipses)

        # Write output
        out_path = output_dir / "svg_data.json"
        out_path.write_text(json.dumps(svg_data, indent=2))

        return ProcessorResult(
            source_filename=filename,
            processor_name=cls.name,
            status="success",
            outputs=[
                ProcessedOutput(
                    "svg_data.json",
                    f"SVG data ({len(paths)} paths, {metadata['shape_count']} shapes)",
                    "application/json",
                ),
            ],
            metadata=metadata,
            warnings=warnings,
        )


def _float(s: str) -> float:
    try:
        return float(s)
    except (ValueError, TypeError):
        return 0.0


def _parse_length(s: str) -> float:
    """Parse an SVG length value, stripping units."""
    s = s.strip()
    s = re.sub(r"(px|pt|em|ex|%|in|cm|mm)$", "", s)
    return _float(s)


def _parse_style_attrs(elem) -> dict:
    """Extract style-related attributes, merging inline style attribute."""
    attrs = {}
    for key in ("fill", "stroke", "stroke-width", "opacity", "font-size"):
        val = elem.get(key)
        if val:
            attrs[key] = val

    # Parse inline style attribute
    style = elem.get("style", "")
    if style:
        for part in style.split(";"):
            part = part.strip()
            if ":" in part:
                k, v = part.split(":", 1)
                attrs[k.strip()] = v.strip()

    return attrs


def _parse_points(points_str: str) -> list[list[float]]:
    """Parse SVG points attribute into list of [x, y] pairs."""
    result = []
    nums = re.findall(r"[-+]?(?:\d+\.?\d*|\.\d+)(?:[eE][-+]?\d+)?", points_str)
    for i in range(0, len(nums) - 1, 2):
        result.append([float(nums[i]), float(nums[i + 1])])
    return result
