"""Upload processing helpers for siljangnim.

Extracted from main.py to break the circular import between main.py and ws_handlers.py.
"""

import base64
import logging
import re

import workspace

logger = logging.getLogger(__name__)

def _sanitize_filename(name: str) -> str:
    """Sanitize a filename — keep alphanumeric, dots, hyphens, underscores."""
    name = name.strip().replace(" ", "_")
    name = re.sub(r"[^\w.\-]", "", name)
    return name or "unnamed"


def _process_uploads(raw_files: list[dict]) -> list[dict]:
    """Decode base64 file data, save to uploads dir, return saved file info."""
    saved = []
    for f in raw_files:
        name = _sanitize_filename(f.get("name", "unnamed"))
        mime = f.get("mime_type", "application/octet-stream")
        data_b64 = f.get("data_b64", "")
        size = f.get("size", 0)

        raw_bytes = base64.b64decode(data_b64)
        workspace.save_upload(name, raw_bytes)
        saved.append({
            "name": name,
            "mime_type": mime,
            "size": len(raw_bytes),
        })
    return saved


async def _process_uploaded_files(saved_files: list[dict], broadcast):
    """Run asset processing pipeline for uploaded files before agent starts."""
    from processors import run_pipeline

    for f in saved_files:
        source_path = workspace._safe_upload_path(f["name"])
        output_dir = workspace.get_processed_dir(f["name"])
        logger.info("[AssetPipeline] Processing %s → %s", f["name"], output_dir)

        async def on_status(status: str, detail: str, _fname=f["name"]):
            await broadcast({
                "type": "processing_status",
                "filename": _fname,
                "status": status,
                "detail": detail,
            })

        try:
            result = await run_pipeline(source_path, output_dir, f["name"], on_status)
            if result:
                logger.info("[AssetPipeline] %s → %s (outputs: %s, warnings: %s)",
                            f["name"], result.status,
                            [o.filename for o in result.outputs], result.warnings)
            else:
                logger.info("[AssetPipeline] %s → no matching processor", f["name"])
        except Exception as e:
            import traceback
            logger.error("[AssetPipeline] %s failed: %s", f["name"], e)
            traceback.print_exc()
            continue

        if result and result.status in ("success", "partial"):
            stem = workspace.get_processed_dir(f["name"]).name
            await broadcast({
                "type": "processing_complete",
                "filename": f["name"],
                "processor": result.processor_name,
                "outputs": [
                    {
                        "filename": o.filename,
                        "description": o.description,
                        "url": f"/api/uploads/processed/{stem}/{o.filename}",
                    }
                    for o in result.outputs
                ],
                "metadata": result.metadata,
            })
