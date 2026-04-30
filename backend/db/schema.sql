-- APS PostgreSQL (RDS): jobs / 작업 로그 테이블
-- 사용자·프로젝트 기존 테이블은 Alembic/앱 초기화에 따름.

CREATE TABLE IF NOT EXISTS jobs (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id),
  experiment_id INTEGER REFERENCES experiments(id),
  job_type VARCHAR(64) NOT NULL,
  execution_target VARCHAR(16) NOT NULL DEFAULT 'aws',
  resolved_target VARCHAR(16),
  status VARCHAR(32) NOT NULL DEFAULT 'CREATED',
  input_s3_uri VARCHAR(2048),
  output_s3_uri VARCHAR(2048),
  error_message TEXT,
  model_config_json TEXT NOT NULL DEFAULT '{}',
  created_at TIMESTAMP WITHOUT TIME ZONE DEFAULT (NOW() AT TIME ZONE 'utc'),
  updated_at TIMESTAMP WITHOUT TIME ZONE DEFAULT (NOW() AT TIME ZONE 'utc'),
  started_at TIMESTAMP WITHOUT TIME ZONE,
  completed_at TIMESTAMP WITHOUT TIME ZONE
);

CREATE INDEX IF NOT EXISTS ix_jobs_user_id ON jobs(user_id);
CREATE INDEX IF NOT EXISTS ix_jobs_status ON jobs(status);

CREATE TABLE IF NOT EXISTS job_events (
  id SERIAL PRIMARY KEY,
  job_id INTEGER NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
  event_type VARCHAR(64) NOT NULL,
  message TEXT,
  metadata_json JSON,
  created_at TIMESTAMP WITHOUT TIME ZONE DEFAULT (NOW() AT TIME ZONE 'utc')
);

CREATE INDEX IF NOT EXISTS ix_job_events_job_id ON job_events(job_id);

CREATE TABLE IF NOT EXISTS llm_usage_logs (
  id SERIAL PRIMARY KEY,
  user_id INTEGER REFERENCES users(id),
  experiment_id INTEGER REFERENCES experiments(id),
  job_id INTEGER REFERENCES jobs(id),
  provider VARCHAR(32) NOT NULL,
  model VARCHAR(128),
  prompt_summary TEXT,
  response_summary TEXT,
  input_tokens INTEGER,
  output_tokens INTEGER,
  latency_ms DOUBLE PRECISION,
  estimated_cost DOUBLE PRECISION,
  status VARCHAR(32) NOT NULL DEFAULT 'ok',
  created_at TIMESTAMP WITHOUT TIME ZONE DEFAULT (NOW() AT TIME ZONE 'utc')
);

CREATE TABLE IF NOT EXISTS lab_worker_heartbeats (
  id SERIAL PRIMARY KEY,
  worker_id VARCHAR(128) NOT NULL UNIQUE,
  hostname VARCHAR(255),
  gpu_name VARCHAR(255),
  status VARCHAR(32) NOT NULL DEFAULT 'idle',
  last_seen_at TIMESTAMP WITHOUT TIME ZONE DEFAULT (NOW() AT TIME ZONE 'utc'),
  metadata_json JSON
);
