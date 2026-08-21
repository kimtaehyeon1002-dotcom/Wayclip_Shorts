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
 *
 * 타이밍: 영상 길이 ÷ 댓글 개수 = 균등 슬롯. anchor 있는 댓글은 그 시점 슬롯에,
 *         나머지는 남은 슬롯에 순서대로. 항상 1개 연속 노출(슬롯 경계 크로스페이드 FADE).
 *
 * 사용법:  node tools/prep-comments.mjs <번호>            (채널은 goodvibesongs 고정)
 *          node tools/prep-comments.mjs goodvibesongs <번호>
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { execFileSync } from "node:child_process";
import { FPS } from "./channels.mjs";
import { blurComment } from "./blur-comments.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");

function die(msg) {
  console.error(`✗ ${msg}`);
  process.exit(1);
}

function probeWidth(file) {
  const out = execFileSync(
    "ffprobe",
    ["-v", "error", "-select_streams", "v:0", "-show_entries", "stream=width", "-of", "csv=p=0", file],
    { encoding: "utf8" }
  ).trim();
  const w = parseInt(out, 10);
  return Number.isFinite(w) ? w : null;
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
  if (argv[0] === "goodvibesongs") argv = argv.slice(1);
  const number = argv[0];
  if (!number || !/^[0-9]+$/.test(number)) {
    die("Usage: node tools/prep-comments.mjs <번호>   (예: 085)");
  }

  const inDir = path.join(ROOT, `${number}댓글`);
  if (!fs.existsSync(inDir)) die(`입력 폴더 없음: ${number}댓글/  (레포 루트에 댓글 스샷 폴더를 두세요)`);
  const manifestPath = path.join(inDir, "manifest.json");
  if (!fs.existsSync(manifestPath)) die(`manifest.json 없음: ${number}댓글/manifest.json`);

  const videoDir = path.join(ROOT, "videos", "goodvibesongs", number);
  const propsPath = path.join(videoDir, "props.json");
  if (!fs.existsSync(propsPath)) die(`props.json 없음: videos/goodvibesongs/${number}/  (new-video 먼저)`);

  const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
  if (!Array.isArray(manifest) || manifest.length === 0) die("manifest 가 비었거나 배열이 아님");
  for (const e of manifest) {
    if (!e.file) die(`manifest 항목에 file 없음: ${JSON.stringify(e)}`);
    if (!fs.existsSync(path.join(inDir, e.file))) die(`스샷 없음: ${number}댓글/${e.file}`);
  }

  const props = JSON.parse(fs.readFileSync(propsPath, "utf8"));
  const D = props.durationInFrames / FPS;
  if (!Number.isFinite(D) || D <= 0) die(`props.durationInFrames 이상: ${props.durationInFrames}`);

  // 타이밍 배치
  const placed = assignSlots(manifest, D);

  // 블러 → comments/NN.png 복사 + native width
  const outDir = path.join(videoDir, "comments");
  fs.rmSync(outDir, { recursive: true, force: true });
  fs.mkdirSync(outDir, { recursive: true });

  const comments = placed.map((e, i) => {
    const nn = String(i + 1).padStart(2, "0");
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
    const w = probeWidth(out);
    // note 는 식별용(화면 미표시) — 파일명(=한국어 번역)에서 자동. manifest 에 note 주면 우선.
    const note = e.note || path.basename(e.file, path.extname(e.file));
    return { src: rel, start: e.start, end: e.end, note, ...(w ? { w } : {}), _plan: plan };
  });

  props.comments = comments.map(({ _plan, ...c }) => c);
  fs.writeFileSync(propsPath, JSON.stringify(props, null, 2) + "\n");

  console.log(`✓ ${comments.length}개 댓글 → videos/goodvibesongs/${number}/comments/ + props.json`);
  console.log(`  영상 ${D.toFixed(1)}s, 슬롯 ${(D / comments.length).toFixed(1)}s/개`);
  for (const c of comments) {
    const p = c._plan;
    const geo = `프사 ${p.avatarW}x${p.avatarH} / 닉 ${p.handleEnd - p.nickX}x${p.nickH}`;
    console.log(
      `   ${c.src}  ${c.start}s–${c.end}s  ${c.w || "?"}px  ${geo}  block=${p.block} sigma=${p.sigma}  "${c.note}"`
    );
  }
  console.log(`\nNext: node tools/preview.mjs goodvibesongs ${number}  → http://localhost:3003/goodvibesongs`);
}

main();
