#!/usr/bin/env node
/**
 * preview.mjs — 채널 고정 포트로 Remotion Studio 띄우기 (hyperframes preview 대체).
 *
 *   node tools/preview.mjs <channel> <number> [--port N] [--lang tw|th|vi]
 *
 * --lang: 다국어 변형(props.<lang>.json)으로 미리보기. 생략 시 베이스 props.json.
 *   4개 언어를 동시에 볼 땐 포트를 십의 자리씩 올려서: 3004 / 3014 / 3024 / 3034
 *
 * --public-dir 로 그 영상의 source.mp4 하드링크를 staticFile 에 잡고, --props 로 props.json 주입.
 * 포트는 채널별 고정(3003~3007). 이미 점유 중이면 --port 로 십의 자리 올려서 띄울 것.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawn } from "node:child_process";
import { CHANNELS, compositionId, resolvePropsPath } from "./channels.mjs";

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
  let channel = null, number = null, port = null, lang = null;
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--port") port = parseInt(argv[++i], 10);
    else if (a === "--lang") lang = argv[++i];
    else if (!channel) channel = a;
    else if (!number) number = a;
    else die(`Unexpected arg: ${a}`);
  }
  if (!channel || !number) die("Usage: node tools/preview.mjs <channel> <number> [--port N] [--lang tw|th|vi]");
  if (!CHANNELS.includes(channel)) die(`Unknown channel: ${channel}`);

  const dir = path.join("videos", channel, number);
  const absDir = path.join(ROOT, dir);
  const absProps = resolvePropsPath(fs, path, absDir, lang);
  if (!absProps) {
    die(
      lang
        ? `${dir}/props.${lang}.json 없음 — derive-lang.mjs 먼저 실행`
        : `${dir}/props.json 없음 — new-video 먼저 실행`
    );
  }
  const propsRel = path.join(dir, path.basename(absProps));

  const usePort = port || PORTS[channel] || 3000;
  // Composition id 는 slug 와 같되 space_lab 만 space-lab (Remotion id 는 언더스코어 불가).
  const compId = compositionId[channel];
  const args = [
    "remotion", "studio", "src/index.ts",
    "--port", String(usePort),
    "--props", propsRel,
    "--public-dir", dir,
    // 자동 브라우저 오픈 끄기 — 루트(http://localhost:PORT)로 열려 항상 기본 채널(goodvibesongs)로 빠지는 함정 방지.
    // 반드시 아래 채널 경로(compId) URL 로 열 것.
    "--no-open",
  ];
  console.log(
    `▸ Studio: http://localhost:${usePort}/${compId}  [${channel}/${number}${lang ? ` / ${lang}` : ""}]  ← ${propsRel}`
  );
  console.log(`  ⚠️ 위 채널 경로(/${compId}) URL 로 열 것. 루트 URL 은 항상 기본 채널(goodvibesongs)로 빠짐.`);
  const child = spawn("npx", args, { cwd: ROOT, stdio: "inherit" });
  child.on("exit", (code) => process.exit(code ?? 0));
}

main();
