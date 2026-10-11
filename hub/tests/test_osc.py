import asyncio
import socket
import struct

import pytest

from siljangnim_hub.osc import OscError, OscListener, message, parse


def test_parses_typed_arguments():
    data = message("/fader/1", 0.5, 3, "go", True)
    [(address, args)] = parse(data)
    assert address == "/fader/1"
    assert args[0] == pytest.approx(0.5)
    assert args[1:] == [3, "go", True]


def test_flattens_bundles():
    first, second = message("/a", 1), message("/b", 2.0)
    bundle = b"#bundle\0" + b"\0" * 7 + b"\1" + struct.pack(">i", len(first)) + first + struct.pack(">i", len(second)) + second
    assert [a for a, _ in parse(bundle)] == ["/a", "/b"]


def test_rejects_garbage():
    with pytest.raises(OscError):
        parse(b"hello\0\0\0")
    with pytest.raises(OscError):
        parse(message("/x", 1)[:-2])


def free_udp_port() -> int:
    with socket.socket(socket.AF_INET, socket.SOCK_DGRAM) as s:
        s.bind(("127.0.0.1", 0))
        return s.getsockname()[1]


def test_listener_delivers_to_subscribers():
    async def scenario():
        osc = OscListener(host="127.0.0.1")
        port = free_udp_port()
        status = await osc.listen(port)
        assert status["listening"] and status["port"] == port
        queue = osc.subscribe()
        with socket.socket(socket.AF_INET, socket.SOCK_DGRAM) as s:
            s.sendto(message("/x", 1.0), ("127.0.0.1", port))
            s.sendto(b"not osc", ("127.0.0.1", port))
            s.sendto(message("/y", "hi"), ("127.0.0.1", port))
        batch = []
        while len(batch) < 2:
            got = await osc.batch(queue, 2)
            assert got, "no OSC arrived"
            batch += got
        assert batch == [("/x", [1.0]), ("/y", ["hi"])]
        assert osc.status()["dropped"] == 1
        # A port in use is reported, not raised.
        other = OscListener(host="127.0.0.1")
        assert (await other.listen(port))["error"]
        osc.close()
        assert not osc.status()["listening"]

    asyncio.run(scenario())
