"""
3D Model Processor — .obj/.fbx/.gltf/.glb → geometry JSON.

Dependencies: None (pure Python OBJ parser, binary FBX parser, JSON+struct for glTF).
"""

import base64
import json
import logging
import struct
import zlib
from collections import defaultdict
from pathlib import Path

from processors import BaseProcessor, ProcessedOutput, ProcessorResult

logger = logging.getLogger(__name__)

_MAX_VERTICES = 100_000
_MAX_BONES = 128
_MAX_KEYFRAMES = 500
_FBX_TICKS_PER_SECOND = 46186158000


# ------------------------------------------------------------------
# FBX binary reader
# ------------------------------------------------------------------

class _FbxBinaryReader:
    """Low-level FBX binary node/property reader."""

    def __init__(self, data: bytes):
        if len(data) < 27 or data[:21] != b"Kaydara FBX Binary  \x00"[:21]:
            raise ValueError("Not a valid FBX binary file")
        self.data = data
        self.version = struct.unpack_from("<I", data, 23)[0]
        self.is64 = self.version >= 7500
        self._sentinel_size = 25 if self.is64 else 13

    def read_all_nodes(self) -> dict:
        nodes = {}
        offset = 27
        while offset < len(self.data) - self._sentinel_size:
            node, offset = self._read_node(offset)
            if node is None:
                break
            nname = node["name"]
            if nname in nodes:
                if not isinstance(nodes[nname], list):
                    nodes[nname] = [nodes[nname]]
                nodes[nname].append(node)
            else:
                nodes[nname] = node
        return nodes

    def _read_node(self, offset: int):
        data = self.data
        if self.is64:
            if offset + 25 > len(data):
                return None, len(data)
            end_offset = struct.unpack_from("<Q", data, offset)[0]
            num_props = struct.unpack_from("<Q", data, offset + 8)[0]
            prop_list_len = struct.unpack_from("<Q", data, offset + 16)[0]
            name_len = data[offset + 24]
            name_start = offset + 25
        else:
            if offset + 13 > len(data):
                return None, len(data)
            end_offset = struct.unpack_from("<I", data, offset)[0]
            num_props = struct.unpack_from("<I", data, offset + 4)[0]
            prop_list_len = struct.unpack_from("<I", data, offset + 8)[0]
            name_len = data[offset + 12]
            name_start = offset + 13

        if end_offset == 0:
            return None, offset + self._sentinel_size

        name = data[name_start:name_start + name_len].decode("ascii", errors="replace")
        prop_data_start = name_start + name_len

        props = []
        po = prop_data_start
        for _ in range(num_props):
            prop, po = self._read_property(po)
            props.append(prop)

        children = {}
        child_offset = prop_data_start + prop_list_len
        while child_offset < end_offset - self._sentinel_size:
            child, child_offset = self._read_node(child_offset)
            if child is None:
                break
            cname = child["name"]
            if cname in children:
                if not isinstance(children[cname], list):
                    children[cname] = [children[cname]]
                children[cname].append(child)
            else:
                children[cname] = child

        return {"name": name, "props": props, "children": children}, end_offset

    def _read_property(self, offset: int):
        data = self.data
        type_code = chr(data[offset])
        offset += 1

        if type_code == "Y":
            return struct.unpack_from("<h", data, offset)[0], offset + 2
        if type_code == "C":
            return bool(data[offset]), offset + 1
        if type_code == "I":
            return struct.unpack_from("<i", data, offset)[0], offset + 4
        if type_code == "F":
            return struct.unpack_from("<f", data, offset)[0], offset + 4
        if type_code == "D":
            return struct.unpack_from("<d", data, offset)[0], offset + 8
        if type_code == "L":
            return struct.unpack_from("<q", data, offset)[0], offset + 8

        if type_code in ("i", "l", "f", "d", "b"):
            arr_len = struct.unpack_from("<I", data, offset)[0]
            encoding = struct.unpack_from("<I", data, offset + 4)[0]
            comp_len = struct.unpack_from("<I", data, offset + 8)[0]
            offset += 12
            raw = data[offset:offset + comp_len]
            if encoding == 1:
                raw = zlib.decompress(raw)
            fmt_map = {"i": "<i", "l": "<q", "f": "<f", "d": "<d", "b": "B"}
            fmt = fmt_map[type_code]
            elem_size = struct.calcsize(fmt)
            arr = [struct.unpack_from(fmt, raw, i * elem_size)[0] for i in range(arr_len)]
            return arr, offset + comp_len

        if type_code == "S":
            slen = struct.unpack_from("<I", data, offset)[0]
            s = data[offset + 4:offset + 4 + slen].decode("utf-8", errors="replace")
            return s, offset + 4 + slen

        if type_code == "R":
            rlen = struct.unpack_from("<I", data, offset)[0]
            return data[offset + 4:offset + 4 + rlen], offset + 4 + rlen

        raise ValueError(f"Unknown FBX property type: {type_code}")


# ------------------------------------------------------------------
# FBX helpers
# ------------------------------------------------------------------

def _ensure_list(val):
    if val is None:
        return []
    return val if isinstance(val, list) else [val]


def _parse_fbx_connections(conn_node):
    p2c = defaultdict(list)
    c2p = defaultdict(list)
    if conn_node is None:
        return p2c, c2p
    for c in _ensure_list(conn_node.get("children", {}).get("C")):
        props = c.get("props", [])
        if len(props) < 3:
            continue
        child_id, parent_id = props[1], props[2]
        prop_name = props[3] if len(props) > 3 else ""
        p2c[parent_id].append(child_id)
        c2p[child_id].append((parent_id, prop_name))
    return p2c, c2p


