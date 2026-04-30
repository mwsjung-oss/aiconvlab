/**
 * GET /api/jobs/:id 의 ui_status_hint·status 를 사용자 문구로 매핑.
 */

const MAP = {
  aws_running_sync: "AWS에서 실행 중(동기 EB)",
  lab_gpu_pending: "연구실 GPU 서버 대기 중(SQS 큐)",
  lab_gpu_running: "연구실 GPU에서 실행 중",
  fallback_to_aws: "연구실 GPU 사용 불가 → AWS로 자동 대체",
  completed: "완료",
  failed: "실패",
  unknown: "상태 확인 중…",
};

export function phraseFromJobPayload(job) {
  if (!job) return "";
  const h = job.ui_status_hint || "";
  const st = (job.status || "").toUpperCase();
  if (st === "COMPLETED") return MAP.completed;
  if (st === "FAILED") return MAP.failed;
  return MAP[h] || job.status || "";
}
