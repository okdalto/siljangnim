"""
Video Processor — .mp4/.webm/.mov → keyframe PNGs + metadata JSON.

Dependencies:
  Required: ffmpeg + ffprobe (system binaries)
"""

import asyncio
import json
import logging
import shutil
import subprocess
from pathlib import Path

from processors import BaseProcessor, ProcessedOutput, ProcessorResult

logger = logging.getLogger(__name__)

_HAS_FFMPEG = shutil.which("ffmpeg") is not None
_HAS_FFPROBE = shutil.which("ffprobe") is not None

_MAX_FRAMES = 30
_MAX_DIMENSION = 512


class VideoProcessor(BaseProcessor):
    name = "Video Processor"
    supported_extensions = {".mp4", ".webm", ".mov"}

    @classmethod
    def is_available(cls) -> bool:
        return _HAS_FFMPEG and _HAS_FFPROBE

    @classmethod
    def process(cls, source_path: Path, output_dir: Path, filename: str) -> ProcessorResult:
        outputs = []
        warnings = []
        metadata = {}

        # 1. Get video metadata via ffprobe
        try:
            probe_cmd = [
                "ffprobe", "-v", "quiet",
                "-print_format", "json",
                "-show_format", "-show_streams",
                str(source_path),
            ]
            probe_result = subprocess.run(
                probe_cmd, capture_output=True, text=True, timeout=15,
            )
            if probe_result.returncode != 0:
                return ProcessorResult(
                    source_filename=filename,
                    processor_name=cls.name,
                    status="error",
                    error=f"ffprobe failed: {probe_result.stderr}",
                )

            probe_data = json.loads(probe_result.stdout)
        except subprocess.TimeoutExpired:
            return ProcessorResult(
                source_filename=filename,
                processor_name=cls.name,
                status="error",
                error="ffprobe timed out",
            )
        except json.JSONDecodeError as e:
            return ProcessorResult(
                source_filename=filename,
                processor_name=cls.name,
                status="error",
                error=f"ffprobe output parse error: {e}",
            )

        # Extract video stream info
        video_stream = None
        for stream in probe_data.get("streams", []):
            if stream.get("codec_type") == "video":
                video_stream = stream
                break

        if not video_stream:
            return ProcessorResult(
                source_filename=filename,
                processor_name=cls.name,
                status="error",
                error="No video stream found",
            )

        width = int(video_stream.get("width", 0))
        height = int(video_stream.get("height", 0))
        duration = float(probe_data.get("format", {}).get("duration", 0))

        # Parse FPS
        fps_str = video_stream.get("r_frame_rate", "30/1")
        try:
            num, den = fps_str.split("/")
            fps = float(num) / float(den)
        except (ValueError, ZeroDivisionError):
            fps = 30.0

        metadata["duration"] = round(duration, 3)
        metadata["fps"] = round(fps, 2)
        metadata["width"] = width
        metadata["height"] = height

        # 2. Extract keyframes
        if duration <= 0:
            warnings.append("Duration is 0 — skipping frame extraction")
        else:
            try:
                frame_count = min(_MAX_FRAMES, max(1, int(duration * 2)))  # ~2 fps sample
                frame_count = min(frame_count, _MAX_FRAMES)

                # Calculate scale filter
                if width > height:
                    scale = f"scale={_MAX_DIMENSION}:-2"
                else:
                    scale = f"scale=-2:{_MAX_DIMENSION}"

                # Use fps filter for uniform sampling
                target_fps = frame_count / duration
                frame_pattern = str(output_dir / "frame_%03d.png")

                ffmpeg_cmd = [
                    "ffmpeg", "-y",
                    "-i", str(source_path),
                    "-vf", f"fps={target_fps},{scale}",
                    "-frames:v", str(frame_count),
                    "-q:v", "2",
                    frame_pattern,
                ]

                ff_result = subprocess.run(
                    ffmpeg_cmd, capture_output=True, text=True, timeout=60,
                )

                if ff_result.returncode != 0:
                    warnings.append(f"ffmpeg frame extraction warning: {ff_result.stderr[:200]}")

                # Collect extracted frames
                frames_meta = []
                for i in range(frame_count):
                    frame_file = output_dir / f"frame_{i + 1:03d}.png"
                    # ffmpeg numbers from 1
                    if frame_file.exists():
                        # Rename to 0-indexed
                        new_name = f"frame_{i:03d}.png"
                        new_path = output_dir / new_name
                        frame_file.rename(new_path)

                        timestamp = (i / frame_count) * duration
                        frames_meta.append({
                            "index": i,
                            "timestamp": round(timestamp, 3),
                            "filename": new_name,
                        })
                        outputs.append(ProcessedOutput(
                            new_name,
                            f"Frame at {round(timestamp, 1)}s",
                            "image/png",
                        ))

                metadata["frame_count"] = len(frames_meta)

                # Write video metadata
                video_meta = {
                    "duration": round(duration, 3),
                    "fps": round(fps, 2),
                    "width": width,
                    "height": height,
                    "frames": frames_meta,
                }
                meta_path = output_dir / "video_metadata.json"
                meta_path.write_text(json.dumps(video_meta, indent=2))
                outputs.append(ProcessedOutput(
                    "video_metadata.json",
                    f"Video metadata ({len(frames_meta)} frames, {round(duration, 1)}s)",
                    "application/json",
                ))

            except subprocess.TimeoutExpired:
                warnings.append("ffmpeg frame extraction timed out")
            except Exception as e:
                warnings.append(f"Frame extraction failed: {e}")

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
