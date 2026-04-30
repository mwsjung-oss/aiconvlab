#!/usr/bin/env python3
"""heartbeat 1-shot (디버그)."""

from __future__ import annotations

import socket

from backend_client import post_heartbeat
from config import load_runtime


def main() -> None:
    st = load_runtime()
    r = post_heartbeat(st.secrets, hostname=socket.gethostname(), gpu_name=None)
    print(r)


if __name__ == "__main__":
    main()
