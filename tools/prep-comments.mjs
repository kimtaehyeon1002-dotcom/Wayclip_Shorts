#!/usr/bin/env node
/**
 * 굿바이브 하단 댓글 오버레이 준비 — 한 방에:
 *   ① 프사/닉네임 블러(sigma12 타이트)  ② 영상 디렉토리로 복사  ③ 타이밍 분배  ④ props.json 기록
 *
 * 입력: 레포 루트의 <번호>댓글/ 폴더 (사용자가 댓글 스샷을 넣어둠) + 그 안에 manifest.json.
 *   manifest.json = [
 *     { "file": "001.png", "handleEnd": 280, "note": "여기부터 너무 좋아", "anchor": 66 },
 *     ...
 *   ]
 *   - file:      폴더 내 스샷 파일명
 *   - handleEnd: @핸들 끝 x좌표(날짜 직전). 블러 닉네임 폭 결정. (Claude 가 그리드로 측정)
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

function probeHeight(file) {
  const out = execFileSync(
    "ffprobe",
    ["-v", "error", "-select_streams", "v:0", "-show_entries", "stream=height", "-of", "csv=p=0", file],
    { encoding: "utf8" }
  ).trim();
  const h = parseInt(out, 10);
  return Number.isFinite(h) ? h : null;
}

// 프사(좌상단 원형) 마스크 폭 자동 측정 — handleEnd 의 "가로 버전".
// 유튜브 댓글 본문은 아바타 오른쪽으로 들여쓰기된 흰색 텍스트다. 본문 첫 줄에서
// 가장 왼쪽 흰색(>thresh) x = bodyLeft 를 찾아, 마스크가 페더 번짐까지 포함해 그 앞에서
// 끝나도록 avatarW = bodyLeft - 3*feather - margin 으로 정한다.
// → 프사는 덮고 본문 첫 글자는 절대 안 덮는다. (눈대중 금지)
// band: 핸들 줄(상단 ~y52)과 액션 줄(좋아요/返信, 하단)을 피해 본문 첫 줄만 스캔.
function measureAvatarW(file, { yTop = 58, bandH = 38, thresh = 200, feather = 5, margin = 2 } = {}) {
  const w = probeWidth(file);
  const h = probeHeight(file);
  if (!w || !h) return null;
  const bh = Math.max(8, Math.min(bandH, h - yTop - 40)); // 하단 액션 줄(~40px) 제외
  if (bh <= 0) return null;
  const raw = execFileSync(
    "ffmpeg",
    ["-v", "error", "-i", file, "-vf", `crop=${w}:${bh}:0:${yTop},format=gray`, "-f", "rawvideo", "-pix_fmt", "gray", "-"],
    { maxBuffer: 1 << 28 }
  );
  for (let x = 0; x < w; x++) {
    for (let y = 0; y < bh; y++) {
      if (raw[y * w + x] > thresh) {
        const bodyLeft = x;
        return Math.max(1, Math.round(bodyLeft - 3 * feather - margin));
      }
    }
  }
  return null;
}

// @핸들 끝 x좌표 자동 측정.
// 유튜브 댓글: 닉네임=흰색, 날짜=회색. 맨 윗줄(핸들 라인)에서 아바타(x0~)를 제외한
// 영역을 raw gray 로 덤프해 "흰색(>thresh)" 픽셀의 최대 x 를 찾는다 → 날짜(회색)는 자동 제외.
// margin 으로 안티에일리어싱 꼬리를 살짝 더 덮는다. handleEnd 미지정 시 prep 가 호출.
function measureHandleEnd(file, { x0 = 95, band = 52, thresh = 200, margin = 8 } = {}) {
  const w = probeWidth(file);
  if (!w || w <= x0) return null;
  const cw = w - x0;
  const raw = execFileSync(
    "ffmpeg",
    ["-v", "error", "-i", file, "-vf", `crop=${cw}:${band}:${x0}:0,format=gray`, "-f", "rawvideo", "-pix_fmt", "gray", "-"],
    { maxBuffer: 1 << 28 }
  );
  const h = Math.floor(raw.length / cw); // 실제 밴드 높이(이미지가 band 보다 낮을 수 있음)
  for (let x = cw - 1; x >= 0; x--) {
    for (let y = 0; y < h; y++) {
      if (raw[y * cw + x] > thresh) return Math.min(w - 1, x0 + x + margin);
    }
  }
  return null;
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
    // handleEnd 미지정 → 흰색 닉네임 끝 자동 측정 (날짜=회색이라 자동 제외)
    if (e.handleEnd == null) {
      e.handleEnd = measureHandleEnd(path.join(inDir, e.file));
      if (e.handleEnd == null) die(`handleEnd 자동측정 실패(흰색 닉네임 미검출): ${e.file} — 수동 지정 필요`);
      e._auto = true;
    }
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
    // 블러 파라미터: handleEnd 외에 스샷 스케일이 2x 가 아니면 매니페스트가
    // sigma/feather/avatarW/avatarH/nickX/nickY/nickH 를 넘겨 덮어쓸 수 있다.
    const blurOpts = { handleEnd: e.handleEnd };
    for (const k of ["sigma", "feather", "avatarW", "avatarH", "nickX", "nickY", "nickH"]) {
      if (e[k] != null) blurOpts[k] = e[k];
    }
    // avatarW 미지정 → 본문 첫 글자 왼쪽에서 멈추도록 자동 측정 (handleEnd 의 가로 버전).
    let avAuto = false;
    if (blurOpts.avatarW == null) {
      const aw = measureAvatarW(path.join(inDir, e.file), { feather: blurOpts.feather ?? 5 });
      if (aw != null) { blurOpts.avatarW = aw; avAuto = true; }
    }
    blurComment(path.join(inDir, e.file), out, blurOpts);
    const w = probeWidth(out);
    // note 는 식별용(화면 미표시) — 파일명(=한국어 번역)에서 자동. manifest 에 note 주면 우선.
    const note = e.note || path.basename(e.file, path.extname(e.file));
    return { src: rel, start: e.start, end: e.end, note, ...(w ? { w } : {}), _he: e.handleEnd, _auto: !!e._auto, _aw: blurOpts.avatarW, _avAuto: avAuto };
  });

  props.comments = comments.map(({ _he, _auto, _aw, _avAuto, ...c }) => c);
  fs.writeFileSync(propsPath, JSON.stringify(props, null, 2) + "\n");

  console.log(`✓ ${comments.length}개 댓글 → videos/goodvibesongs/${number}/comments/ + props.json`);
  console.log(`  영상 ${D.toFixed(1)}s, 슬롯 ${(D / comments.length).toFixed(1)}s/개`);
  for (const c of comments) {
    const he = `handleEnd=${c._he}${c._auto ? "(auto)" : ""}`;
    const aw = `avatarW=${c._aw}${c._avAuto ? "(auto)" : ""}`;
    console.log(`   ${c.src}  ${c.start}s–${c.end}s  ${c.w || "?"}px  ${he}  ${aw}  "${c.note}"`);
  }
  console.log(`\nNext: node tools/preview.mjs goodvibesongs ${number}  → http://localhost:3003/goodvibesongs`);
}

main();
