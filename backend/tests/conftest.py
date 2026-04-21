"""Pytest bootstrap: ensure the lightweight gateway package is importable.

We intentionally only add ``backend/src`` so that ``import main`` resolves to
``backend/src/main.py`` (the lightweight gateway app), not the heavy legacy
``backend/main.py`` which pulls in optional ML dependencies.
"""
from __future__ import annotations

import sys
from pathlib import Path

_HERE = Path(__file__).resolve()
_BACKEND_DIR = _HERE.parent.parent
_SRC_DIR = _BACKEND_DIR / "src"

# Remove the legacy backend dir if some other conftest / tool put it on sys.path
_legacy = str(_BACKEND_DIR)
while _legacy in sys.path:
    sys.path.remove(_legacy)

_src = str(_SRC_DIR)
if _src not in sys.path:
    sys.path.insert(0, _src)
