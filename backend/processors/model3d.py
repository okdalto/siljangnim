"""
3D Model Processor — .obj/.gltf/.glb → geometry JSON.

Dependencies: None (pure Python OBJ parser, JSON+struct for glTF).
"""

import base64
import json
import logging
import struct
from pathlib import Path

from processors import BaseProcessor, ProcessedOutput, ProcessorResult

logger = logging.getLogger(__name__)

_MAX_VERTICES = 100_000


class Model3DProcessor(BaseProcessor):
    name = "3D Model Processor"
    supported_extensions = {".obj", ".gltf", ".glb"}

    @classmethod
    def is_available(cls) -> bool:
        return True  # pure Python

    @classmethod
    def process(cls, source_path: Path, output_dir: Path, filename: str) -> ProcessorResult:
        ext = source_path.suffix.lower()

        try:
            if ext == ".obj":
                geometry = cls._parse_obj(source_path)
            elif ext == ".gltf":
                geometry = cls._parse_gltf(source_path)
            elif ext == ".glb":
                geometry = cls._parse_glb(source_path)
            else:
                return ProcessorResult(
                    source_filename=filename,
                    processor_name=cls.name,
                    status="error",
                    error=f"Unsupported format: {ext}",
                )
        except Exception as e:
            return ProcessorResult(
                source_filename=filename,
                processor_name=cls.name,
                status="error",
                error=f"Parse error: {e}",
            )

        warnings = geometry.pop("_warnings", [])

        # Write output
        out_path = output_dir / "geometry.json"
        out_path.write_text(json.dumps(geometry))

        metadata = {
            "vertex_count": geometry.get("vertex_count", 0),
            "face_count": geometry.get("face_count", 0),
            "has_normals": geometry.get("has_normals", False),
            "has_uvs": geometry.get("has_uvs", False),
        }

        return ProcessorResult(
            source_filename=filename,
            processor_name=cls.name,
            status="partial" if warnings else "success",
            outputs=[
                ProcessedOutput(
                    "geometry.json",
                    f"Geometry ({metadata['vertex_count']} vertices, {metadata['face_count']} faces)",
                    "application/json",
                ),
            ],
            metadata=metadata,
            warnings=warnings,
        )

    @classmethod
    def _parse_obj(cls, path: Path) -> dict:
        """Parse Wavefront OBJ file."""
        positions = []
        normals = []
        uvs = []
        # Final indexed data
        out_positions = []
        out_normals = []
        out_uvs = []
        out_indices = []
        vertex_map = {}  # (v_idx, vt_idx, vn_idx) -> output index
        face_count = 0
        warnings = []
        truncated = False

        text = path.read_text(encoding="utf-8", errors="replace")

        for line in text.split("\n"):
            line = line.strip()
            if not line or line.startswith("#"):
                continue

            parts = line.split()
            prefix = parts[0]

            if prefix == "v" and len(parts) >= 4:
                positions.append([float(parts[1]), float(parts[2]), float(parts[3])])
            elif prefix == "vn" and len(parts) >= 4:
                normals.append([float(parts[1]), float(parts[2]), float(parts[3])])
            elif prefix == "vt" and len(parts) >= 3:
                uvs.append([float(parts[1]), float(parts[2])])
            elif prefix == "f":
                face_vertices = []
                for vert_str in parts[1:]:
                    indices = vert_str.split("/")
                    v_idx = int(indices[0]) - 1 if indices[0] else -1
                    vt_idx = int(indices[1]) - 1 if len(indices) > 1 and indices[1] else -1
                    vn_idx = int(indices[2]) - 1 if len(indices) > 2 and indices[2] else -1

                    key = (v_idx, vt_idx, vn_idx)
                    if key not in vertex_map:
                        if len(out_positions) // 3 >= _MAX_VERTICES:
                            if not truncated:
                                warnings.append(
                                    f"Model exceeds {_MAX_VERTICES} vertices, truncated"
                                )
                                truncated = True
                            break
                        idx = len(out_positions) // 3
                        vertex_map[key] = idx

                        if 0 <= v_idx < len(positions):
                            out_positions.extend(positions[v_idx])
                        else:
                            out_positions.extend([0, 0, 0])
                        if 0 <= vn_idx < len(normals):
                            out_normals.extend(normals[vn_idx])
                        if 0 <= vt_idx < len(uvs):
                            out_uvs.extend(uvs[vt_idx])

                    face_vertices.append(vertex_map.get(key, 0))

                if truncated:
                    continue

                # Triangulate (fan triangulation)
                for i in range(1, len(face_vertices) - 1):
                    out_indices.extend([face_vertices[0], face_vertices[i], face_vertices[i + 1]])
                    face_count += 1

        vertex_count = len(out_positions) // 3

        # Compute bounds
        bounds = _compute_bounds(out_positions)

        return {
            "vertex_count": vertex_count,
            "face_count": face_count,
            "has_normals": len(out_normals) > 0,
            "has_uvs": len(out_uvs) > 0,
            "bounds": bounds,
            "positions": [round(v, 6) for v in out_positions],
            "normals": [round(v, 6) for v in out_normals] if out_normals else [],
            "uvs": [round(v, 6) for v in out_uvs] if out_uvs else [],
            "indices": out_indices,
            "_warnings": warnings,
        }

    @classmethod
    def _parse_gltf(cls, path: Path) -> dict:
        """Parse glTF JSON file."""
        gltf = json.loads(path.read_text())
        base_dir = path.parent

        # Load binary buffers
        buffers_data = []
        for buf in gltf.get("buffers", []):
            uri = buf.get("uri", "")
            if uri.startswith("data:"):
                # Data URI
                _, encoded = uri.split(",", 1)
                buffers_data.append(base64.b64decode(encoded))
            else:
                buf_path = base_dir / uri
                if buf_path.exists():
                    buffers_data.append(buf_path.read_bytes())
                else:
                    buffers_data.append(b"")

        return cls._extract_gltf_geometry(gltf, buffers_data)

    @classmethod
    def _parse_glb(cls, path: Path) -> dict:
        """Parse GLB binary file."""
        data = path.read_bytes()

        # GLB header
        if len(data) < 12:
            raise ValueError("GLB file too small")
        magic, version, length = struct.unpack_from("<III", data, 0)
        if magic != 0x46546C67:  # glTF magic
            raise ValueError("Not a valid GLB file")

        # Read chunks
        offset = 12
        json_data = None
        bin_data = b""

        while offset < len(data):
            if offset + 8 > len(data):
                break
            chunk_length, chunk_type = struct.unpack_from("<II", data, offset)
            offset += 8
            chunk_data = data[offset:offset + chunk_length]
            offset += chunk_length

            if chunk_type == 0x4E4F534A:  # JSON
                json_data = json.loads(chunk_data.decode("utf-8"))
            elif chunk_type == 0x004E4942:  # BIN
                bin_data = chunk_data

        if json_data is None:
            raise ValueError("No JSON chunk in GLB")

        return cls._extract_gltf_geometry(json_data, [bin_data])

    @classmethod
    def _extract_gltf_geometry(cls, gltf: dict, buffers_data: list[bytes]) -> dict:
        """Extract geometry from parsed glTF data."""
        warnings = []
        all_positions = []
        all_normals = []
        all_uvs = []
        all_indices = []
        face_count = 0
        vertex_offset = 0

        buffer_views = gltf.get("bufferViews", [])
        accessors = gltf.get("accessors", [])

        def read_accessor(acc_idx: int) -> list:
            if acc_idx < 0 or acc_idx >= len(accessors):
                return []
            acc = accessors[acc_idx]
            bv_idx = acc.get("bufferView", 0)
            if bv_idx >= len(buffer_views):
                return []
            bv = buffer_views[bv_idx]

            buf_idx = bv.get("buffer", 0)
            if buf_idx >= len(buffers_data):
                return []
            buf = buffers_data[buf_idx]

            byte_offset = bv.get("byteOffset", 0) + acc.get("byteOffset", 0)
            count = acc.get("count", 0)
            comp_type = acc.get("componentType", 5126)  # FLOAT
            acc_type = acc.get("type", "SCALAR")

            # Component count
            type_sizes = {"SCALAR": 1, "VEC2": 2, "VEC3": 3, "VEC4": 4}
            n_components = type_sizes.get(acc_type, 1)

            # Component byte size
            comp_sizes = {5120: 1, 5121: 1, 5122: 2, 5123: 2, 5125: 4, 5126: 4}
            comp_size = comp_sizes.get(comp_type, 4)

            # Format string
            fmt_map = {5120: "b", 5121: "B", 5122: "h", 5123: "H", 5125: "I", 5126: "f"}
            fmt_char = fmt_map.get(comp_type, "f")

            stride = bv.get("byteStride", comp_size * n_components)
            values = []

            for i in range(count):
                offset = byte_offset + i * stride
                for j in range(n_components):
                    o = offset + j * comp_size
                    if o + comp_size <= len(buf):
                        val = struct.unpack_from(f"<{fmt_char}", buf, o)[0]
                        values.append(float(val) if comp_type == 5126 else val)
                    else:
                        values.append(0)

            return values

        # Process meshes
        for mesh in gltf.get("meshes", []):
            for prim in mesh.get("primitives", []):
                attrs = prim.get("attributes", {})

                pos_data = []
                if "POSITION" in attrs:
                    pos_data = read_accessor(attrs["POSITION"])

                norm_data = []
                if "NORMAL" in attrs:
                    norm_data = read_accessor(attrs["NORMAL"])

                uv_data = []
                if "TEXCOORD_0" in attrs:
                    uv_data = read_accessor(attrs["TEXCOORD_0"])

                n_verts = len(pos_data) // 3
                if vertex_offset + n_verts > _MAX_VERTICES:
                    remaining = _MAX_VERTICES - vertex_offset
                    if remaining <= 0:
                        warnings.append(f"Model exceeds {_MAX_VERTICES} vertices, truncated")
                        break
                    n_verts = remaining
                    pos_data = pos_data[:n_verts * 3]
                    norm_data = norm_data[:n_verts * 3] if norm_data else []
                    uv_data = uv_data[:n_verts * 2] if uv_data else []
                    warnings.append(f"Model exceeds {_MAX_VERTICES} vertices, truncated")

                all_positions.extend(pos_data)
                all_normals.extend(norm_data)
                all_uvs.extend(uv_data)

                # Indices
                idx_acc = prim.get("indices")
                if idx_acc is not None:
                    idx_data = read_accessor(idx_acc)
                    # Offset indices
                    for idx in idx_data:
                        all_indices.append(int(idx) + vertex_offset)
                    face_count += len(idx_data) // 3
                else:
                    # Non-indexed: generate sequential indices
                    for i in range(0, n_verts - 2, 3):
                        all_indices.extend([
                            vertex_offset + i,
                            vertex_offset + i + 1,
                            vertex_offset + i + 2,
                        ])
                    face_count += n_verts // 3

                vertex_offset += n_verts

        vertex_count = len(all_positions) // 3
        bounds = _compute_bounds(all_positions)

        return {
            "vertex_count": vertex_count,
            "face_count": face_count,
            "has_normals": len(all_normals) > 0,
            "has_uvs": len(all_uvs) > 0,
            "bounds": bounds,
            "positions": [round(v, 6) for v in all_positions],
            "normals": [round(v, 6) for v in all_normals] if all_normals else [],
            "uvs": [round(v, 6) for v in all_uvs] if all_uvs else [],
            "indices": all_indices,
            "_warnings": warnings,
        }


def _compute_bounds(positions: list) -> dict:
    """Compute bounding box from flat position array."""
    if not positions:
        return {"min": [0, 0, 0], "max": [0, 0, 0], "center": [0, 0, 0]}

    min_v = [float("inf")] * 3
    max_v = [float("-inf")] * 3

    for i in range(0, len(positions), 3):
        for j in range(3):
            if i + j < len(positions):
                v = positions[i + j]
                min_v[j] = min(min_v[j], v)
                max_v[j] = max(max_v[j], v)

    center = [(min_v[i] + max_v[i]) / 2 for i in range(3)]
    return {
        "min": [round(v, 6) for v in min_v],
        "max": [round(v, 6) for v in max_v],
        "center": [round(v, 6) for v in center],
    }