def _build_objects_map(objects_node):
    objects = {}
    if objects_node is None:
        return objects
    for children in objects_node.get("children", {}).values():
        for child in _ensure_list(children):
            props = child.get("props", [])
            if props:
                objects[props[0]] = child
    return objects


def _parse_properties70(node):
    result = {}
    if node is None:
        return result
    for p in _ensure_list(node.get("children", {}).get("P")):
        props = p.get("props", [])
        if len(props) < 5:
            continue
        values = props[4:]
        result[props[0]] = values[0] if len(values) == 1 else values
    return result


def _extract_fbx_texture(tex_node, tex_id, p2c, objects, output_dir, idx):
    if output_dir is None:
        return None
    tc = tex_node.get("children", {})
    fn_node = tc.get("FileName") or tc.get("RelativeFilename")
    orig = fn_node["props"][0] if fn_node and fn_node.get("props") else ""
    ext = Path(orig).suffix.lower() if orig else ".png"
    if ext not in (".png", ".jpg", ".jpeg", ".tga", ".bmp"):
        ext = ".png"
    for child_id in p2c.get(tex_id, []):
        child = objects.get(child_id)
        if child is None or child.get("name") != "Video":
            continue
        content = child.get("children", {}).get("Content")
        if content and content.get("props"):
            raw = content["props"][0]
            if isinstance(raw, bytes) and len(raw) > 0:
                name = f"texture_{idx}{ext}"
                (output_dir / name).write_bytes(raw)
                return name
    return None


def _extract_fbx_materials(objects_node, p2c, c2p, objects, output_dir):
    materials = []
    texture_files = []
    for mat_node in _ensure_list(objects_node.get("children", {}).get("Material")):
        props = mat_node.get("props", [])
        mat_id = props[0] if props else None
        mat_name = (props[1].split("\x00")[0]
                    if len(props) > 1 and isinstance(props[1], str)
                    else "Material")
        p70 = _parse_properties70(
            mat_node.get("children", {}).get("Properties70"))
        md = {"name": mat_name}
        for key, out_key in [("DiffuseColor", "diffuse_color"),
                             ("SpecularColor", "specular_color"),
                             ("EmissiveColor", "emissive_color")]:
            v = p70.get(key)
            if isinstance(v, (list, tuple)) and len(v) >= 3:
                md[out_key] = [round(float(x), 4) for x in v[:3]]
        if "Opacity" in p70:
            md["opacity"] = round(float(p70["Opacity"]), 4)
        if "Shininess" in p70:
            md["shininess"] = round(float(p70["Shininess"]), 4)
        if mat_id is not None:
            for child_id in p2c.get(mat_id, []):
                child = objects.get(child_id)
                if child is None or child.get("name") != "Texture":
                    continue
                tex_fn = _extract_fbx_texture(
                    child, child_id, p2c, objects,
                    output_dir, len(texture_files))
                if tex_fn:
                    assigned = False
                    for pid, prop in c2p.get(child_id, []):
                        if pid == mat_id:
                            if "Diffuse" in prop:
                                md["diffuse_texture"] = tex_fn
                            elif "Normal" in prop or "Bump" in prop:
                                md["normal_texture"] = tex_fn
                            else:
                                md.setdefault("diffuse_texture", tex_fn)
                            assigned = True
                            break
                    if not assigned:
                        md.setdefault("diffuse_texture", tex_fn)
                    texture_files.append(tex_fn)
        materials.append(md)
    return materials, texture_files


def _extract_fbx_skeleton(objects_node, p2c, c2p, objects):
    bone_types = {"LimbNode", "Root", "Null", "Limb"}
    bone_candidates = {}
    for model in _ensure_list(objects_node.get("children", {}).get("Model")):
        props = model.get("props", [])
        if len(props) < 3:
            continue
        obj_id, obj_type = props[0], props[2]
        obj_name = (props[1].split("\x00")[0]
                    if isinstance(props[1], str) else str(props[1]))
        if obj_type in bone_types:
            bone_candidates[obj_id] = (obj_name, model)
    if not bone_candidates:
        return [], {}, []

    bone_children = defaultdict(list)
    bone_parent = {}
    root_bones = []
    for bone_id in bone_candidates:
        found = False
        for parent_id, _ in c2p.get(bone_id, []):
            if parent_id in bone_candidates:
                bone_children[parent_id].append(bone_id)
                bone_parent[bone_id] = parent_id
                found = True
                break
        if not found:
            root_bones.append(bone_id)

    ordered = []
    queue = list(root_bones)
    while queue and len(ordered) < _MAX_BONES:
        bid = queue.pop(0)
        ordered.append(bid)
        queue.extend(bone_children.get(bid, []))

    bone_id_to_index = {bid: i for i, bid in enumerate(ordered)}
    bones = []
    for bid in ordered:
        name, _ = bone_candidates[bid]
        parent_idx = bone_id_to_index.get(bone_parent.get(bid), -1)
        bones.append({
            "name": name, "parent": parent_idx,
            "inverse_bind_matrix": [1, 0, 0, 0, 0, 1, 0, 0,
                                    0, 0, 1, 0, 0, 0, 0, 1],
        })

    clusters = []
    for deformer in _ensure_list(
            objects_node.get("children", {}).get("Deformer")):
        props = deformer.get("props", [])
        if len(props) < 3 or props[2] != "Cluster":
            continue
        deformer_id = props[0]
        dc = deformer.get("children", {})
        idx_node, wt_node = dc.get("Indexes"), dc.get("Weights")
        if idx_node is None or wt_node is None:
            continue
        vi = idx_node["props"][0] if idx_node.get("props") else []
        wt = wt_node["props"][0] if wt_node.get("props") else []
        if not isinstance(vi, list) or not isinstance(wt, list):
            continue
        ibm = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]
        tl = dc.get("TransformLink")
        if (tl and tl.get("props") and isinstance(tl["props"][0], list)
                and len(tl["props"][0]) >= 16):
            ibm = [float(v) for v in tl["props"][0][:16]]

        bone_index = -1
        for cid in p2c.get(deformer_id, []):
            if cid in bone_id_to_index:
                bone_index = bone_id_to_index[cid]
                break
        if bone_index < 0:
            continue
        bones[bone_index]["inverse_bind_matrix"] = [
            round(v, 6) for v in ibm]

        geom_id = None
        for skin_id, _ in c2p.get(deformer_id, []):
            skin = objects.get(skin_id)
            if (skin and skin.get("name") == "Deformer"
                    and len(skin.get("props", [])) >= 3
                    and skin["props"][2] == "Skin"):
                for gid, _ in c2p.get(skin_id, []):
                    g = objects.get(gid)
                    if g and g.get("name") == "Geometry":
                        geom_id = gid
                        break
                break
        clusters.append((bone_index, geom_id,
                         [int(v) for v in vi], [float(v) for v in wt]))
    return bones, bone_id_to_index, clusters


