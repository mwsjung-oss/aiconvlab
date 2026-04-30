"""호환 경로: 실제 구현은 ``aps_ops.queue.sqs_queue``."""

from aps_ops.queue import sqs_queue as _impl

build_job_message = _impl.build_job_message
build_message_body = _impl.build_message_body
enqueue_aws_job = _impl.enqueue_aws_job
enqueue_lab_gpu_job = _impl.enqueue_lab_gpu_job
enqueue_job = _impl.enqueue_job
fifo_queue = _impl.fifo_queue
lab_worker_available = _impl.lab_worker_available
peek_queue_health = _impl.peek_queue_health
resolve_targets = _impl.resolve_targets
validate_queue_config = _impl.validate_queue_config

__all__ = [
    "build_job_message",
    "build_message_body",
    "enqueue_aws_job",
    "enqueue_lab_gpu_job",
    "enqueue_job",
    "fifo_queue",
    "lab_worker_available",
    "peek_queue_health",
    "resolve_targets",
    "validate_queue_config",
]
