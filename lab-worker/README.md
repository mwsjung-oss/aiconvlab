# APS Lab GPU Worker

Elastic Beanstalk **백엔드를 직접 호출하지 않는** 대신, **HTTPS API**로 상태를 보고하고 **SQS Lab 큐만** 구독합니다.

## 실행

```bash
pip install -r requirements.txt
# 환경변수 설정 후
python worker.py
```

자세한 변수·Windows/WSL 예시는 저장소 루트 `docs/lab-gpu-worker-setup.md` 를 참고하세요.

## 구성

| 파일 | 역할 |
|------|------|
| `worker.py` | SQS 폴링 · S3 다운로드/업로드 · Runner 호출 |
| `config.py` | 환경 로드 |
| `backend_client.py` | `POST /api/lab-workers/heartbeat`, `POST /api/jobs/{id}/status` |
| `s3_client.py` | boto3 S3 유틸 |
| `job_runner.py` | 학습 실행 분기 |
| `runners/*.py` | sklearn / xgboost 및 미구현 러너 stub |

## 보안

운영 강화 시 mTLS·VPC 엔드포인트·별도 Worker IAM 제한을 적용하세요(백엔드 `docs/aws-secrets.md`).
