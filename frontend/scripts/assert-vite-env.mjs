#!/usr/bin/env node
/** APS: 프로덕션 빌드 전 VITE 공개 오리진 필수 검증 (AWS EB 권장) */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function parseProduction(key) {
  const p = path.join(root, ".env.production");
  if (!fs.existsSync(p)) return "";
  for (const line of fs.readFileSync(p, "utf8").split(/\r?\n/)) {
    const s = line.trim();
    if (!s || s.startsWith("#")) continue;
    const m = /^([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/.exec(s);
    if (!m || m[1] !== key) continue;
    let v = (m[2] || "").trim();
    if (
      v.length >= 2 &&
      ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'")))
    ) {
      v = v.slice(1, -1).trim();
    }
    return v;
  }
  return "";
}

function requireHttps(key, hint) {
  const fromShell = process.env[key] && String(process.env[key]).trim();
  const raw = fromShell || parseProduction(key);
  if (!raw) {
    console.error(`ERROR: ${key} is required (${hint}).`);
    console.error(`       Use Amplify/GitHub Actions env injection or frontend/.env.production (.example 참고)`);
    process.exit(1);
  }
  if (!raw.startsWith("https://")) {
    console.error(`ERROR: ${key} must use https:// in production builds (got "${raw}")`);
    process.exit(1);
  }
}

requireHttps("VITE_API_BASE_URL", "browser → API (Elastic Beanstalk public HTTPS 등)");
requireHttps(
  "VITE_AWS_API_URL",
  "AWS 전용 브라우저 경로 분기 등 — 단일 EB면 VITE_API_BASE_URL 과 동일 URL",
);
