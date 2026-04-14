"""
사용자별 Jupyter Lab 세션 (Colab 유사: 브라우저에서 셀 실행, 개인 노트북 루트).

- 환경 변수 NOTEBOOK_ENABLED=1 일 때만 기동 (기본 0: 의존성 미설치 환경 호환).
- 사용자마다 프로세스·포트·토큰을 유지 (루트 디렉터리는 워크스페이스 data/notebooks).
- 단일 워커(uvicorn) 전제 — 여러 워커에서는 세션 공유가 되지 않습니다.
"""
from __future__ import annotations

import logging
import os
import secrets
import socket
import subprocess
import sys
import tempfile
import threading
import time
from pathlib import Path
from typing import Any

from models import User
from user_workspace import ensure_workspace_dirs, workspace_for_user

logger = logging.getLogger(__name__)

_sessions: dict[int, dict[str, Any]] = {}
_session_lock = threading.Lock()


def _env_flag(name: str, default: bool = False) -> bool:
    v = (os.getenv(name) or "").strip().lower()
    if not v:
        return default
    return v in ("1", "true", "yes", "on")


def is_notebook_feature_enabled() -> bool:
    return _env_flag("NOTEBOOK_ENABLED", False)


def _jupyter_cmd() -> list[str]:
    return [sys.executable, "-m", "jupyter", "lab"]


def jupyter_runtime_available() -> bool:
    try:
        import jupyterlab  # noqa: F401

        return True
    except ImportError:
        return False


def _find_free_port() -> int:
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
        s.bind(("127.0.0.1", 0))
        return int(s.getsockname()[1])


def _wait_listen(port: int, timeout_sec: float = 45.0) -> bool:
    deadline = time.time() + timeout_sec
    while time.time() < deadline:
        try:
            with socket.create_connection(("127.0.0.1", port), timeout=0.5):
                return True
        except OSError:
            time.sleep(0.2)
    return False


def _notebook_root(user: User) -> Path:
    ws = workspace_for_user(user)
    ensure_workspace_dirs(ws)
    root = ws.data / "notebooks"
    root.mkdir(parents=True, exist_ok=True)
    return root.resolve()


def _seed_welcome(root: Path) -> None:
    welcome = root / "Welcome_to_AILab.ipynb"
    if welcome.is_file():
        return
    raw = """{
 "cells": [
  {
   "cell_type": "markdown",
   "metadata": {},
   "source": [
    "# AILab 노트북\\n",
    "\\n",
    "이 폴더는 **플랫폼과 동일한 워크스페이스**의 `data/notebooks` 입니다.\\n",
    "\\n",
    "- 업로드한 CSV는 상위 `data` 폴더에서 읽을 수 있습니다.\\n",
    "- `pandas`, `numpy`, `sklearn`, `matplotlib`, `torch`(설치된 경우) 등을 사용할 수 있습니다.\\n"
   ]
  },
  {
   "cell_type": "code",
   "execution_count": null,
   "metadata": {},
   "outputs": [],
   "source": [
    "import sys\\n",
    "import pandas as pd\\n",
    "print(sys.executable)\\n",
    "print(pd.__version__)"
   ]
  }
 ],
 "metadata": {
  "kernelspec": {
   "display_name": "Python 3",
   "language": "python",
   "name": "python3"
  },
  "language_info": {
   "name": "python"
  }
 },
 "nbformat": 4,
 "nbformat_minor": 5
}
"""
    try:
        welcome.write_text(raw, encoding="utf-8")
    except OSError:
        logger.exception("Welcome notebook seed failed")


def _advertise_host() -> str:
    return (os.getenv("NOTEBOOK_ADVERTISE_HOST") or "127.0.0.1").strip() or "127.0.0.1"


def _bind_ip() -> str:
    return (os.getenv("NOTEBOOK_BIND") or "127.0.0.1").strip() or "127.0.0.1"


def _max_sessions() -> int:
    try:
        return max(1, int(os.getenv("NOTEBOOK_MAX_SESSIONS") or "8"))
    except ValueError:
        return 8


def _build_lab_url(host: str, port: int, token: str) -> str:
    base = f"http://{host}:{port}/lab"
    return f"{base}?token={token}"


def get_or_start_session(user: User) -> dict[str, Any]:
    """로그인 사용자용 Jupyter Lab URL·토큰. 실패 시 reason 포함 dict."""
    with _session_lock:
        return _get_or_start_session_locked(user)


