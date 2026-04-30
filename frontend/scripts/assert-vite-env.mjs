#!/usr/bin/env node
/** APS: 프로덕션 빌드 전 `VITE_API_BASE_URL` 필수 검증 */
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

const fromShell =
  process.env.VITE_API_BASE_URL && String(process.env.VITE_API_BASE_URL).trim();
const raw = fromShell || parseProduction("VITE_API_BASE_URL");
if (!raw) {
  console.error(
    "ERROR: VITE_API_BASE_URL is required (AWS Elastic Beanstalk public HTTPS API).",
  );
  process.exit(1);
}
