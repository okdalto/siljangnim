"""Host environment detection.

Recipes and catalog entries declare support per platform key
(``mac-arm64``, ``win-x64``, ...) and accelerator (``mps``, ``cuda``,
``cpu``). This module reports what the current machine offers so the agent
only sees options that can actually run here.
"""

from __future__ import annotations

import os
import platform
import shutil
import subprocess
import sys
from dataclasses import asdict, dataclass, field

_OS_KEYS = {"darwin": "mac", "windows": "win", "linux": "linux"}
_ARCH_KEYS = {
    "arm64": "arm64",
    "aarch64": "arm64",
    "x86_64": "x64",
    "amd64": "x64",
}


@dataclass
class Gpu:
    name: str
    vendor: str
    memory_mb: int | None = None
    driver: str | None = None


@dataclass
class SystemInfo:
    platform: str
    os: str
    os_version: str
    arch: str
    python: str
    cpu_count: int
    memory_mb: int | None
    accelerators: list[str]
    gpus: list[Gpu] = field(default_factory=list)

    def to_dict(self) -> dict:
        return asdict(self)


def platform_key(system: str | None = None, machine: str | None = None) -> str:
    """Return the recipe platform key, e.g. ``mac-arm64`` or ``win-x64``."""
    system = (system or platform.system()).lower()
    machine = (machine or platform.machine()).lower()
    os_key = _OS_KEYS.get(system, system)
    arch_key = _ARCH_KEYS.get(machine, machine)
    return f"{os_key}-{arch_key}"


def parse_nvidia_smi(output: str) -> list[Gpu]:
    """Parse ``nvidia-smi --query-gpu=name,memory.total,driver_version
    --format=csv,noheader,nounits`` output."""
    gpus = []
    for line in output.strip().splitlines():
        parts = [p.strip() for p in line.split(",")]
        if len(parts) < 3 or not parts[0]:
            continue
        try:
            memory = int(float(parts[1]))
        except ValueError:
            memory = None
        gpus.append(Gpu(name=parts[0], vendor="nvidia", memory_mb=memory, driver=parts[2]))
    return gpus


def _run(args: list[str], timeout: float = 5.0) -> str | None:
    try:
        result = subprocess.run(args, capture_output=True, text=True, timeout=timeout)
    except (OSError, subprocess.TimeoutExpired):
        return None
    return result.stdout if result.returncode == 0 else None


def _nvidia_gpus() -> list[Gpu]:
    exe = shutil.which("nvidia-smi")
    if not exe:
        return []
    out = _run([exe, "--query-gpu=name,memory.total,driver_version", "--format=csv,noheader,nounits"])
    return parse_nvidia_smi(out) if out else []


def _apple_gpu() -> list[Gpu]:
    brand = _run(["sysctl", "-n", "machdep.cpu.brand_string"])
    name = brand.strip() if brand else "Apple Silicon"
    # Unified memory: the GPU shares system RAM.
    return [Gpu(name=name, vendor="apple", memory_mb=_memory_mb())]


def _memory_mb() -> int | None:
    if sys.platform == "darwin":
        out = _run(["sysctl", "-n", "hw.memsize"])
        return int(out) // (1024 * 1024) if out and out.strip().isdigit() else None
    if sys.platform == "win32":
        import ctypes

        class MemoryStatus(ctypes.Structure):
            _fields_ = [
                ("dwLength", ctypes.c_ulong),
                ("dwMemoryLoad", ctypes.c_ulong),
                ("ullTotalPhys", ctypes.c_ulonglong),
                ("ullAvailPhys", ctypes.c_ulonglong),
                ("ullTotalPageFile", ctypes.c_ulonglong),
                ("ullAvailPageFile", ctypes.c_ulonglong),
                ("ullTotalVirtual", ctypes.c_ulonglong),
                ("ullAvailVirtual", ctypes.c_ulonglong),
                ("ullAvailExtendedVirtual", ctypes.c_ulonglong),
            ]

        status = MemoryStatus()
        status.dwLength = ctypes.sizeof(MemoryStatus)
        if ctypes.windll.kernel32.GlobalMemoryStatusEx(ctypes.byref(status)):
            return status.ullTotalPhys // (1024 * 1024)
        return None
    try:
        return os.sysconf("SC_PAGE_SIZE") * os.sysconf("SC_PHYS_PAGES") // (1024 * 1024)
    except (ValueError, OSError, AttributeError):
        return None


def detect() -> SystemInfo:
    key = platform_key()
    gpus: list[Gpu] = []
    accelerators: list[str] = []
    if key == "mac-arm64":
        gpus = _apple_gpu()
        accelerators.append("mps")
    else:
        gpus = _nvidia_gpus()
        if gpus:
            accelerators.append("cuda")
    accelerators.append("cpu")
    return SystemInfo(
        platform=key,
        os=platform.system(),
        os_version=platform.release(),
        arch=platform.machine(),
        python=platform.python_version(),
        cpu_count=os.cpu_count() or 1,
        memory_mb=_memory_mb(),
        accelerators=accelerators,
        gpus=gpus,
    )
