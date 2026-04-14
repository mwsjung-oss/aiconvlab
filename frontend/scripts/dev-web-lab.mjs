/**
 * .env.lab 의 VITE_LAB_API_URL (또는 VITE_DEV_PROXY_TARGET) 백엔드가 뜰 때까지 기다린 뒤
 * vite --mode lab 으로 연구실 프록시 설정을 씁니다.
 */
import { spawn } from "node:child_process";
import { readFileSync, existsSync } from "node:fs";
import { dirname, join, delimiter, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import waitOn from "wait-on";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

function parseDotenv(filePath) {
  if (!existsSync(filePath)) {
    throw new Error(`파일이 없습니다: ${filePath}`);
  }
  const out = {};
  for (const line of readFileSync(filePath, "utf8").split("\n")) {
    const t = line.trim();
    if (!t || t.startsWith("#")) continue;
    const eq = t.indexOf("=");
    if (eq === -1) continue;
    const k = t.slice(0, eq).trim();
    let v = t.slice(eq + 1).trim();
    if (
      (v.startsWith('"') && v.endsWith('"')) ||
      (v.startsWith("'") && v.endsWith("'"))
    ) {
      v = v.slice(1, -1);
    }
    out[k] = v;
  }
  return out;
}

const labPath = join(root, ".env.lab");
const labLocalPath = join(root, ".env.lab.local");
if (!existsSync(labPath)) {
  console.error("[lab] .env.lab 파일이 없습니다.");
  process.exit(1);
}
const labEnv = {
  ...parseDotenv(labPath),
  ...(existsSync(labLocalPath) ? parseDotenv(labLocalPath) : {}),
};
const target = (
  labEnv.VITE_LAB_API_URL ||
  labEnv.VITE_DEV_PROXY_TARGET ||
  ""
).replace(/\/+$/, "");
if (!target) {
  console.error(
    "[lab] .env.lab(또는 .env.lab.local)에 VITE_LAB_API_URL 또는 VITE_DEV_PROXY_TARGET 이 필요합니다."
  );
  process.exit(1);
}

const health = `${target}/api/health`;
console.log(`[lab] ${health} 준비 대기…`);
await waitOn({
  resources: [health],
  timeout: 120000,
  interval: 300,
});

const binDir = join(root, "node_modules", ".bin");
const pathEnv = `${resolve(binDir)}${delimiter}${process.env.PATH || ""}`;

const child = spawn("vite", ["--mode", "lab"], {
  cwd: root,
  stdio: "inherit",
  shell: true,
  env: { ...process.env, PATH: pathEnv },
});

child.on("exit", (code, signal) => {
  if (signal) process.kill(process.pid, signal);
  process.exit(code ?? 1);
});
