"""
Experiment V3 · 세션 보존 Python 커널 매니저
------------------------------------------------------------
사용자별로 하나의 ipykernel 프로세스를 유지하고, 코드 실행 요청을 그
커널에 전달해 Colab-like UX 를 제공한다.

설계 요점
  - jupyter_client.KernelManager 를 그대로 쓰되, 스레드-안전한 얇은
    래퍼로 감싼다.
  - execute() 는 동기 호출로 최대 DEFAULT_TIMEOUT 초 기다리고, 그 동안
    iopub 채널에서 쏟아지는 stream / display_data / execute_result /
    error 메시지를 수집해 리스트로 반환한다.
  - 유휴 IDLE_TIMEOUT_SEC 이상인 커널은 별도 threading.Timer 가 종료.
  - 프로세스 내 싱글턴 registry 가 사용자 → UserKernel 매핑을 유지.

※ 이 모듈은 jupyter_client 가 설치돼 있지 않은 환경에서도 import 는
   성공해야 한다 (api 라우터가 선택적으로 마운트되기 때문). 실제 실행
   시점에 ImportError 를 raise.
"""
from __future__ import annotations

import logging
import queue
import threading
import time
from dataclasses import dataclass, field
from typing import Any, Dict, List, Optional

_LOG = logging.getLogger("kernel_manager")

DEFAULT_TIMEOUT = 60  # seconds (하드 타임아웃)
IDLE_TIMEOUT_SEC = 30 * 60  # 유휴 30분 이후 자동 종료
MAX_CONCURRENT_KERNELS = 8  # 서버 보호 — 이보다 많으면 429
STARTUP_CODE = (
    "import pandas as pd\n"
    "import numpy as np\n"
    "import matplotlib\n"
    "matplotlib.use('Agg')  # headless\n"
    "import matplotlib.pyplot as plt\n"
    "plt.rcParams.update({'figure.dpi': 110, 'figure.figsize': (6,4)})\n"
)


class KernelDependencyError(RuntimeError):
    """jupyter_client / ipykernel 미설치 등 환경 문제."""


class KernelQuotaError(RuntimeError):
    """동시 커널 제한 초과."""


class KernelTimeoutError(RuntimeError):
    """실행이 DEFAULT_TIMEOUT 을 초과."""


def _ensure_deps():
    try:
        import jupyter_client  # noqa: F401
    except Exception as exc:  # pragma: no cover - 환경 의존
        raise KernelDependencyError(
            "jupyter_client / ipykernel 이 필요합니다. requirements.txt 를 확인하세요."
        ) from exc


@dataclass
class ExecutionResult:
    outputs: List[Dict[str, Any]] = field(default_factory=list)
    status: str = "ok"  # ok | error | timeout
    execution_count: Optional[int] = None
    error: Optional[str] = None


