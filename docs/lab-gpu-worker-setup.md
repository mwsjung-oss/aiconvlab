# 연구실 GPU Worker 설정

연구실 서버는 **운영 RDS/S3를 직접 사용하지 않고**, Outbound HTTPS 로 **APS Backend API** 및 **AWS SQS·S3** 만 사용합니다(Inbound 포트 불필요).

## 요구사항

- Python 3.11+
- NVIDIA 드라이버 + CUDA(학습 종류별)
- `lab-worker/requirements.txt` 패키지

## 필수 환경변수

| 변수 | 설명 |
|------|------|
| `APS_BACKEND_URL` | EB 공개 HTTPS 오리진(끝 슬래시 없음). Worker 가 `/api/jobs/*/status`, `/api/lab-workers/heartbeat` 호출 |
| `LAB_WORKER_SHARED_SECRET` | 백엔드 `LAB_WORKER_SHARED_SECRET` 과 동일. 헤더 `X-Lab-Worker-Token` 에 설정 |
| `SQS_LAB_GPU_JOBS_URL` | Lab 전용 표준 큐(SSL URL). Worker 가 **이 큐만** 폴링합니다 |
| `LAB_WORKER_ID` | 생략 시 호스트명(`socket.gethostname`). |
| `AWS_REGION` | boto3 클라이언트 |
| `AWS_ACCESS_KEY_ID` / `AWS_SECRET_ACCESS_KEY` 또는 인스턴스 역할 | SQS·S3 접근 IAM |

## 빠른 실행(Linux/WSL/macOS)

```bash
cd lab-worker
python -m venv .venv
source .venv/bin/activate   # Windows: .venv\\Scripts\\activate
pip install -r requirements.txt

export APS_BACKEND_URL=https://your-eb-env.elasticbeanstalk.com
export LAB_WORKER_SHARED_SECRET=<백엔드와 동일>
export SQS_LAB_GPU_JOBS_URL=https://sqs.../lab-gpu
export AWS_REGION=ap-northeast-2

python worker.py
```

## Windows (PowerShell 예시)

```powershell
cd lab-worker
py -3.11 -m venv .venv
.\.venv\Scripts\Activate.ps1
pip install -r requirements.txt
$env:APS_BACKEND_URL="https://your-eb-env.elasticbeanstalk.com"
$env:LAB_WORKER_SHARED_SECRET="..."
$env:SQS_LAB_GPU_JOBS_URL="https://sqs..."
$env:AWS_REGION="ap-northeast-2"
python worker.py
```

## GPU / SQS 확인

- GPU: `nvidia-smi` 출력이 있어야 학습 러너가 GPU 에 올릴 수 있습니다(없어도 폴링·상태 API 는 동작).
- 큐: Worker 기동 로그에 `polling https://sqs...` 가 보이면 연결 OK. AWS 콘솔 SQS 에서 **Messages available** 이 감소하면 수신 확인.

## Heartbeat 디버깅 1-shot

동일 디렉터리에서 한 번만 전송 테스트:

```bash
python heartbeat.py
```

## 실패·DLQ

- 작업 처리 중 예외 시 `POST /api/jobs/{id}/status` 로 `FAILED` 기록 후 SQS 메시지는 삭제합니다(무한 재시도 방지). 재시도·DLQ는 **SQS 콘솔 설정 + 가시성 타임아웃**으로 운영팀 조정합니다.

## 장애

- Worker 오프라인 시 메시지는 큐에 쌓입니다. 사용자는 학습 실행 위치에서 **AWS** 또는 **auto**(heartbeat 없으면 AWS)로 계속 학습 가능합니다.
