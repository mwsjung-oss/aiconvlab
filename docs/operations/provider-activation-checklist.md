# Provider Activation Checklist (Billing Approval)

## 원칙

- 외부 프로바이더는 기본 비활성(`ENABLED=false`)
- Billing 승인 전 실제 호출 금지
- 브라우저로 시크릿 전달 금지

## 사전 준비

- 승인 문서/예산 코드 확인
- 비용 상한/알림 정책 확인
- 롤백 계획(즉시 disable) 준비

## 활성화 절차

1. 승인 완료 확인
2. 백엔드 시크릿 스토어에 키 등록
3. 아래 토글을 `true`로 변경
   - `OPENAI_ENABLED`
   - `GEMINI_ENABLED`
   - `AWS_ENABLED`
4. 배포 롤아웃
5. `/api/providers/status`로 상태 확인

## 비활성 복구

- 이상 징후 시 즉시 `*_ENABLED=false`
- 재배포 후 상태 재확인
- 비용/로그 검토

## 체크포인트

- [ ] 키는 백엔드 환경변수로만 관리
- [ ] 프론트 `VITE_*`에 민감정보 없음
- [ ] 상태 API가 `connected` 또는 `disabled/not_configured`를 명확히 반환

