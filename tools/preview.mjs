#!/usr/bin/env node
/**
 * preview.mjs — 채널 고정 포트로 Remotion Studio 띄우기 (hyperframes preview 대체).
 *
 *   node tools/preview.mjs <channel> <number> [--port N]
 *
 * --public-dir 로 그 영상의 source.mp4 하드링크를 staticFile 에 잡고, --props 로 props.json 주입.
 * 포트는 채널별 고정(3003~3007). 이미 점유 중이면 --port 로 십의 자리 올려서 띄울 것.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawn } from "node:child_process";
import { CHANNELS } from "./channels.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");

const PORTS = {
  goodvibesongs: 3003,
  goodmovies: 3004,
  readyaction: 3005,
  thishiphop: 3006,
  space_lab: 3007,
};

function die(msg) {
  console.error(`✗ ${msg}`);
  process.exit(1);
}

function main() {
  const argv = process.argv.slice(2);
  let channel = null, number = null, port = null;
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--port") port = parseInt(argv[++i], 10);
    else if (!channel) channel = a;
    else if (!number) number = a;
    else die(`Unexpected arg: ${a}`);
  }
  if (!channel || !number) die("Usage: node tools/preview.mjs <channel> <number> [--port N]");
  if (!CHANNELS.includes(channel)) die(`Unknown channel: ${channel}`);

  const dir = path.join("videos", channel, number);
  const absDir = path.join(ROOT, dir);
  if (!fs.existsSync(path.join(absDir, "props.json"))) die(`${dir}/props.json 없음 — new-video 먼저 실행`);

  const usePort = port || PORTS[channel] || 3000;
  const args = [
    "remotion", "studio", "src/index.ts",
    "--port", String(usePort),
    "--props", path.join(dir, "props.json"),
    "--public-dir", dir,
  ];
  console.log(`▸ Studio: http://localhost:${usePort}  [${channel}/${number}]`);
  console.log(`  컴포지션 목록에서 "${channel}" 선택`);
  const child = spawn("npx", args, { cwd: ROOT, stdio: "inherit" });
  child.on("exit", (code) => process.exit(code ?? 0));
}

main();