class UserKernel:
    """단일 사용자의 Python 커널 래퍼.

    주의: jupyter_client 는 비동기 queue 기반이다. 같은 client 에 대해
    동시에 execute 를 호출하지 않도록 내부 Lock 으로 직렬화한다.
    """

    def __init__(self, user_id: str):
        _ensure_deps()
        from jupyter_client import KernelManager  # type: ignore

        self.user_id = user_id
        self.km = KernelManager(kernel_name="python3")
        self.km.start_kernel()
        self.client = self.km.client()
        self.client.start_channels()
        self.client.wait_for_ready(timeout=30)
        self._lock = threading.Lock()
        self.last_used = time.time()
        self.execution_count = 0

        # 자주 쓰는 라이브러리 import (best-effort)
        try:
            self._execute_internal(STARTUP_CODE, timeout=20)
        except Exception as exc:  # pragma: no cover
            _LOG.warning("kernel[%s] startup import failed: %s", user_id, exc)

    # ------------------------------------------------------------------
    # core execute
    # ------------------------------------------------------------------
    def execute(
        self, code: str, *, timeout: int = DEFAULT_TIMEOUT
    ) -> ExecutionResult:
        with self._lock:
            self.last_used = time.time()
            return self._execute_internal(code, timeout=timeout)

    def _execute_internal(
        self, code: str, *, timeout: int
    ) -> ExecutionResult:
        msg_id = self.client.execute(code, store_history=True, allow_stdin=False)
        result = ExecutionResult()
        deadline = time.time() + max(1, int(timeout))

        while True:
            remaining = deadline - time.time()
            if remaining <= 0:
                result.status = "timeout"
                result.error = f"execution exceeded {timeout}s"
                try:
                    self.km.interrupt_kernel()
                except Exception:  # pragma: no cover
                    pass
                break
            try:
                msg = self.client.get_iopub_msg(timeout=min(1.0, remaining))
            except queue.Empty:
                continue
            except Exception as exc:  # pragma: no cover
                result.status = "error"
                result.error = f"iopub read error: {exc}"
                break
            parent = msg.get("parent_header", {}) or {}
            if parent.get("msg_id") != msg_id:
                continue
            mtype = msg.get("msg_type")
            content = msg.get("content") or {}
            if mtype == "status":
                if content.get("execution_state") == "idle":
                    # 이 msg_id 에 대한 실행 완료
                    break
            elif mtype == "stream":
                result.outputs.append(
                    {
                        "type": "stream",
                        "name": content.get("name", "stdout"),
                        "data": content.get("text", ""),
                    }
                )
            elif mtype in ("execute_result", "display_data"):
                data = content.get("data", {})
                if "image/png" in data:
                    result.outputs.append(
                        {"type": "image_png", "data": data["image/png"]}
                    )
                elif "text/html" in data:
                    result.outputs.append(
                        {"type": "html", "data": data["text/html"]}
                    )
                if "text/plain" in data:
                    # image/html 과 함께 와도 fallback 텍스트 보존
                    result.outputs.append(
                        {"type": "text", "data": data["text/plain"]}
                    )
                ec = content.get("execution_count")
                if isinstance(ec, int):
                    result.execution_count = ec
            elif mtype == "error":
                tb = "\n".join(content.get("traceback") or [])
                result.outputs.append({"type": "error", "data": tb})
                result.status = "error"
                result.error = f"{content.get('ename','')}: {content.get('evalue','')}"

        if result.execution_count is not None:
            self.execution_count = result.execution_count
        return result

    # ------------------------------------------------------------------
    def interrupt(self) -> None:
        try:
            self.km.interrupt_kernel()
        except Exception as exc:  # pragma: no cover
            _LOG.warning("kernel[%s] interrupt failed: %s", self.user_id, exc)

    def shutdown(self) -> None:
        try:
            self.client.stop_channels()
        except Exception:  # pragma: no cover
            pass
        try:
            self.km.shutdown_kernel(now=True)
        except Exception as exc:  # pragma: no cover
            _LOG.warning("kernel[%s] shutdown failed: %s", self.user_id, exc)


class KernelRegistry:
    """프로세스-단위 싱글턴. 사용자별 UserKernel 관리."""

    _lock = threading.Lock()
    _kernels: Dict[str, UserKernel] = {}
    _janitor_started = False

    @classmethod
    def get_or_create(cls, user_id: str) -> UserKernel:
        with cls._lock:
            k = cls._kernels.get(user_id)
            if k is not None:
                return k
            if len(cls._kernels) >= MAX_CONCURRENT_KERNELS:
                raise KernelQuotaError(
                    f"동시 커널 한도({MAX_CONCURRENT_KERNELS}) 를 초과했습니다. 잠시 후 다시 시도해 주세요."
                )
            k = UserKernel(user_id)
            cls._kernels[user_id] = k
            cls._start_janitor_if_needed()
            return k

    @classmethod
    def get(cls, user_id: str) -> Optional[UserKernel]:
        return cls._kernels.get(user_id)

    @classmethod
    def shutdown(cls, user_id: str) -> bool:
        with cls._lock:
            k = cls._kernels.pop(user_id, None)
        if k is None:
            return False
        k.shutdown()
        return True

    @classmethod
    def shutdown_all(cls) -> int:
        with cls._lock:
            items = list(cls._kernels.items())
            cls._kernels.clear()
        for _, k in items:
            try:
                k.shutdown()
            except Exception:  # pragma: no cover
                pass
        return len(items)

    @classmethod
    def _start_janitor_if_needed(cls):
        if cls._janitor_started:
            return

        def _janitor():
            while True:
                time.sleep(60)
                try:
                    now = time.time()
                    stale = []
                    with cls._lock:
                        for uid, k in list(cls._kernels.items()):
                            if now - k.last_used > IDLE_TIMEOUT_SEC:
                                stale.append((uid, k))
                                cls._kernels.pop(uid, None)
                    for uid, k in stale:
                        _LOG.info("kernel[%s] idle shutdown", uid)
                        try:
                            k.shutdown()
                        except Exception:  # pragma: no cover
                            pass
                except Exception as exc:  # pragma: no cover
                    _LOG.warning("kernel janitor error: %s", exc)

        t = threading.Thread(target=_janitor, name="kernel-janitor", daemon=True)
        t.start()
        cls._janitor_started = True