def _extract_fbx_animations(objects_node, p2c, c2p, objects,
                             bone_id_to_index):
    if not bone_id_to_index:
        return []
    animations = []
    for stack in _ensure_list(
            objects_node.get("children", {}).get("AnimationStack")):
        props = stack.get("props", [])
        stack_id = props[0] if props else None
        stack_name = (props[1].split("\x00")[0]
                      if len(props) > 1 and isinstance(props[1], str)
                      else "Animation")
        if stack_id is None:
            continue
        layer_ids = [
            cid for cid in p2c.get(stack_id, [])
            if (objects.get(cid) or {}).get("name") == "AnimationLayer"]
        if not layer_ids:
            continue

        tracks = []
        max_time = 0.0
        for layer_id in layer_ids:
            for cn_id in p2c.get(layer_id, []):
                cn = objects.get(cn_id)
                if cn is None or cn.get("name") != "AnimationCurveNode":
                    continue
                target_bone, target_prop = -1, ""
                for pid, prop in c2p.get(cn_id, []):
                    if pid in bone_id_to_index:
                        target_bone = bone_id_to_index[pid]
                        if "Translation" in prop:
                            target_prop = "translation"
                        elif "Rotation" in prop:
                            target_prop = "rotation"
                        elif "Scaling" in prop:
                            target_prop = "scale"
                        break
                if target_bone < 0 or not target_prop:
                    continue

                curves = {}
                for cid in p2c.get(cn_id, []):
                    c = objects.get(cid)
                    if c is None or c.get("name") != "AnimationCurve":
                        continue
                    ch = ""
                    for pid, prop in c2p.get(cid, []):
                        if pid == cn_id:
                            ch = prop
                            break
                    cc = c.get("children", {})
                    kt = cc.get("KeyTime")
                    kv = cc.get("KeyValueFloat")
                    if kt is None or kv is None:
                        continue
                    t_raw = (kt["props"][0]
                             if kt.get("props")
                             and isinstance(kt["props"][0], list) else [])
                    v_raw = (kv["props"][0]
                             if kv.get("props")
                             and isinstance(kv["props"][0], list) else [])
                    if t_raw and v_raw:
                        curves[ch] = (
                            [t / _FBX_TICKS_PER_SECOND for t in t_raw],
                            [float(v) for v in v_raw])
                if not curves:
                    continue

                xd = curves.get("d|X", ([], []))
                yd = curves.get("d|Y", ([], []))
                zd = curves.get("d|Z", ([], []))
                master = xd[0] or yd[0] or zd[0]
                if not master:
                    continue
                n = len(master)
                step = max(1, n // _MAX_KEYFRAMES)
                si = list(range(0, n, step))
                if si[-1] != n - 1:
                    si.append(n - 1)
                times = [round(master[i], 6) for i in si]
                values = []
                for i in si:
                    values.extend([
                        round(xd[1][i], 6) if i < len(xd[1]) else 0.0,
                        round(yd[1][i], 6) if i < len(yd[1]) else 0.0,
                        round(zd[1][i], 6) if i < len(zd[1]) else 0.0,
                    ])
                if times:
                    max_time = max(max_time, times[-1])
                tracks.append({
                    "bone_index": target_bone, "property": target_prop,
                    "times": times, "values": values,
                })

        if tracks:
            p70 = _parse_properties70(
                stack.get("children", {}).get("Properties70"))
            duration = max_time
            if "LocalStop" in p70:
                try:
                    duration = max(
                        duration, p70["LocalStop"] / _FBX_TICKS_PER_SECOND)
                except (TypeError, ZeroDivisionError):
                    pass
            animations.append({
                "name": stack_name,
                "duration": round(duration, 4),
                "tracks": tracks,
            })
    return animations


# ------------------------------------------------------------------
# glTF helpers
# ------------------------------------------------------------------

def _extract_gltf_texture(gltf, buffers_data, tex_idx, output_dir,
                           file_index):
    if tex_idx is None or output_dir is None:
        return None
    textures = gltf.get("textures", [])
    if tex_idx >= len(textures):
        return None
    img_idx = textures[tex_idx].get("source")
    if img_idx is None:
        return None
    images = gltf.get("images", [])
    if img_idx >= len(images):
        return None
    image = images[img_idx]
    mime = image.get("mimeType", "image/png")
    ext = ".png" if "png" in mime else ".jpg"

    bv_idx = image.get("bufferView")
    if bv_idx is not None:
        bvs = gltf.get("bufferViews", [])
        if bv_idx < len(bvs):
            bv = bvs[bv_idx]
            buf_idx = bv.get("buffer", 0)
            if buf_idx < len(buffers_data):
                buf = buffers_data[buf_idx]
                off = bv.get("byteOffset", 0)
                length = bv.get("byteLength", 0)
                name = f"texture_{file_index}{ext}"
                (output_dir / name).write_bytes(buf[off:off + length])
                return name

    uri = image.get("uri")
    if uri and uri.startswith("data:"):
        _, encoded = uri.split(",", 1)
        name = f"texture_{file_index}{ext}"
        (output_dir / name).write_bytes(base64.b64decode(encoded))
        return name
    return None


# ------------------------------------------------------------------
# Main processor
# ------------------------------------------------------------------

class Model3DProcessor(BaseProcessor):
    name = "3D Model Processor"
    supported_extensions = {".obj", ".fbx", ".gltf", ".glb"}

    @classmethod
    def is_available(cls) -> bool:
        return True

    @classmethod
    def process(cls, source_path: Path, output_dir: Path,
                filename: str) -> ProcessorResult:
        ext = source_path.suffix.lower()

        try:
            if ext == ".obj":
                geometry = cls._parse_obj(source_path)
            elif ext == ".fbx":
                geometry = cls._parse_fbx(source_path, output_dir)
            elif ext == ".gltf":
                geometry = cls._parse_gltf(source_path, output_dir)
            elif ext == ".glb":
                geometry = cls._parse_glb(source_path, output_dir)
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
        texture_files = geometry.pop("_texture_files", [])

        out_path = output_dir / "geometry.json"
        out_path.write_text(json.dumps(geometry))

        metadata = {
            "vertex_count": geometry.get("vertex_count", 0),
            "face_count": geometry.get("face_count", 0),
            "has_normals": geometry.get("has_normals", False),
            "has_uvs": geometry.get("has_uvs", False),
            "has_materials": "materials" in geometry,
            "has_skeleton": "skeleton" in geometry,
            "has_animations": "animations" in geometry,
        }
        if "skeleton" in geometry:
            metadata["bone_count"] = len(
                geometry["skeleton"].get("bones", []))
        if "animations" in geometry:
            metadata["animation_count"] = len(geometry["animations"])

        outputs = [
            ProcessedOutput(
                "geometry.json",
                f"Geometry ({metadata['vertex_count']} vertices, "
                f"{metadata['face_count']} faces)",
                "application/json",
            ),
        ]
        for tf in texture_files:
            tf_ext = Path(tf).suffix.lower()
            mime = "image/png" if tf_ext == ".png" else "image/jpeg"
            outputs.append(ProcessedOutput(tf, f"Texture: {tf}", mime))

        return ProcessorResult(
            source_filename=filename,
            processor_name=cls.name,
            status="partial" if warnings else "success",
            outputs=outputs,
            metadata=metadata,
            warnings=warnings,
        )

    # ------------------------------------------------------------------
    # OBJ parser (unchanged)
    # ------------------------------------------------------------------

    @classmethod
    def _parse_obj(cls, path: Path) -> dict:
        """Parse Wavefront OBJ file."""
        positions = []
        normals = []
        uvs = []
        out_positions = []
        out_normals = []
        out_uvs = []
        out_indices = []
        vertex_map = {}
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
                positions.append(
                    [float(parts[1]), float(parts[2]), float(parts[3])])
            elif prefix == "vn" and len(parts) >= 4:
                normals.append(
                    [float(parts[1]), float(parts[2]), float(parts[3])])
            elif prefix == "vt" and len(parts) >= 3:
                uvs.append([float(parts[1]), float(parts[2])])
            elif prefix == "f":
                face_vertices = []
                for vert_str in parts[1:]:
                    indices = vert_str.split("/")
                    v_idx = int(indices[0]) - 1 if indices[0] else -1
                    vt_idx = (int(indices[1]) - 1
                              if len(indices) > 1 and indices[1] else -1)
                    vn_idx = (int(indices[2]) - 1
                              if len(indices) > 2 and indices[2] else -1)

                    key = (v_idx, vt_idx, vn_idx)
                    if key not in vertex_map:
                        if len(out_positions) // 3 >= _MAX_VERTICES:
                            if not truncated:
                                warnings.append(
                                    f"Model exceeds {_MAX_VERTICES} "
                                    "vertices, truncated")
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

                for i in range(1, len(face_vertices) - 1):
                    out_indices.extend(
                        [face_vertices[0], face_vertices[i],
                         face_vertices[i + 1]])
                    face_count += 1

        vertex_count = len(out_positions) // 3
        bounds = _compute_bounds(out_positions)

        return {
            "vertex_count": vertex_count,
            "face_count": face_count,
            "has_normals": len(out_normals) > 0,
            "has_uvs": len(out_uvs) > 0,
            "bounds": bounds,
            "positions": [round(v, 6) for v in out_positions],
            "normals": ([round(v, 6) for v in out_normals]
                        if out_normals else []),
            "uvs": [round(v, 6) for v in out_uvs] if out_uvs else [],
            "indices": out_indices,
            "_warnings": warnings,
        }

    # ------------------------------------------------------------------
    # FBX binary parser
    # ------------------------------------------------------------------

    @classmethod
    def _parse_fbx(cls, path: Path, output_dir=None) -> dict:
        """Parse FBX binary file — geometry, materials, skeleton,
        animations."""
        reader = _FbxBinaryReader(path.read_bytes())
        nodes = reader.read_all_nodes()

        objects_node = nodes.get("Objects")
        if objects_node is None:
            raise ValueError("FBX file has no Objects section")

        conn_node = nodes.get("Connections")
        p2c, c2p = _parse_fbx_connections(conn_node)
        objects_map = _build_objects_map(objects_node)

        # --- Extract geometry ---
        warnings: list[str] = []
        all_positions: list[float] = []
        all_normals: list[float] = []
        all_uvs: list[float] = []
        all_indices: list[int] = []
        face_count = 0
        vertex_offset = 0
        truncated = False
        geom_orig_to_expanded: dict[int, dict] = {}

        geom_nodes = _ensure_list(
            objects_node.get("children", {}).get("Geometry"))
        if not geom_nodes:
            raise ValueError("FBX file has no Geometry nodes")

        for geom in geom_nodes:
            if (len(geom.get("props", [])) >= 3
                    and geom["props"][2] != "Mesh"):
                continue
            geom_id = geom["props"][0] if geom.get("props") else None
            gc = geom.get("children", {})

            vert_node = gc.get("Vertices")
            if vert_node is None:
                continue
            raw_verts = vert_node["props"][0] if vert_node["props"] else []
            if not isinstance(raw_verts, list):
                continue

            n_verts = len(raw_verts) // 3
            if truncated:
                continue
            if vertex_offset + n_verts > _MAX_VERTICES:
                remaining = _MAX_VERTICES - vertex_offset
                if remaining <= 0:
                    if not truncated:
                        warnings.append(
                            f"Model exceeds {_MAX_VERTICES} vertices, "
                            "truncated")
                        truncated = True
                    continue
                n_verts = remaining
                raw_verts = raw_verts[:n_verts * 3]
                warnings.append(
                    f"Model exceeds {_MAX_VERTICES} vertices, truncated")
                truncated = True

            positions = [float(v) for v in raw_verts]

            pvi_node = gc.get("PolygonVertexIndex")
            if pvi_node is None:
                continue
            raw_indices = pvi_node["props"][0] if pvi_node["props"] else []
            if not isinstance(raw_indices, list):
                continue

            # Normals
            normals_flat: list[float] = []
            normal_mapping = "ByPolygonVertex"
            normal_ref = "Direct"
            normal_index: list[int] = []
            le_normal = gc.get("LayerElementNormal")
            if le_normal is not None:
                lec = le_normal.get("children", {})
                ndata = lec.get("Normals")
                if ndata and ndata["props"]:
                    normals_flat = (
                        [float(v) for v in ndata["props"][0]]
                        if isinstance(ndata["props"][0], list) else [])
                mm = lec.get("MappingInformationType")
                if mm and mm["props"]:
                    normal_mapping = mm["props"][0]
                rm = lec.get("ReferenceInformationType")
                if rm and rm["props"]:
                    normal_ref = rm["props"][0]
                ni = lec.get("NormalsIndex")
                if (ni and ni["props"]
                        and isinstance(ni["props"][0], list)):
                    normal_index = ni["props"][0]

            # UVs
            uvs_flat: list[float] = []
            uv_mapping = "ByPolygonVertex"
            uv_ref = "Direct"
            uv_index: list[int] = []
            le_uv = gc.get("LayerElementUV")
            if le_uv is not None:
                lec = le_uv.get("children", {})
                uvdata = lec.get("UV")
                if uvdata and uvdata["props"]:
                    uvs_flat = (
                        [float(v) for v in uvdata["props"][0]]
                        if isinstance(uvdata["props"][0], list) else [])
                mm = lec.get("MappingInformationType")
                if mm and mm["props"]:
                    uv_mapping = mm["props"][0]
                rm = lec.get("ReferenceInformationType")
                if rm and rm["props"]:
                    uv_ref = rm["props"][0]
                uvi = lec.get("UVIndex")
                if (uvi and uvi["props"]
                        and isinstance(uvi["props"][0], list)):
                    uv_index = uvi["props"][0]

            # Build polygons
            polygons: list[list[int]] = []
            current_poly: list[int] = []
            for idx in raw_indices:
                if idx < 0:
                    current_poly.append(~idx)
                    polygons.append(current_poly)
                    current_poly = []
                else:
                    current_poly.append(idx)

            # Build output with fan triangulation
            poly_vertex_counter = 0
            mesh_positions: list[float] = []
            mesh_normals: list[float] = []
            mesh_uvs: list[float] = []
            mesh_indices: list[int] = []
            mesh_face_count = 0
            out_vert_idx = 0
            orig_to_expanded: dict[int, list[int]] = defaultdict(list)

            for poly in polygons:
                poly_out: list[int] = []
                for i, v_idx in enumerate(poly):
                    if v_idx * 3 + 2 < len(positions):
                        mesh_positions.extend(
                            positions[v_idx * 3:v_idx * 3 + 3])
                    else:
                        mesh_positions.extend([0.0, 0.0, 0.0])

                    if normals_flat:
                        ni_val = poly_vertex_counter
                        if normal_mapping == "ByPolygonVertex":
                            if (normal_ref == "IndexToDirect"
                                    and poly_vertex_counter
                                    < len(normal_index)):
                                ni_val = normal_index[poly_vertex_counter]
                        elif normal_mapping in ("ByVertex", "ByVertice"):
                            ni_val = v_idx
                            if (normal_ref == "IndexToDirect"
                                    and v_idx < len(normal_index)):
                                ni_val = normal_index[v_idx]
                        if ni_val * 3 + 2 < len(normals_flat):
                            mesh_normals.extend(
                                normals_flat[ni_val * 3:ni_val * 3 + 3])
                        else:
                            mesh_normals.extend([0.0, 0.0, 0.0])

                    if uvs_flat:
                        uv_val = poly_vertex_counter
                        if uv_mapping == "ByPolygonVertex":
                            if (uv_ref == "IndexToDirect"
                                    and poly_vertex_counter
                                    < len(uv_index)):
                                uv_val = uv_index[poly_vertex_counter]
                        elif uv_mapping in ("ByVertex", "ByVertice"):
                            uv_val = v_idx
                            if (uv_ref == "IndexToDirect"
                                    and v_idx < len(uv_index)):
                                uv_val = uv_index[v_idx]
                        if uv_val * 2 + 1 < len(uvs_flat):
                            mesh_uvs.extend(
                                uvs_flat[uv_val * 2:uv_val * 2 + 2])
                        else:
                            mesh_uvs.extend([0.0, 0.0])

                    orig_to_expanded[v_idx].append(
                        out_vert_idx + vertex_offset)
                    poly_out.append(out_vert_idx)
                    out_vert_idx += 1
                    poly_vertex_counter += 1

                for j in range(1, len(poly_out) - 1):
                    mesh_indices.extend(
                        [poly_out[0], poly_out[j], poly_out[j + 1]])
                    mesh_face_count += 1

            for idx in mesh_indices:
                all_indices.append(idx + vertex_offset)
            all_positions.extend(mesh_positions)
            all_normals.extend(mesh_normals)
            all_uvs.extend(mesh_uvs)
            face_count += mesh_face_count
            if geom_id is not None:
                geom_orig_to_expanded[geom_id] = dict(orig_to_expanded)
            vertex_offset += out_vert_idx

        vertex_count = len(all_positions) // 3
        bounds = _compute_bounds(all_positions)

        result = {
            "vertex_count": vertex_count,
            "face_count": face_count,
            "has_normals": len(all_normals) > 0,
            "has_uvs": len(all_uvs) > 0,
            "bounds": bounds,
            "positions": [round(v, 6) for v in all_positions],
            "normals": ([round(v, 6) for v in all_normals]
                        if all_normals else []),
            "uvs": [round(v, 6) for v in all_uvs] if all_uvs else [],
            "indices": all_indices,
            "_warnings": warnings,
        }

        # --- Materials ---
        try:
            materials, texture_files = _extract_fbx_materials(
                objects_node, p2c, c2p, objects_map, output_dir)
            if materials:
                result["materials"] = materials
            if texture_files:
                result["_texture_files"] = texture_files
        except Exception as e:
            logger.warning("FBX material extraction failed: %s", e)

        # --- Skeleton ---
        bone_id_to_index: dict = {}
        try:
            bones, bone_id_to_index, clusters = _extract_fbx_skeleton(
                objects_node, p2c, c2p, objects_map)
            if bones and clusters:
                influences = [[] for _ in range(vertex_count)]
                for bone_idx, geom_id, vi, wt in clusters:
                    o2e = geom_orig_to_expanded.get(geom_id, {})
                    for i, orig_idx in enumerate(vi):
                        w = wt[i] if i < len(wt) else 0.0
                        if w <= 0.0:
                            continue
                        for exp_idx in o2e.get(orig_idx, []):
                            if exp_idx < vertex_count:
                                influences[exp_idx].append((bone_idx, w))

                bone_indices_flat: list[int] = []
                bone_weights_flat: list[float] = []
                for inf in influences:
                    inf.sort(key=lambda x: x[1], reverse=True)
                    top4 = inf[:4]
                    bi = [0, 0, 0, 0]
                    bw = [0.0, 0.0, 0.0, 0.0]
                    total = sum(w for _, w in top4)
                    for k, (bidx, w) in enumerate(top4):
                        bi[k] = bidx
                        bw[k] = w / total if total > 0 else 0.0
                    bone_indices_flat.extend(bi)
                    bone_weights_flat.extend(
                        [round(w, 6) for w in bw])

                result["skeleton"] = {
                    "bones": [{
                        "name": b["name"], "parent": b["parent"],
                        "inverse_bind_matrix": b["inverse_bind_matrix"],
                    } for b in bones],
                    "bone_indices": bone_indices_flat,
                    "bone_weights": bone_weights_flat,
                }
        except Exception as e:
            logger.warning("FBX skeleton extraction failed: %s", e)

        # --- Animations ---
        try:
            animations = _extract_fbx_animations(
                objects_node, p2c, c2p, objects_map, bone_id_to_index)
            if animations:
                result["animations"] = animations
        except Exception as e:
            logger.warning("FBX animation extraction failed: %s", e)

        return result

    # ------------------------------------------------------------------
    # glTF / GLB parsers
    # ------------------------------------------------------------------

    @classmethod
    def _parse_gltf(cls, path: Path, output_dir=None) -> dict:
        gltf = json.loads(path.read_text())
        base_dir = path.parent

        buffers_data = []
        for buf in gltf.get("buffers", []):
            uri = buf.get("uri", "")
            if uri.startswith("data:"):
                _, encoded = uri.split(",", 1)
                buffers_data.append(base64.b64decode(encoded))
            else:
                buf_path = base_dir / uri
                if buf_path.exists():
                    buffers_data.append(buf_path.read_bytes())
                else:
                    buffers_data.append(b"")

        return cls._extract_gltf_data(gltf, buffers_data, output_dir)

    @classmethod
    def _parse_glb(cls, path: Path, output_dir=None) -> dict:
        data = path.read_bytes()

        if len(data) < 12:
            raise ValueError("GLB file too small")
        magic, version, length = struct.unpack_from("<III", data, 0)
        if magic != 0x46546C67:
            raise ValueError("Not a valid GLB file")

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

            if chunk_type == 0x4E4F534A:
                json_data = json.loads(chunk_data.decode("utf-8"))
            elif chunk_type == 0x004E4942:
                bin_data = chunk_data

        if json_data is None:
            raise ValueError("No JSON chunk in GLB")

        return cls._extract_gltf_data(json_data, [bin_data], output_dir)

    @classmethod
    def _extract_gltf_data(cls, gltf: dict, buffers_data: list[bytes],
                           output_dir=None) -> dict:
        """Extract geometry, materials, skeleton, animations from glTF."""
        warnings: list[str] = []
        all_positions: list[float] = []
        all_normals: list[float] = []
        all_uvs: list[float] = []
        all_indices: list[int] = []
        all_joints: list[int] = []
        all_weights: list[float] = []
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
            comp_type = acc.get("componentType", 5126)
            acc_type = acc.get("type", "SCALAR")

            type_sizes = {"SCALAR": 1, "VEC2": 2, "VEC3": 3, "VEC4": 4,
                          "MAT2": 4, "MAT3": 9, "MAT4": 16}
            n_components = type_sizes.get(acc_type, 1)

            comp_sizes = {5120: 1, 5121: 1, 5122: 2, 5123: 2,
                          5125: 4, 5126: 4}
            comp_size = comp_sizes.get(comp_type, 4)

            fmt_map = {5120: "b", 5121: "B", 5122: "h", 5123: "H",
                       5125: "I", 5126: "f"}
            fmt_char = fmt_map.get(comp_type, "f")

            stride = bv.get("byteStride", comp_size * n_components)
            values = []

            for i in range(count):
                off = byte_offset + i * stride
                for j in range(n_components):
                    o = off + j * comp_size
                    if o + comp_size <= len(buf):
                        val = struct.unpack_from(f"<{fmt_char}", buf, o)[0]
                        values.append(
                            float(val) if comp_type == 5126 else val)
                    else:
                        values.append(0)

            return values

        # Process meshes
        for mesh in gltf.get("meshes", []):
            for prim in mesh.get("primitives", []):
                attrs = prim.get("attributes", {})

                pos_data = (read_accessor(attrs["POSITION"])
                            if "POSITION" in attrs else [])
                norm_data = (read_accessor(attrs["NORMAL"])
                             if "NORMAL" in attrs else [])
                uv_data = (read_accessor(attrs["TEXCOORD_0"])
                           if "TEXCOORD_0" in attrs else [])
                joint_data = (read_accessor(attrs["JOINTS_0"])
                              if "JOINTS_0" in attrs else [])
                weight_data = (read_accessor(attrs["WEIGHTS_0"])
                               if "WEIGHTS_0" in attrs else [])

                n_verts = len(pos_data) // 3
                if vertex_offset + n_verts > _MAX_VERTICES:
                    remaining = _MAX_VERTICES - vertex_offset
                    if remaining <= 0:
                        warnings.append(
                            f"Model exceeds {_MAX_VERTICES} vertices, "
                            "truncated")
                        break
                    n_verts = remaining
                    pos_data = pos_data[:n_verts * 3]
                    norm_data = (norm_data[:n_verts * 3]
                                 if norm_data else [])
                    uv_data = (uv_data[:n_verts * 2]
                               if uv_data else [])
                    joint_data = (joint_data[:n_verts * 4]
                                  if joint_data else [])
                    weight_data = (weight_data[:n_verts * 4]
                                   if weight_data else [])
                    warnings.append(
                        f"Model exceeds {_MAX_VERTICES} vertices, truncated")

                all_positions.extend(pos_data)
                all_normals.extend(norm_data)
                all_uvs.extend(uv_data)
                all_joints.extend(joint_data)
                all_weights.extend(weight_data)

                idx_acc = prim.get("indices")
                if idx_acc is not None:
                    idx_data = read_accessor(idx_acc)
                    for idx in idx_data:
                        all_indices.append(int(idx) + vertex_offset)
                    face_count += len(idx_data) // 3
                else:
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

        result: dict = {
            "vertex_count": vertex_count,
            "face_count": face_count,
            "has_normals": len(all_normals) > 0,
            "has_uvs": len(all_uvs) > 0,
            "bounds": bounds,
            "positions": [round(v, 6) for v in all_positions],
            "normals": ([round(v, 6) for v in all_normals]
                        if all_normals else []),
            "uvs": [round(v, 6) for v in all_uvs] if all_uvs else [],
            "indices": all_indices,
            "_warnings": warnings,
        }

        # --- Materials ---
        texture_files: list[str] = []
        try:
            gltf_mats = gltf.get("materials", [])
            if gltf_mats:
                materials = []
                for mat in gltf_mats:
                    md: dict = {"name": mat.get("name", "Material")}
                    pbr = mat.get("pbrMetallicRoughness", {})
                    bc = pbr.get("baseColorFactor")
                    if bc and len(bc) >= 3:
                        md["diffuse_color"] = [
                            round(float(v), 4) for v in bc[:3]]
                        if len(bc) >= 4:
                            md["opacity"] = round(float(bc[3]), 4)
                    em = mat.get("emissiveFactor")
                    if em and len(em) >= 3:
                        md["emissive_color"] = [
                            round(float(v), 4) for v in em[:3]]
                    # Textures
                    base_tex = pbr.get("baseColorTexture")
                    if base_tex is not None:
                        tf = _extract_gltf_texture(
                            gltf, buffers_data, base_tex.get("index"),
                            output_dir, len(texture_files))
                        if tf:
                            md["diffuse_texture"] = tf
                            texture_files.append(tf)
                    norm_tex = mat.get("normalTexture")
                    if norm_tex is not None:
                        tf = _extract_gltf_texture(
                            gltf, buffers_data, norm_tex.get("index"),
                            output_dir, len(texture_files))
                        if tf:
                            md["normal_texture"] = tf
                            texture_files.append(tf)
                    materials.append(md)
                result["materials"] = materials
        except Exception as e:
            logger.warning("glTF material extraction failed: %s", e)

        if texture_files:
            result["_texture_files"] = texture_files

        # --- Skeleton ---
        joint_to_bone: dict[int, int] = {}
        try:
            skins = gltf.get("skins", [])
            if skins and all_joints:
                skin = skins[0]
                joint_indices = skin.get("joints", [])

                # Node parent map
                node_parents: dict[int, int] = {}
                for i, node in enumerate(gltf.get("nodes", [])):
                    for child in node.get("children", []):
                        node_parents[child] = i

                # Inverse bind matrices
                ibm_acc = skin.get("inverseBindMatrices")
                ibm_data = (read_accessor(ibm_acc)
                            if ibm_acc is not None else [])

                bones = []
                for bone_idx, jni in enumerate(joint_indices):
                    if bone_idx >= _MAX_BONES:
                        break
                    gltf_nodes = gltf.get("nodes", [])
                    node = (gltf_nodes[jni]
                            if jni < len(gltf_nodes) else {})
                    bone_name = node.get("name", f"bone_{bone_idx}")
                    pn = node_parents.get(jni)
                    parent_bone = (joint_to_bone.get(pn, -1)
                                   if pn is not None else -1)
                    ibm = [1, 0, 0, 0, 0, 1, 0, 0,
                           0, 0, 1, 0, 0, 0, 0, 1]
                    s = bone_idx * 16
                    if ibm_data and s + 15 < len(ibm_data):
                        ibm = [round(float(v), 6)
                               for v in ibm_data[s:s + 16]]
                    joint_to_bone[jni] = bone_idx
                    bones.append({
                        "name": bone_name, "parent": parent_bone,
                        "inverse_bind_matrix": ibm,
                    })

                result["skeleton"] = {
                    "bones": bones,
                    "bone_indices": [int(v) for v in all_joints],
                    "bone_weights": [round(float(v), 6)
                                     for v in all_weights],
                }
        except Exception as e:
            logger.warning("glTF skeleton extraction failed: %s", e)

        # --- Animations ---
        try:
            gltf_anims = gltf.get("animations", [])
            if gltf_anims and joint_to_bone:
                animations = []
                for anim in gltf_anims:
                    anim_name = anim.get("name", "Animation")
                    channels = anim.get("channels", [])
                    samplers = anim.get("samplers", [])

                    tracks = []
                    max_time = 0.0
                    for channel in channels:
                        target = channel.get("target", {})
                        node_idx = target.get("node")
                        path = target.get("path")
                        if node_idx is None or path is None:
                            continue
                        bone_idx = joint_to_bone.get(node_idx)
                        if bone_idx is None:
                            continue
                        sampler_idx = channel.get("sampler")
                        if (sampler_idx is None
                                or sampler_idx >= len(samplers)):
                            continue
                        sampler = samplers[sampler_idx]
                        inp_acc = sampler.get("input")
                        out_acc = sampler.get("output")
                        if inp_acc is None or out_acc is None:
                            continue
                        times = read_accessor(inp_acc)
                        values = read_accessor(out_acc)
                        if not times or not values:
                            continue

                        n_keys = len(times)
                        components = len(values) // n_keys if n_keys else 0
                        step = max(1, n_keys // _MAX_KEYFRAMES)
                        si = list(range(0, n_keys, step))
                        if si and si[-1] != n_keys - 1:
                            si.append(n_keys - 1)

                        s_times = [round(float(times[i]), 6) for i in si]
                        s_values = []
                        for i in si:
                            for c in range(components):
                                idx = i * components + c
                                s_values.append(
                                    round(float(values[idx]), 6)
                                    if idx < len(values) else 0.0)
                        if s_times:
                            max_time = max(max_time, s_times[-1])
                        tracks.append({
                            "bone_index": bone_idx,
                            "property": path,
                            "times": s_times,
                            "values": s_values,
                        })

                    if tracks:
                        animations.append({
                            "name": anim_name,
                            "duration": round(max_time, 4),
                            "tracks": tracks,
                        })
                if animations:
                    result["animations"] = animations
        except Exception as e:
            logger.warning("glTF animation extraction failed: %s", e)

        return result


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
