# AWS IAM 운영 원칙

## Root 계정

- 일상 업무 미사용. MFA 필수.

## APS 운영 페르소나(예시)

| 페르소나 | 목적 |
|----------|------|
| `aps-admin-user` | 콘솔 RDS/S3 등 운영(사람 MFA) |
| `aps-github-deploy-user` | CI에서 **검증·아티팩트 업로드 등 비파괴 작업**(필요 시만) |
| `aps-backend-runtime-role` | Elastic Beanstalk 인스턴스 역할 — S3 읽기/쓰기, SQS, Secrets 읽기, Bedrock 호출 허용 |

## Access Key

- 사람·CI에 장기 AK 남발 금지. 가능하면 IAM Role + OIDC.

## APS Backend 런타임 권한(요지)

- S3 객체 읽기/쓰기(데이터셋·아티팩트 prefix 제한 권장).
- SQS `SendMessage`(AWS 큐)·Lab 큐 라우팅 정책 일치.
- Secrets Manager/`ssm:GetParameter` 필요 시 최소 IAM.
- **관리형 전체 계정 Admin 키는 앱에 요구하지 않음.**
