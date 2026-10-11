"""OSC input: a UDP listener whose messages reach the scene as ctx.osc.

Controllers (TouchOSC, Max, TouchDesigner, a phone on the same network) send
OSC over UDP. Browsers can't receive UDP, so the hub listens and streams what
arrives to the studio (GET /osc/stream), which hands it to the scene iframe.
The listener only opens when a scene asks for OSC (inputs: ["osc"]).

Only the parts of OSC 1.0/1.1 controllers send: messages and bundles with
i f s b h d t T F N I arguments. Bundle time tags are ignored (applied now).
"""

from __future__ import annotations

import asyncio
import struct
from typing import Any

DEFAULT_PORT = 9000
# One stream batch at most this big; a flood of messages keeps the latest.
MAX_BATCH = 512
QUEUE_SIZE = 2048


class OscError(ValueError):
    pass


def _string(data: bytes, pos: int) -> tuple[str, int]:
    end = data.find(b"\0", pos)
    if end < 0:
        raise OscError("unterminated string")
    text = data[pos:end].decode("utf-8", "replace")
    return text, (end + 4) & ~3


def _blob(data: bytes, pos: int) -> tuple[bytes, int]:
    (size,) = struct.unpack_from(">i", data, pos)
    pos += 4
    if size < 0 or pos + size > len(data):
        raise OscError("blob out of range")
    return data[pos : pos + size], (pos + size + 3) & ~3


def parse(data: bytes, depth: int = 0) -> list[tuple[str, list[Any]]]:
    """A datagram → [(address, args)]; bundles are flattened in order."""
    if depth > 8:
        raise OscError("bundles nested too deep")
    if data.startswith(b"#bundle\0"):
        pos, messages = 16, []  # "#bundle\0" + 8-byte time tag
        while pos + 4 <= len(data):
            (size,) = struct.unpack_from(">i", data, pos)
            pos += 4
            if size <= 0 or pos + size > len(data):
                raise OscError("bundle element out of range")
            messages.extend(parse(data[pos : pos + size], depth + 1))
            pos += size
        return messages
    address, pos = _string(data, 0)
    if not address.startswith("/"):
        raise OscError("address must start with /")
    if pos >= len(data):
        return [(address, [])]  # no type tag string (old senders)
    tags, pos = _string(data, pos)
    if not tags.startswith(","):
        raise OscError("type tags must start with ,")
    args: list[Any] = []
    try:
        for tag in tags[1:]:
            if tag == "i":
                args.append(struct.unpack_from(">i", data, pos)[0])
                pos += 4
            elif tag == "f":
                args.append(struct.unpack_from(">f", data, pos)[0])
                pos += 4
            elif tag in "hd":
                args.append(struct.unpack_from(">q" if tag == "h" else ">d", data, pos)[0])
                pos += 8
            elif tag == "t":
                pos += 8
                args.append(None)
            elif tag == "s" or tag == "S":
                value, pos = _string(data, pos)
                args.append(value)
            elif tag == "b":
                value, pos = _blob(data, pos)
                args.append(len(value))  # the size; scenes have no use for raw bytes
            elif tag in "TF":
                args.append(tag == "T")
            elif tag in "NI":
                args.append(None)
            elif tag in "[]":
                continue  # arrays are flattened
            else:
                raise OscError(f"unsupported type tag {tag!r}")
    except struct.error as err:
        raise OscError("message is shorter than its type tags") from err
    return [(address, args)]


def message(address: str, *args: Any) -> bytes:
    """Encode a message (int, float, str, bool); used by tests and the smoke test."""

    def pad(b: bytes) -> bytes:
        return b + b"\0" * (4 - len(b) % 4)

    tags, payload = ",", b""
    for arg in args:
        if isinstance(arg, bool):
            tags += "T" if arg else "F"
        elif isinstance(arg, int):
            tags, payload = tags + "i", payload + struct.pack(">i", arg)
        elif isinstance(arg, float):
            tags, payload = tags + "f", payload + struct.pack(">f", arg)
        else:
            tags, payload = tags + "s", payload + pad(str(arg).encode())
    return pad(address.encode()) + pad(tags.encode()) + payload


class _Protocol(asyncio.DatagramProtocol):
    def __init__(self, owner: "OscListener"):
        self.owner = owner

    def datagram_received(self, data: bytes, addr) -> None:
        try:
            messages = parse(data)
        except (OscError, UnicodeError):
            self.owner.dropped += 1
            return
        self.owner.publish(messages)


class OscListener:
    def __init__(self, host: str = "0.0.0.0"):
        # 0.0.0.0 so controllers on the network (a phone, another machine) reach it.
        self.host = host
        self.port: int | None = None
        self.error: str | None = None
        self.received = 0
        self.dropped = 0
        self._transport: asyncio.DatagramTransport | None = None
        self._subscribers: set[asyncio.Queue] = set()

    def status(self) -> dict:
        return {"listening": self._transport is not None, "port": self.port, "host": self.host, "error": self.error, "received": self.received, "dropped": self.dropped}

    async def listen(self, port: int) -> dict:
        if not 1024 <= port <= 65535:
            self.error = "port must be between 1024 and 65535"
            return self.status()
        if self._transport and self.port == port:
            return self.status()
        self.close()
        try:
            loop = asyncio.get_running_loop()
            self._transport, _ = await loop.create_datagram_endpoint(lambda: _Protocol(self), local_addr=(self.host, port))
            self.port, self.error = port, None
        except OSError as err:
            self.port, self.error = port, f"can't listen on UDP {port}: {err.strerror or err}"
        return self.status()

    def close(self) -> None:
        if self._transport:
            self._transport.close()
        self._transport = None

    def publish(self, messages: list[tuple[str, list[Any]]]) -> None:
        self.received += len(messages)
        for queue in self._subscribers:
            for item in messages:
                if queue.full():
                    queue.get_nowait()  # keep the newest
                queue.put_nowait(item)

    def subscribe(self) -> asyncio.Queue:
        queue: asyncio.Queue = asyncio.Queue(QUEUE_SIZE)
        self._subscribers.add(queue)
        return queue

    def unsubscribe(self, queue: asyncio.Queue) -> None:
        self._subscribers.discard(queue)

    @staticmethod
    async def batch(queue: asyncio.Queue, timeout: float) -> list[tuple[str, list[Any]]]:
        """Waits for one message (up to timeout), then takes whatever else is queued."""
        try:
            first = await asyncio.wait_for(queue.get(), timeout)
        except asyncio.TimeoutError:
            return []
        items = [first]
        while not queue.empty() and len(items) < MAX_BATCH:
            items.append(queue.get_nowait())
        return items
