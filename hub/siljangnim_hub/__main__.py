"""Entry point: ``python -m siljangnim_hub --port <port>``.

The token is read from the SILJANGNIM_HUB_TOKEN environment variable so it
never shows up in process listings.
"""

from __future__ import annotations

import argparse
import os
import sys

import uvicorn

from .app import create_app


def main() -> int:
    parser = argparse.ArgumentParser(prog="siljangnim_hub")
    parser.add_argument("--port", type=int, required=True)
    args = parser.parse_args()

    token = os.environ.get("SILJANGNIM_HUB_TOKEN", "")
    if not token:
        print("SILJANGNIM_HUB_TOKEN is not set", file=sys.stderr)
        return 2

    app = create_app(token=token, port=args.port)
    uvicorn.run(app, host="127.0.0.1", port=args.port, log_level="info")
    return 0


if __name__ == "__main__":
    sys.exit(main())
