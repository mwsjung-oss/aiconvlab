# Amazon SES SMTP (APS·Elastic Beanstalk)

APS FastAPI 백엔드는 **AWS SES SMTP 엔드포인트**로 메일을 보냅니다. 구현은 `backend/src/services/email_service.py` 에 있으며, 회원가입 인증 등 레거시 경로는 루트 `backend/email_service.py` 가 동일한 환경 변수(`SMTP_USERNAME`, `SMTP_FROM_EMAIL` 등)를 읽도록 맞춰 두었습니다.

## Elastic Beanstalk 환경 변수

| 변수 | 설명 |
|------|------|
| `SMTP_ENABLED` | `true`(기본과 동일)일 때 실제 발송. `false`이면 **dry-run**(로그만, 네트워크 없음). |
| `SMTP_PROVIDER` | 메타 정보용(선택). 로그 dry-run 시 참고용으로만 출력. |
| `SMTP_HOST` | 예: `email-smtp.ap-northeast-2.amazonaws.com` |
| `SMTP_PORT` | 기본 `587`(STARTTLS). |
| `SMTP_USE_TLS` | `true` 권장(587). |
| `SMTP_USE_SSL` | `465` 직결 SSL 시 `true` 등. |
| `SMTP_USERNAME` | SES 콘솔에서 발급한 SMTP 사용자 이름. |
| `SMTP_PASSWORD` | SES SMTP 비밀번호( IAM에서 생성한 자격 증명, **로그에 출력하지 않음**). |
| `SMTP_FROM_EMAIL` | 검증된 발신 주소(예: `no-reply@aiconvlab.com`). |
| `SMTP_FROM_NAME` | 발신 표시 이름(예: `AICONV Lab`). From 헤더: `이름 <이메일>`. |
| `SMTP_TIMEOUT` | 초(기본 30). |
| `SMTP_LOCAL_HOSTNAME` | 연결 문제 시 `localhost` 등(선택). |
| `ADMIN_API_KEY` | 관리용 테스트 API 보호 키(아래 참고, **로그 금지**). |

호환을 위해 `SMTP_USER`·`SMTP_FROM` 도 SMTP 사용자·발신 주소로 읽힙니다.

## SES에서 SMTP 자격 증명 만들기

1. AWS 콘솔 → **Simple Email Service (SES)** → **SMTP settings** → **Create SMTP credentials**.  
2. 생성된 **SMTP username / password** 를 각각 EB의 `SMTP_USERNAME`·`SMTP_PASSWORD` 에 넣습니다.  
3. **Identity(도메인 또는 이메일)** 을 검증하고, `SMTP_FROM_EMAIL` 이 그 검증된 주소(또는 도메인)와 일치하는지 확인합니다.

리전은 EB·SES·`email-smtp.<region>.amazonaws.com` 이 **같은 리전**인 것이 관리상 편합니다.

## 테스트 메일 API

**경로:** `POST /api/admin/test-email`  

**헤더:** `X-Admin-API-Key: <ADMIN_API_KEY와 동일>`  

**본문(JSON):**

```json
{
  "to": "recipient@example.com",
  "subject": "AICONV Lab SES SMTP Test",
  "message": "SES SMTP 테스트 메일입니다."
}
```

`curl` 예시(운영 HTTPS 오리진에 맞게 바꿉니다):

```bash
curl -sS -X POST "https://YOUR-EB-API/api/admin/test-email" \
  -H "Content-Type: application/json" \
  -H "X-Admin-API-Key: YOUR_ADMIN_API_KEY" \
  -d '{"to":"you@example.com","subject":"SES Test","message":"hello"}'
```

- `SMTP_ENABLED=false` 이면 응답 `status` 가 `dry_run` 이고 SMTP 연결은 하지 않습니다.  
- 키가 없거나 다르면 **401**, 서버에 `ADMIN_API_KEY` 가 없으면 **503** 입니다.

## SES Sandbox 주의

- 계정이 **Sandbox** 이면 **검증된 주소로만** 발신·수신할 수 있습니다.  
- 운영 전에 **프로덕션 액세스**(또는 필요한 한도) 요청을 완료하세요.  
- 수신 거부·스팸 폴더·DMARC/SPF/DKIM 설정은 도메인 DNS와 SES 가이드를 따릅니다.

## SMTP Password·ADMIN_API_KEY 보안

- EB/Secrets Manager에만 두고, Git·로그·에러 메시지·OpenAPI 예시에 **넣지 마세요**.  
- 애플리케이션 코드는 비밀번호·`ADMIN_API_KEY` 를 **로그로 남기지 않습니다**.  
- 테스트 API 키는 충분히 긴 무작위 값을 사용하고, 주기적으로 교체를 검토하세요.

## 로컬·CI

- 단위 테스트: `backend/tests/test_email_ses_smtp.py`, `backend/tests/test_admin_test_email.py`  
- 배포 후: 위 `curl` 또는 동일 요청으로 확인.

## 관련 파일

- `backend/src/services/email_service.py` — `send_email`, 비밀번호 재설정·실험 완료 템플릿.  
- `backend/email_service.py` — 가입 인증·승인 알림(레거시, 동일 SMTP 변수 지원).  
- `backend/routers/admin.py` — `POST /api/admin/test-email`.  
- `backend/dependencies.py` — `require_admin_api_key`.
