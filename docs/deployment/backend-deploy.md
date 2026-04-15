# Backend Deployment Guide

## 배포 목표

- FastAPI 백엔드를 퍼블릭 엔드포인트로 배포
- 프론트(Cloudflare Pages)와 분리 운영
- 외부 프로바이더는 기본 비활성 상태 유지

## Docker 기반 배포

- Dockerfile: `backend/Dockerfile`
- 기본 포트: `8000` (Render 등은 런타임 `PORT` 사용)
- 헬스체크: `/api/health` 또는 `/health`
- 컨테이너는 **uvicorn `--proxy-headers`** 로 기동합니다. 리버스 프록시(HTTPS 종료) 뒤에서도 `X-Forwarded-*` 가 반영됩니다.
- 신뢰할 프록시 IP 범위를 좁히려면 환경변수 `FORWARDED_ALLOW_IPS`(콤마 구분)를 지정할 수 있습니다. 기본은 `*`(프록시 전체 신뢰)입니다.

예시:

```bash
docker build -t ailab-backend ./backend
docker run --rm -p 8000:8000 --env-file backend/.env ailab-backend
```

## 템플릿 위치

- Cloudflare(프론트 전용 참고): `infra/cloudflare/`
- Render: `infra/render/render.yaml`
- AWS ECS 예시: `infra/aws/ecs-taskdef.template.json`

## 필수 환경변수(최소)

- `JWT_SECRET`
- `MASTER_EMAIL`
- `MASTER_PASSWORD`
- `BACKEND_PUBLIC_URL`
- `CORS_ORIGINS` (프론트 도메인 포함)

## 런타임/프로바이더 기본값

- `AILAB_DEFAULT_RUNTIME=local`
- `AILAB_ALLOWED_RUNTIMES=local,lab,cloud`
- `OPENAI_ENABLED=false`
- `GEMINI_ENABLED=false`
- `AWS_ENABLED=false`

## 배포 후 점검

- `GET /api/health`
- `GET /api/config`
- `GET /api/runtimes`
- `GET /api/providers/status`