def _get_or_start_session_locked(user: User) -> dict[str, Any]:
    if not is_notebook_feature_enabled():
        return {
            "ok": False,
            "enabled": False,
            "reason": "노트북 기능이 비활성화되어 있습니다. 서버에 NOTEBOOK_ENABLED=1 과 jupyterlab 설치가 필요합니다.",
        }

    if not jupyter_runtime_available():
        return {
            "ok": False,
            "enabled": True,
            "reason": "jupyterlab 패키지가 설치되어 있지 않습니다. pip install jupyterlab",
        }

    uid = int(user.id)
    if uid in _sessions:
        info = _sessions[uid]
        proc = info.get("proc")
        if proc is not None and proc.poll() is None:
            return {
                "ok": True,
                "enabled": True,
                "lab_url": info["lab_url"],
                "token": info["token"],
                "port": info["port"],
                "root": str(info["root"]),
            }
        _sessions.pop(uid, None)

    if len(_sessions) >= _max_sessions():
        return {
            "ok": False,
            "enabled": True,
            "reason": f"동시에 사용 가능한 노트북 세션 상한({ _max_sessions() })에 도달했습니다. 잠시 후 다시 시도하세요.",
        }

    root = _notebook_root(user)
    _seed_welcome(root)
    port = _find_free_port()
    token = secrets.token_urlsafe(32)
    bind = _bind_ip()
    host = _advertise_host()

    cfg_dir = Path(tempfile.mkdtemp(prefix="ailab_jupyter_"))
    cfg_file = cfg_dir / "jupyter_server_config.py"
    cfg_file.write_text(
        """# AILab — iframe 내장용 (교육 환경)\n"""
        """c.ServerApp.tornado_settings = {\n"""
        """    "headers": {\n"""
        """        "Content-Security-Policy": "frame-ancestors *",\n"""
        """    },\n"""
        """}\n""",
        encoding="utf-8",
    )
    env = os.environ.copy()
    env["JUPYTER_CONFIG_DIR"] = str(cfg_dir)

    # iframe·원격 접속: allow_origin, xsrf 완화 (교육용 단일 테넌시)
    cmd = _jupyter_cmd() + [
        "--no-browser",
        f"--port={port}",
        f"--ServerApp.ip={bind}",
        f"--ServerApp.token={token}",
        f"--ServerApp.root_dir={root}",
        "--ServerApp.allow_origin=*",
        "--ServerApp.allow_remote_access=True",
        "--ServerApp.disable_check_xsrf=True",
    ]

    creation = 0
    if sys.platform == "win32":
        creation = subprocess.CREATE_NO_WINDOW  # type: ignore[attr-defined]

    try:
        proc = subprocess.Popen(
            cmd,
            cwd=str(root),
            env=env,
            stdout=subprocess.DEVNULL,
            stderr=subprocess.PIPE,
            creationflags=creation,
        )
    except FileNotFoundError:
        return {
            "ok": False,
            "enabled": True,
            "reason": "Jupyter 실행 파일을 찾을 수 없습니다.",
        }
    except Exception as e:
        logger.exception("Jupyter start failed")
        return {"ok": False, "enabled": True, "reason": str(e)}

    if not _wait_listen(port):
        err = ""
        if proc.stderr:
            try:
                err = (proc.stderr.read(4000) or b"").decode("utf-8", errors="replace")
            except Exception:
                err = ""
        try:
            proc.terminate()
        except Exception:
            pass
        logger.error("Jupyter did not open port %s: %s", port, err)
        return {
            "ok": False,
            "enabled": True,
            "reason": f"Jupyter가 포트 {port} 에서 응답하지 않습니다. {err[:500]}",
        }

    lab_url = _build_lab_url(host, port, token)
    _sessions[uid] = {
        "proc": proc,
        "port": port,
        "token": token,
        "lab_url": lab_url,
        "root": root,
        "config_dir": cfg_dir,
    }
    logger.info("Jupyter Lab for user %s on port %s root %s", uid, port, root)

    return {
        "ok": True,
        "enabled": True,
        "lab_url": lab_url,
        "token": token,
        "port": port,
        "root": str(root),
    }


def shutdown_session_for_user(user_id: int) -> bool:
    """해당 사용자 Jupyter 프로세스만 종료. 이미 없으면 False."""
    with _session_lock:
        uid = int(user_id)
        if uid not in _sessions:
            return False
        info = _sessions.pop(uid, None)
        if not info:
            return False
        proc = info.get("proc")
        if proc is None:
            return False
        if proc.poll() is not None:
            return False
    try:
        proc.terminate()
        proc.wait(timeout=8)
    except Exception:
        try:
            proc.kill()
        except Exception:
            pass
    logger.info("Jupyter Lab stopped for user %s", uid)
    return True


def shutdown_all_notebooks() -> None:
    with _session_lock:
        uids = list(_sessions.keys())
    for uid in uids:
        shutdown_session_for_user(uid)
