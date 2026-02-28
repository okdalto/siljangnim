"""
Asset Processing Pipeline — auto-preprocesses uploaded files for WebGL use.

Each processor converts raw assets (fonts, SVGs, audio, video, 3D models) into
WebGL-ready derivatives (atlases, JSON geometry, waveforms, etc.).

Missing dependencies cause individual processors to be skipped gracefully.
"""

import asyncio
import importlib
import json
import logging
from dataclasses import dataclass, field, asdict
from pathlib import Path
from typing import Callable, Awaitable

logger = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# Data classes
# ---------------------------------------------------------------------------

@dataclass
class ProcessedOutput:
    filename: str       # e.g. "atlas.png"
    description: str    # human-readable description for the agent
    mime_type: str
    size: int = 0


@dataclass
class ProcessorResult:
    source_filename: str
    processor_name: str
    status: str  # "success" | "partial" | "error"
    outputs: list[ProcessedOutput] = field(default_factory=list)
    metadata: dict = field(default_factory=dict)
    warnings: list[str] = field(default_factory=list)
    error: str | None = None


# ---------------------------------------------------------------------------
# Base processor
# ---------------------------------------------------------------------------

class BaseProcessor:
    name: str = "base"
    supported_extensions: set[str] = set()

    @classmethod
    def is_available(cls) -> bool:
        """Check if required dependencies are installed."""
        return False

    @classmethod
    def process(cls, source_path: Path, output_dir: Path, filename: str) -> ProcessorResult:
        """Process a file and write outputs to output_dir. Runs in a thread."""
        raise NotImplementedError


# ---------------------------------------------------------------------------
# Registry
# ---------------------------------------------------------------------------

_registry: list[type[BaseProcessor]] = []

_PROCESSOR_MODULES = [
    "processors.font",
    "processors.svg",
    "processors.audio",
    "processors.video",
    "processors.model3d",
]


def _auto_register():
    """Import each processor module and register available processors."""
    for module_name in _PROCESSOR_MODULES:
        try:
            mod = importlib.import_module(module_name)
            for attr_name in dir(mod):
                attr = getattr(mod, attr_name)
                if (
                    isinstance(attr, type)
                    and issubclass(attr, BaseProcessor)
                    and attr is not BaseProcessor
                ):
                    if attr.is_available():
                        _registry.append(attr)
                        logger.info("Processor registered: %s", attr.name)
                    else:
                        logger.warning(
                            "Processor %s skipped (dependencies unavailable)",
                            attr.name,
                        )
        except Exception as e:
            logger.warning("Failed to import %s: %s", module_name, e)


def get_processor(filename: str) -> type[BaseProcessor] | None:
    """Find a processor for the given filename by extension."""
    ext = Path(filename).suffix.lower()
    for proc in _registry:
        if ext in proc.supported_extensions:
            return proc
    return None


# ---------------------------------------------------------------------------
# Pipeline runner
# ---------------------------------------------------------------------------

StatusCallback = Callable[[str, str], Awaitable[None]]  # (status, detail)


async def run_pipeline(
    source_path: Path,
    output_dir: Path,
    filename: str,
    on_status: StatusCallback | None = None,
) -> ProcessorResult | None:
    """Run the processing pipeline for a single file.

    Returns ProcessorResult on success/partial, None if no processor found.
    Caches results via manifest.json.
    """
    proc = get_processor(filename)
    if proc is None:
        return None

    # Cache check
    manifest_path = output_dir / "manifest.json"
    if manifest_path.exists():
        try:
            manifest = json.loads(manifest_path.read_text())
            if manifest.get("source_size") == source_path.stat().st_size:
                logger.info("Cache hit for %s, skipping processing", filename)
                return _manifest_to_result(manifest)
        except Exception:
            pass

    if on_status:
        await on_status("processing", f"Processing {filename} with {proc.name}...")

    # Run processor in thread (CPU-bound work)
    output_dir.mkdir(parents=True, exist_ok=True)
    try:
        result = await asyncio.to_thread(proc.process, source_path, output_dir, filename)
    except Exception as e:
        logger.error("Processor %s failed for %s: %s", proc.name, filename, e)
        result = ProcessorResult(
            source_filename=filename,
            processor_name=proc.name,
            status="error",
            error=str(e),
        )

    # Update output sizes
    for out in result.outputs:
        out_path = output_dir / out.filename
        if out_path.exists():
            out.size = out_path.stat().st_size

    # Write manifest for caching
    if result.status in ("success", "partial"):
        manifest = {
            "source_filename": result.source_filename,
            "processor_name": result.processor_name,
            "status": result.status,
            "source_size": source_path.stat().st_size,
            "outputs": [asdict(o) for o in result.outputs],
            "metadata": result.metadata,
            "warnings": result.warnings,
        }
        manifest_path.write_text(json.dumps(manifest, indent=2))

    if on_status:
        status_detail = f"{proc.name}: {result.status}"
        if result.error:
            status_detail += f" — {result.error}"
        await on_status("processing_done", status_detail)

    return result


def _manifest_to_result(manifest: dict) -> ProcessorResult:
    """Reconstruct a ProcessorResult from a cached manifest."""
    return ProcessorResult(
        source_filename=manifest["source_filename"],
        processor_name=manifest["processor_name"],
        status=manifest["status"],
        outputs=[ProcessedOutput(**o) for o in manifest.get("outputs", [])],
        metadata=manifest.get("metadata", {}),
        warnings=manifest.get("warnings", []),
    )


# Auto-register on import
_auto_register()
