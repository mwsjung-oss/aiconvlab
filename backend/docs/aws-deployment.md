# AWS Backend 배포 안내

APS Frontend의 **AWS** 백엔드 모드는 `VITE_AWS_API_URL`로 지정되는 **HTTPS 공개 URL** 에서 동작하는 동일 저장소 Backend(FastAPI)를 호출합니다. 사용자는 도메인을 입력하지 않으며, 값은 **환경 변수·배포 파이프라인** 에서만 설정합니다.

## 선택지 (하나 선택)

| 방식 | 설명 |
|------|------|
| **AWS App Runner** | 컨테이너 또는 소스 레포 빌드, 자동 로드밸런스·HTTPS, 운영 난이도 낮음. |
| **Amazon ECS + Fargate** | ALB 또는 Service Connect 뒤에 태스크, 요구 신뢰성·통제 높을 때. |
| **EC2 + nginx + uvicorn** | 직접 VM, systemd·리버스 프록시·Let’s Encrypt 로 TLS 종료. |

Backend는 레포루트 `backend/` 디렉터리(`uvicorn main:app`)를 빌드·실행해야 `/api/auth/login`, `/api/health`, `/api/health/storage` 등 라우터가 동작합니다.

## 도메인·HTTPS

1. DNS에 `A`/`AAAA`(또는 `CNAME` e.g. 로드밸런서)으로 전용 호스트 이름을 매핑합니다.  
2. ACM(또는 ALB 제공 인증서) 또는 **Let’s Encrypt** 로 TLS 종료 후 **HTTPS 로만 노출** 합니다.
3. CORS 허용: **Primary Frontend 오리진(예: AWS Amplify 호스트 또는 커스텀 도메인)** 을 Backend `CORS_ORIGINS` 등 허용 목록에 포함합니다.

## 배포 후 확인

배포 URL을 `PUBLIC_ORIGIN` 이라 할 때 다음이 **200 OK** 및 JSON 형식으로 응답해야 APS 프론트의 AWS 선택·헬스 점검과 호환됩니다.

```http
GET {PUBLIC_ORIGIN}/api/health
```

예시 본문: `{"status":"ok"}`

오브젝트 스토리지 연동(Storge): `GET {PUBLIC_ORIGIN}/api/health/storage` 가 `status: ok` 로 put/head/delete 검증 결과를 포함하면 스토리지 연동 진단까지 통과한 것입니다( `STORAGE_BACKEND=s3|r2` 및 자격증명 필요).

## GitHub Actions / 빌드

GitHub 또는 빌드 파이프라인(Primary: Amplify 등)에서 아래 변수를 넣습니다(배포 전 `docs/aws-cutover-runbook.md` 참고).

```bash
export VITE_API_BASE_URL="https://YOUR-EB-HTTPS-ORIGIN.example"
export VITE_AWS_API_URL="https://YOUR-EB-HTTPS-ORIGIN.example"
npm run build
```

빈 `VITE_AWS_API_URL` 로 빌드하면 APS 정책상 **빌드가 실패** 하도록 레포 내 스크립트가 검증합니다.

## 레거시 호스트와 AWS

- **Primary 운영**은 동일 레포 APS Backend 의 **운영 검증 EB HTTPS 오리진**만 사용합니다(레포에 URL 하드코딩 금지).
- 과거 레거시 호스트명은 레포 내 운영 경로 코드에 두지 않고, 필요 시 롤백 전용 브랜치·각 콘솔 변수로만 설정합니다 (`docs/cloudflare-render-retirement.md`).
