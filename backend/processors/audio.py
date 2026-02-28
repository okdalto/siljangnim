"""
Audio Processor — .mp3/.wav/.ogg/.flac → waveform JSON + spectrogram PNG.

Dependencies:
  Loading: librosa > scipy.io.wavfile+numpy > wave(stdlib, .wav only)
  Spectrogram: librosa or scipy+numpy+Pillow
"""

import json
import logging
import struct
import wave
from pathlib import Path

from processors import BaseProcessor, ProcessedOutput, ProcessorResult

logger = logging.getLogger(__name__)

# Dependency checks
try:
    import numpy as np
    _HAS_NUMPY = True
except ImportError:
    _HAS_NUMPY = False

try:
    import librosa
    _HAS_LIBROSA = True
except ImportError:
    _HAS_LIBROSA = False

try:
    from scipy.io import wavfile as scipy_wavfile
    from scipy import signal as scipy_signal
    _HAS_SCIPY = True
except ImportError:
    _HAS_SCIPY = False

try:
    from PIL import Image
    _HAS_PILLOW = True
except ImportError:
    _HAS_PILLOW = False

_WAVEFORM_SAMPLES = 4096
_SPEC_WIDTH = 1024
_SPEC_HEIGHT = 512


class AudioProcessor(BaseProcessor):
    name = "Audio Processor"
    supported_extensions = {".mp3", ".wav", ".ogg", ".flac"}

    @classmethod
    def is_available(cls) -> bool:
        # At minimum we need numpy, or we can use stdlib wave for .wav
        return _HAS_NUMPY or True  # stdlib wave always available for .wav

    @classmethod
    def process(cls, source_path: Path, output_dir: Path, filename: str) -> ProcessorResult:
        outputs = []
        warnings = []
        metadata = {}
        ext = source_path.suffix.lower()

        # Load audio data
        samples = None
        sample_rate = 44100
        channels = 1

        if _HAS_LIBROSA:
            try:
                y, sr = librosa.load(str(source_path), sr=None, mono=False)
                sample_rate = sr
                if y.ndim == 1:
                    samples = y
                    channels = 1
                else:
                    channels = y.shape[0]
                    samples = y[0]  # use first channel for waveform
                logger.info("Loaded audio with librosa: %s", filename)
            except Exception as e:
                warnings.append(f"librosa load failed: {e}")

        if samples is None and _HAS_SCIPY and ext == ".wav":
            try:
                sr, data = scipy_wavfile.read(str(source_path))
                sample_rate = sr
                if data.ndim == 1:
                    channels = 1
                    samples = data.astype(np.float32)
                else:
                    channels = data.shape[1]
                    samples = data[:, 0].astype(np.float32)
                # Normalize
                max_val = np.max(np.abs(samples))
                if max_val > 0:
                    samples = samples / max_val
                logger.info("Loaded audio with scipy: %s", filename)
            except Exception as e:
                warnings.append(f"scipy load failed: {e}")

        if samples is None and ext == ".wav":
            try:
                samples, sample_rate, channels = cls._load_wav_stdlib(source_path)
                logger.info("Loaded audio with stdlib wave: %s", filename)
            except Exception as e:
                warnings.append(f"stdlib wave load failed: {e}")

        if samples is None:
            return ProcessorResult(
                source_filename=filename,
                processor_name=cls.name,
                status="error",
                error="Could not load audio. Install librosa for full format support: pip install librosa",
            )

        duration = len(samples) / sample_rate
        metadata["sample_rate"] = sample_rate
        metadata["duration"] = round(duration, 3)
        metadata["channels"] = channels

        # 1. Waveform JSON (downsampled)
        try:
            waveform = cls._downsample_waveform(samples, _WAVEFORM_SAMPLES)
            waveform_data = {
                "sample_rate": sample_rate,
                "duration": round(duration, 3),
                "channels": channels,
                "sample_count": len(waveform),
                "samples": [round(float(s), 6) for s in waveform],
            }
            wf_path = output_dir / "waveform.json"
            wf_path.write_text(json.dumps(waveform_data))

            outputs.append(ProcessedOutput(
                "waveform.json",
                f"Waveform ({len(waveform)} samples, {round(duration, 1)}s)",
                "application/json",
            ))
        except Exception as e:
            warnings.append(f"Waveform generation failed: {e}")

        # 2. Spectrogram PNG (needs numpy + scipy/librosa + Pillow)
        if _HAS_NUMPY and _HAS_PILLOW:
            try:
                cls._generate_spectrogram(samples, sample_rate, output_dir)
                outputs.append(ProcessedOutput(
                    "spectrogram.png",
                    f"Spectrogram ({_SPEC_WIDTH}x{_SPEC_HEIGHT})",
                    "image/png",
                ))
            except Exception as e:
                warnings.append(f"Spectrogram generation failed: {e}")

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
    def _load_wav_stdlib(cls, path: Path) -> tuple:
        """Load WAV using stdlib wave module. Returns (samples_float, sample_rate, channels)."""
        with wave.open(str(path), "rb") as wf:
            n_channels = wf.getnchannels()
            sample_width = wf.getsampwidth()
            sample_rate = wf.getframerate()
            n_frames = wf.getnframes()
            raw = wf.readframes(n_frames)

        # Convert to float
        if sample_width == 2:
            fmt = f"<{n_frames * n_channels}h"
            int_data = struct.unpack(fmt, raw)
            if _HAS_NUMPY:
                samples = np.array(int_data, dtype=np.float32) / 32768.0
            else:
                samples = [s / 32768.0 for s in int_data]
        elif sample_width == 1:
            int_data = list(raw)
            if _HAS_NUMPY:
                samples = (np.array(int_data, dtype=np.float32) - 128.0) / 128.0
            else:
                samples = [(s - 128.0) / 128.0 for s in int_data]
        else:
            raise ValueError(f"Unsupported sample width: {sample_width}")

        # Take first channel only
        if n_channels > 1:
            if _HAS_NUMPY:
                samples = samples[::n_channels]
            else:
                samples = samples[::n_channels]

        return samples, sample_rate, n_channels

    @classmethod
    def _downsample_waveform(cls, samples, target_count: int) -> list:
        """Downsample by peak-picking in bins."""
        n = len(samples) if not _HAS_NUMPY else samples.shape[0] if hasattr(samples, 'shape') else len(samples)
        if n <= target_count:
            if _HAS_NUMPY and hasattr(samples, 'tolist'):
                return samples.tolist()
            return list(samples)

        bin_size = n / target_count
        result = []
        for i in range(target_count):
            start = int(i * bin_size)
            end = int((i + 1) * bin_size)
            if _HAS_NUMPY and hasattr(samples, '__getitem__'):
                chunk = samples[start:end]
                # Use max absolute value (preserves sign for visualization)
                idx = np.argmax(np.abs(chunk))
                result.append(float(chunk[idx]))
            else:
                chunk = samples[start:end]
                if chunk:
                    max_val = max(chunk, key=abs)
                    result.append(float(max_val))
                else:
                    result.append(0.0)
        return result

    @classmethod
    def _generate_spectrogram(cls, samples, sample_rate: int, output_dir: Path):
        """Generate spectrogram as PNG image."""
        import numpy as np

        if _HAS_LIBROSA:
            S = librosa.feature.melspectrogram(
                y=np.array(samples, dtype=np.float32),
                sr=sample_rate,
                n_mels=_SPEC_HEIGHT,
                n_fft=2048,
                hop_length=512,
            )
            S_db = librosa.power_to_db(S, ref=np.max)
            # Normalize to 0-255
            S_norm = ((S_db - S_db.min()) / (S_db.max() - S_db.min() + 1e-8) * 255).astype(np.uint8)
        elif _HAS_SCIPY:
            f, t, Sxx = scipy_signal.spectrogram(
                np.array(samples, dtype=np.float32),
                fs=sample_rate,
                nperseg=1024,
                noverlap=512,
            )
            # Log scale
            Sxx_log = np.log1p(Sxx)
            max_val = Sxx_log.max()
            if max_val > 0:
                S_norm = (Sxx_log / max_val * 255).astype(np.uint8)
            else:
                S_norm = np.zeros_like(Sxx_log, dtype=np.uint8)
        else:
            raise RuntimeError("Need librosa or scipy for spectrogram")

        # Resize to target dimensions
        from PIL import Image
        img = Image.fromarray(np.flipud(S_norm), mode="L")
        img = img.resize((_SPEC_WIDTH, _SPEC_HEIGHT), Image.LANCZOS)

        # Apply colormap (viridis-like)
        colored = _apply_colormap(np.array(img))
        result = Image.fromarray(colored, mode="RGB")
        result.save(str(output_dir / "spectrogram.png"), "PNG")


def _apply_colormap(gray: "np.ndarray") -> "np.ndarray":
    """Apply a viridis-like colormap to a grayscale array."""
    import numpy as np
    # Simple viridis approximation: dark purple → blue → green → yellow
    r = np.clip(np.where(gray < 128, gray * 0.3, 50 + (gray - 128) * 1.6), 0, 255).astype(np.uint8)
    g = np.clip(np.where(gray < 128, gray * 0.8, 100 + (gray - 128) * 1.2), 0, 255).astype(np.uint8)
    b = np.clip(np.where(gray < 85, 50 + gray * 2.0, np.where(gray < 170, 220 - (gray - 85) * 1.5, 90 - (gray - 170) * 1.0)), 0, 255).astype(np.uint8)
    return np.stack([r, g, b], axis=-1)
