#!/usr/bin/env node
/**
 * validate-props.mjs — 렌더 전 props.json + 미디어 정합성 검증 (hyperframes lint/validate 대체).
 *
 *   node tools/validate-props.mjs videos/<channel>/<number> [--lang tw|th|vi]
 *
 * --lang: 다국어 변형(props.<lang>.json)을 검증. 생략 시 베이스 props.json.
 *
 * 검사: props.json 파싱 / 언어값 / durationInFrames / captions 모양 / source.mp4 심볼링크 resolve /
 *       durationInFrames ≤ 미디어 마지막 프레임(끝 빈 프레임 방지) / space_lab layout 필수 키.
 * 종료코드: 하드 에러 1, 통과(경고 포함) 0.
 */
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { ORIG_LANGS, TRANS_LANGS, FPS, hasCaptions, isContainAuto, resolvePropsPath } from "./channels.mjs";

const errors = [];
const warns = [];
const err = (m) => errors.push(m);
const warn = (m) => warns.push(m);

function probeLastFrameFrames(mp4) {
  try {
    const out = execFileSync("ffprobe", [
      "-v", "error", "-select_streams", "v:0",
      "-show_entries", "frame=pts_time", "-of", "csv=p=0", mp4,
    ], { encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });
    let max = -Infinity;
    for (const line of out.split("\n")) {
      const t = parseFloat(line);
      if (isFinite(t) && t > max) max = t;
    }
    return max > 0 ? Math.floor(max * FPS) : null;
  } catch {
    return null;
  }
}

function main() {
  const argv = process.argv.slice(2);
  let dirArg = null;
  let lang = null;
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === "--lang") lang = argv[++i];
    else if (!dirArg) dirArg = argv[i];
  }
  const dir = path.resolve(dirArg || "");
  const propsPath = resolvePropsPath(fs, path, dir, lang);
  const metaPath = path.join(dir, "meta.json");
  const srcPath = path.join(dir, "source.mp4");

  if (!propsPath) {
    console.error(
      lang
        ? `✗ props.${lang}.json 없음: ${dir} — derive-lang.mjs 먼저 실행`
        : `✗ props.json 없음: ${path.join(dir, "props.json")}`
    );
    process.exit(1);
  }
  if (!fs.existsSync(metaPath)) { console.error(`✗ meta.json 없음: ${metaPath}`); process.exit(1); }

  let props, meta;
  try { props = JSON.parse(fs.readFileSync(propsPath, "utf8")); }
  catch (e) { console.error(`✗ props.json 파싱 실패: ${e.message}`); process.exit(1); }
  try { meta = JSON.parse(fs.readFileSync(metaPath, "utf8")); }
  catch (e) { console.error(`✗ meta.json 파싱 실패: ${e.message}`); process.exit(1); }

  const channel = meta.channel;

  // 언어
  if (!ORIG_LANGS.includes(props.originalLanguage)) err(`originalLanguage 잘못됨: ${props.originalLanguage}`);
  if (!TRANS_LANGS.includes(props.translationLanguage)) err(`translationLanguage 잘못됨: ${props.translationLanguage}`);

  // duration
  if (!Number.isInteger(props.durationInFrames) || props.durationInFrames <= 0) {
    err(`durationInFrames 는 양의 정수여야 함: ${props.durationInFrames}`);
  }

  // captions
  if (hasCaptions[channel]) {
    if (!Array.isArray(props.captions)) err("captions 배열 없음");
    else {
      props.captions.forEach((c, i) => {
        if (typeof c.start !== "number" || typeof c.end !== "number")
          err(`captions[${i}] start/end 가 숫자가 아님`);
        else if (c.end <= c.start) warn(`captions[${i}] end <= start (${c.start}~${c.end})`);
        if (typeof c.translation !== "string" || !c.translation.trim())
          warn(`captions[${i}] translation 비어있음 (의성어도 음역 필요)`);
      });
      for (let i = 0; i < props.captions.length - 1; i++) {
        if (props.captions[i].end > props.captions[i + 1].start)
          warn(`captions[${i}] 와 [${i + 1}] 시간 겹침`);
      }
    }
  }

  // contain-auto(space_lab 식) layout
  if (isContainAuto(channel)) {
    const L = props.layout;
    const keys = ["topH", "videoH", "warnTop", "bottomTop", "bottomH"];
    if (!L || keys.some((k) => typeof L[k] !== "number")) err(`${channel} layout 키 누락/오류: ${keys.join(",")}`);
  }

  // source.mp4 심볼링크 resolve
  if (!fs.existsSync(srcPath)) {
    err("source.mp4 심볼링크가 실제 파일로 resolve 안 됨 (미디어 누락?)");
  } else {
    const frames = probeLastFrameFrames(srcPath);
    if (frames != null && props.durationInFrames > frames + 1) {
      warn(`durationInFrames(${props.durationInFrames}) > 미디어 마지막 프레임(${frames}) — 끝에 빈 프레임이 남을 수 있음`);
    }
  }

  // ── 결과 ──
  for (const w of warns) console.log(`⚠ ${w}`);
  if (errors.length) {
    for (const e of errors) console.error(`✗ ${e}`);
    console.error(`\n✗ 검증 실패 (${errors.length} error, ${warns.length} warn)`);
    process.exit(1);
  }
  console.log(
    `\n✓ 검증 통과 [${channel}/${meta.number} / ${props.translationLanguage}] (${warns.length} warn)`
  );
  process.exit(0);
}

main();
