#!/usr/bin/env node
/**
 * 굿바이브 하단 댓글 오버레이 준비 — 한 방에:
 *   ① 프사/닉네임 블러(자동 지오메트리 + 모자이크)  ② 영상 디렉토리로 복사  ③ 타이밍 분배  ④ props.json 기록
 *
 * 입력: 레포 루트의 <번호>댓글/ 폴더 (사용자가 댓글 스샷을 넣어둠) + 그 안에 manifest.json.
 *   manifest.json = [
 *     { "file": "001.png", "note": "여기부터 너무 좋아", "anchor": 66 },
 *     ...
 *   ]
 *   - file:      폴더 내 스샷 파일명
 *   - handleEnd: (선택) @핸들 끝 x좌표. **기본은 blur-comments 가 스샷마다 자동 측정**하므로
 *                생략한다. 예외 스샷만 숫자로 덮어쓴다.
 *   - note:      댓글 내용의 한국어 번역(식별용, 화면 미표시)
 *   - anchor:    (선택) 이 댓글이 합당한 가사 시점(초). 있으면 그 슬롯에 배치.
 *   - start/end: (선택) 초 단위 수동 타이밍. **모든 항목에 start 가 있으면 자동 분배를 끄고**
 *                manifest 순서 그대로 그 시각을 쓴다(=수동 모드). end 생략 시 다음 항목 start.
 *   - stack:     (선택) true 면 교체되지 않고 화면 아래에서부터 쌓이는 스택 댓글(111 부터).
 *                수동 모드에서만 의미 있음. end 는 자동으로 영상 끝.
 *
 * 타이밍: (자동) 영상 길이 ÷ 댓글 개수 = 균등 슬롯. anchor 있는 댓글은 그 시점 슬롯에,
 *         나머지는 남은 슬롯에 순서대로. 항상 1개 연속 노출(슬롯 경계에서 하드 컷).
 *         (수동) 위 start/end/stack 참조 — 가사에 정확히 물리거나 연출이 필요할 때.
 *
 * 사용법:  node tools/prep-comments.mjs <번호>            (채널은 goodvibesongs 고정)
 *          node tools/prep-comments.mjs goodvibesongs <번호>
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { execFileSync } from "node:child_process";
import { FPS, CHANNELS, FORMATS, previewPorts, compositionId } from "./channels.mjs";
import { blurComment } from "./blur-comments.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");

function die(msg) {
  console.error(`✗ ${msg}`);
  process.exit(1);
}

function probeSize(file) {
  const out = execFileSync(
    "ffprobe",
    ["-v", "error", "-select_streams", "v:0", "-show_entries", "stream=width,height", "-of", "csv=p=0:s=x", file],
    { encoding: "utf8" }
  ).trim();
  const [w, h] = out.split("x").map((n) => parseInt(n, 10));
  return { w: Number.isFinite(w) ? w : null, h: Number.isFinite(h) ? h : null };
}

// 수동 타이밍(모든 항목에 start). 순서 그대로, end 는 명시값 → 스택/핀이면 영상 끝 →
// 아니면 다음 항목 start → 영상 끝.
function placeManual(entries, D) {
  return entries.map((e, i) => {
    // end 를 안 준 슬롯 댓글은 "다음 슬롯 댓글" 이 나올 때까지 (스택/핀은 건너뜀).
    const nextSlot = entries.slice(i + 1).find((n) => !n.stack && !n.pin);
    const end =
      e.end != null ? e.end : e.stack || e.pin ? D : nextSlot ? nextSlot.start : D;
    return { ...e, start: +e.start.toFixed(3), end: +end.toFixed(3) };
  });
}

// 배치 전용 필드 — props 로 그대로 통과시킨다 (CommentTrack 이 해석).
function pinFields(e) {
  const out = {};
  if (e.stack) out.stack = true;
  if (e.pin) out.pin = true;
  for (const k of ["anchor", "align", "dx", "x", "y", "rot", "scale", "z"]) {
    if (e[k] != null) out[k] = e[k];
  }
  return out;
}


// 균등 슬롯 + anchor 배치. taken[i] = 슬롯 i 에 들어갈 엔트리.
function assignSlots(entries, D) {
  const N = entries.length;
  const slot = D / N;
  const taken = new Array(N).fill(null);
  const anchored = entries.filter((e) => e.anchor != null);
  const unanchored = entries.filter((e) => e.anchor == null);
  for (const e of anchored) {
    let s = Math.min(N - 1, Math.max(0, Math.floor(e.anchor / slot)));
    if (taken[s] != null) {
      for (let off = 1; off < N; off++) {
        if (s - off >= 0 && taken[s - off] == null) { s -= off; break; }
        if (s + off < N && taken[s + off] == null) { s += off; break; }
      }
    }
    taken[s] = e;
  }
  let u = 0;
  for (let i = 0; i < N; i++) if (taken[i] == null) taken[i] = unanchored[u++];
  // 슬롯 연속(겹침 없음) — CommentTrack 이 하드 컷으로 경계에서 즉시 교체.
  return taken.map((e, i) => ({
    ...e,
    start: +(i * slot).toFixed(3),
    end: +(i === N - 1 ? D : (i + 1) * slot).toFixed(3),
  }));
}

function main() {
  let argv = process.argv.slice(2);
  // 채널 인자(선택) — 기본은 댓글 오버레이(features.comments)를 가진 첫 포맷(굿바이브).
  let channel = CHANNELS.find((c) => FORMATS[c].features.comments) || "goodvibesongs";
  if (argv[0] && CHANNELS.includes(argv[0])) { channel = argv.shift(); }
  if (!FORMATS[channel]?.features.comments) die(`${channel} 포맷엔 댓글 오버레이(features.comments)가 없다`);
  const number = argv[0];
  if (!number || !/^[0-9]+$/.test(number)) {
    die("Usage: node tools/prep-comments.mjs <번호>   (예: 085)");
  }

  const inDir = path.join(ROOT, `${number}댓글`);
  if (!fs.existsSync(inDir)) die(`입력 폴더 없음: ${number}댓글/  (레포 루트에 댓글 스샷 폴더를 두세요)`);
  const manifestPath = path.join(inDir, "manifest.json");
  if (!fs.existsSync(manifestPath)) die(`manifest.json 없음: ${number}댓글/manifest.json`);

  const videoDir = path.join(ROOT, "videos", channel, number);
  const propsPath = path.join(videoDir, "props.json");
  if (!fs.existsSync(propsPath)) die(`props.json 없음: videos/${channel}/${number}/  (new-video 먼저)`);

  const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
  if (!Array.isArray(manifest) || manifest.length === 0) die("manifest 가 비었거나 배열이 아님");
  for (const e of manifest) {
    if (!e.file) die(`manifest 항목에 file 없음: ${JSON.stringify(e)}`);
    if (!fs.existsSync(path.join(inDir, e.file))) die(`스샷 없음: ${number}댓글/${e.file}`);
  }

  const props = JSON.parse(fs.readFileSync(propsPath, "utf8"));
  const D = props.durationInFrames / FPS;
  if (!Number.isFinite(D) || D <= 0) die(`props.durationInFrames 이상: ${props.durationInFrames}`);

  // 타이밍 배치 — 모든 항목에 start 가 있으면 수동, 아니면 균등 슬롯 자동 분배.
  const manual = manifest.every((e) => typeof e.start === "number");
  if (!manual && manifest.some((e) => e.stack)) {
    die("stack 은 수동 모드 전용 — 모든 manifest 항목에 start(초)를 주세요");
  }
  const placed = manual ? placeManual(manifest, D) : assignSlots(manifest, D);

  // 블러 → comments/NN.png 복사 + native width
  const outDir = path.join(videoDir, "comments");
  fs.rmSync(outDir, { recursive: true, force: true });
  fs.mkdirSync(outDir, { recursive: true });

  // 같은 스샷을 여러 번 배치할 수 있다(핀 콜라주에서 회전/크기만 바꿔 재사용).
  // 파일당 한 번만 블러해서 comments/NN.png 하나로 공유한다.
  const blurred = new Map(); // manifest file -> { rel, plan, w, h }
  const comments = placed.map((e) => {
    const hit = blurred.get(e.file);
    if (hit) {
      const note = e.note || path.basename(e.file, path.extname(e.file));
      return { src: hit.rel, start: e.start, end: e.end, note, w: hit.w, h: hit.h, _plan: hit.plan, ...pinFields(e) };
    }
    const nn = String(blurred.size + 1).padStart(2, "0");
    const rel = `comments/${nn}.png`;
    const out = path.join(videoDir, rel);
    // 블러: 지오메트리(프사/핸들 박스)와 강도는 blur-comments 가 스샷마다 자동 측정한다.
    // manifest 에 값을 주면 그 항목만 덮어쓴다(예외 스샷용).
    const blurOpts = {};
    for (const k of ["handleEnd", "sigma", "block", "feather", "avatarW", "avatarH", "avatarX", "avatarY", "nickX", "nickY", "nickH"]) {
      if (e[k] != null) blurOpts[k] = e[k];
    }
    let plan;
    try {
      ({ plan } = blurComment(path.join(inDir, e.file), out, blurOpts));
    } catch (err) {
      die(`블러 실패: ${e.file} — ${err.message}`);
    }
    const { w, h } = probeSize(out);
    blurred.set(e.file, { rel, plan, w, h });
    // note 는 식별용(화면 미표시) — 파일명(=한국어 번역)에서 자동. manifest 에 note 주면 우선.
    const note = e.note || path.basename(e.file, path.extname(e.file));
    return {
      src: rel,
      start: e.start,
      end: e.end,
      note,
      ...(w ? { w } : {}),
      ...(h ? { h } : {}),
      _plan: plan,
      ...pinFields(e),
    };
  });

  props.comments = comments.map(({ _plan, ...c }) => c);
  fs.writeFileSync(propsPath, JSON.stringify(props, null, 2) + "\n");

  const nStack = comments.filter((c) => c.stack).length;
  const nPin = comments.filter((c) => c.pin).length;
  const modes = [nStack && `스택 ${nStack}`, nPin && `핀 ${nPin}`].filter(Boolean).join(" / ");
  console.log(
    `✓ ${comments.length}개 배치 (원본 ${blurred.size}장) → videos/${channel}/${number}/comments/ + props.json`
  );
  console.log(
    manual
      ? `  영상 ${D.toFixed(1)}s, 수동 타이밍${modes ? ` (${modes})` : ""}`
      : `  영상 ${D.toFixed(1)}s, 슬롯 ${(D / comments.length).toFixed(1)}s/개`
  );
  for (const c of comments) {
    if (c.pin) continue; // 핀은 개수가 많아 아래에 요약만
    const p = c._plan;
    const geo = `프사 ${p.avatarW}x${p.avatarH} / 닉 ${p.handleEnd - p.nickX}x${p.nickH}`;
    console.log(
      `   ${c.src}  ${c.start}s–${c.end}s${c.stack ? " [stack]" : ""}  ${c.w || "?"}x${c.h || "?"}px  ${geo}  block=${p.block} sigma=${p.sigma}  "${c.note}"`
    );
  }
  if (nPin) {
    const pins = comments.filter((c) => c.pin);
    console.log(
      `   [pin] ${nPin}개  ${pins[0].start}s → ${pins[nPin - 1].start}s  (간격 ≈ ${(
        (pins[nPin - 1].start - pins[0].start) / Math.max(1, nPin - 1)
      ).toFixed(3)}s)`
    );
  }
  console.log(`\nNext: node tools/preview.mjs ${channel} ${number}  → http://localhost:${previewPorts[channel]}/${compositionId[channel]}`);
}

main();
