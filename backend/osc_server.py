"""
OSC Server — receives OSC messages via UDP and relays them to WebSocket clients.

Uses python-osc for UDP reception. Integrates with the existing FastAPI WebSocket.
"""

import asyncio
import json
import logging

logger = logging.getLogger(__name__)

try:
    from pythonosc.dispatcher import Dispatcher
    from pythonosc.osc_server import AsyncIOOSCUDPServer
    HAS_OSC = True
except ImportError:
    HAS_OSC = False
    logger.info("python-osc not installed — OSC support disabled. Install with: pip install python-osc")


class OSCRelay:
    """Receives OSC messages on a UDP port and relays them to registered WebSocket callbacks."""

    def __init__(self):
        self._server = None
        self._transport = None
        self._callbacks = set()  # set of async callables
        self._running = False
        self._osc_clients = {}  # (host, port) → SimpleUDPClient

    @property
    def running(self):
        return self._running

    async def start(self, port: int = 9000, host: str = "0.0.0.0"):
        """Start the OSC UDP listener."""
        if not HAS_OSC:
            raise RuntimeError("python-osc is not installed. Run: pip install python-osc")
        if self._running:
            return

        dispatcher = Dispatcher()
        dispatcher.set_default_handler(self._handle_message)

        self._server = AsyncIOOSCUDPServer(
            (host, port), dispatcher, asyncio.get_event_loop()
        )
        self._transport, _ = await self._server.create_serve_endpoint()
        self._running = True
        logger.info("OSC server listening on %s:%d", host, port)

    async def stop(self):
        """Stop the OSC UDP listener."""
        if self._transport:
            self._transport.close()
            self._transport = None
        self._server = None
        self._running = False
        logger.info("OSC server stopped")

    def register(self, callback):
        """Register an async callback: callback(address: str, args: list)."""
        self._callbacks.add(callback)

    def unregister(self, callback):
        """Unregister a callback."""
        self._callbacks.discard(callback)

    def _handle_message(self, address, *args):
        """Called by python-osc dispatcher for every incoming message."""
        # Convert to JSON-serializable types
        safe_args = []
        for a in args:
            if isinstance(a, (int, float)):
                safe_args.append(a)
            elif isinstance(a, str):
                safe_args.append(a)
            elif isinstance(a, bytes):
                safe_args.append(list(a))
            else:
                safe_args.append(str(a))

        # Fire all registered callbacks (schedule as tasks)
        for cb in self._callbacks:
            task = asyncio.ensure_future(cb(address, safe_args))
            task.add_done_callback(self._task_done)

    @staticmethod
    def _task_done(task):
        """Log exceptions from OSC relay callbacks."""
        if task.cancelled():
            return
        exc = task.exception()
        if exc:
            logger.error("OSC relay callback error: %s", exc)


# Singleton instance
osc_relay = OSCRelay()


async def send_osc(address: str, args: list, host: str = "127.0.0.1", port: int = 8000):
    """Send an OSC message to an external application."""
    if not HAS_OSC:
        logger.warning("python-osc not installed — cannot send OSC")
        return

    from pythonosc.udp_client import SimpleUDPClient
    key = (host, port)
    client = osc_relay._osc_clients.get(key)
    if client is None:
        client = SimpleUDPClient(host, port)
        osc_relay._osc_clients[key] = client
    client.send_message(address, args)
