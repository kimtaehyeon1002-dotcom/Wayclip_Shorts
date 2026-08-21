#!/usr/bin/env node
/**
 * 유튜브 댓글 스크린샷의 프사(좌상단 원형) + 닉네임(@핸들)을 가려 비식별화한다.
 * 굿바이브 하단 댓글 오버레이용. 날짜(2か月前 등)는 남기고 핸들 끝까지만 가린다.
 *
 * 표준 레시피 (2026-08-21 개정 — "자동 지오메트리 + 모자이크"):
 *   ① 스샷마다 **줄 높이(lineH)를 측정해 스케일을 스스로 판단**한다.
 *      (예전 레시피는 프사 90x90 / 닉 y6 h42 같은 2x 고정 좌표라, 1.3x·1.5x 스샷에서
 *       마스크가 헐겁게 덮이고 블러 강도도 상대적으로 약해져 핸들이 읽혔다 — 110 사례.)
 *   ② 마스크는 **측정한 실제 박스에 딱 맞게(타이트)**: 프사 bbox / 핸들 글자 bbox.
 *   ③ 강도는 **모자이크(블록) → 가우시안** 2단. 블록 크기 ≈ 글자 높이라 글자 형태가
 *      물리적으로 소멸하고, 뒤이은 가우시안이 블록 경계를 지워 깔끔하게 보인다.
 *      (가우시안만으로는 sigma 를 아무리 올려도 잔상 윤곽이 남아 "읽히는" 느낌이 난다.)
 *   ④ 프사 블러가 닉네임 블러보다 위 레이어. 날짜는 안 가림(핸들 끝까지만).
 *
 * 자동 측정 (measureCommentGeometry):
 *   - textLeft : 본문/액션(좋아요·返信) 줄들의 왼쪽 들여쓰기 x (중앙값) — 프사 폭의 기준
 *   - handle   : textLeft 오른쪽 첫 텍스트 줄 = 핸들 줄. 흰색(>200)만 잡히므로
 *                회색 날짜는 자동 제외 → 그 줄의 최대 x = handleEnd
 *   - avatar   : x<textLeft 영역의 배경(거의 검정)보다 밝은 픽셀 bbox
 *   - lineH    : 텍스트 줄 높이 중앙값 → sigma/block/feather/패딩이 전부 여기서 파생
 *
 * 사용법:
 *   node tools/blur-comments.mjs <image> [--out <path>]
 *        [--handle-end <x>] [--sigma N] [--block N] [--feather N]
 *        [--avatar-w N] [--avatar-h N] [--avatar-x N] [--avatar-y N]
 *        [--nick-x N] [--nick-y N] [--nick-h N]
 *        [--debug]        지오메트리 측정값만 출력
 *   플래그를 주면 그 값만 자동 측정값을 덮어쓴다. --out 생략 시 <image>.blur.png.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { execFileSync } from "node:child_process";

const WHITE = 200; // 닉네임=흰색 / 날짜=회색(~170) 경계. 내리면 날짜까지 먹으니 고정.
const DARK = 45; // 배경(#0f0f0f≈15)보다 확실히 밝은 = 프사 픽셀

function die(msg) {
  console.error(`✗ ${msg}`);
  process.exit(1);
}

function probeSize(file) {
  const out = execFileSync(
    "ffprobe",
    ["-v", "error", "-select_streams", "v:0", "-show_entries", "stream=width,height", "-of", "csv=p=0", file],
    { encoding: "utf8" }
  ).trim();
  const [w, h] = out.split(",").map((n) => parseInt(n, 10));
  if (!Number.isFinite(w) || !Number.isFinite(h)) throw new Error(`probe 실패: ${file}`);
  return { w, h };
}

function grayRaw(file) {
  const { w, h } = probeSize(file);
  const raw = execFileSync(
    "ffmpeg",
    ["-v", "error", "-i", file, "-vf", "format=gray", "-f", "rawvideo", "-pix_fmt", "gray", "-"],
    { maxBuffer: 1 << 28 }
  );
  return { w, h, raw };
}

// 밝은(>thresh) 픽셀이 있는 행들을 연속 구간(=텍스트 줄)으로 묶는다.
// x0 이상만 본다(프사 제외용). gap 3행 이상 비면 줄이 끊긴 것으로 본다.
function rowRuns(raw, w, h, { thresh = WHITE, x0 = 0, x1 = null } = {}) {
  const xe = x1 == null ? w : Math.min(w, x1);
  const runs = [];
  let cur = null;
  let gap = 0;
  for (let y = 0; y < h; y++) {
    let minx = Infinity;
    let maxx = -1;
    const row = y * w;
    for (let x = x0; x < xe; x++) {
      if (raw[row + x] > thresh) {
        if (x < minx) minx = x;
        maxx = x;
      }
    }
    if (maxx >= 0) {
      if (!cur) cur = { y0: y, y1: y, minx, maxx };
      else {
        cur.y1 = y;
        cur.minx = Math.min(cur.minx, minx);
        cur.maxx = Math.max(cur.maxx, maxx);
      }
      gap = 0;
    } else if (cur) {
      gap++;
      if (gap >= 3) {
        runs.push(cur);
        cur = null;
      }
    }
  }
  if (cur) runs.push(cur);
  return runs;
}

function median(nums) {
  const s = [...nums].sort((a, b) => a - b);
  if (!s.length) return null;
  const m = s.length >> 1;
  return s.length % 2 ? s[m] : Math.round((s[m - 1] + s[m]) / 2);
}

/**
 * 댓글 스샷 1장의 지오메트리를 측정한다. 스케일(레티나/1x/1.35x…) 무관.
 * 반환: { w, h, lineH, textLeft, handle:{x0,y0,x1,y1}, avatar:{x0,y0,x1,y1} }
 */
export function measureCommentGeometry(file) {
  const { w, h, raw } = grayRaw(file);

  // ① 1차 런: 전체 폭. 프사가 밝으면 첫 줄 minx 가 오염되므로 아래에서 중앙값으로 거른다.
  const runsAll = rowRuns(raw, w, h);
  const textRuns = runsAll.filter((r) => r.y1 - r.y0 + 1 >= 12); // 1~2px 잡티 제거
  if (textRuns.length === 0) throw new Error(`텍스트 줄 미검출: ${file}`);

  // ② textLeft = 들여쓰기. 핸들·본문·액션(좋아요/返信) 줄은 전부 같은 x 에서 시작한다.
  //    프사가 밝으면 그 줄의 minx 를 "작게"만 만들므로 **최댓값**이 참값이다.
  //    (중앙값은 밝은 프사가 여러 줄에 걸치면 같이 끌려 내려간다 — 105/107 사례.)
  const textLeft = Math.max(...textRuns.map((r) => r.minx));
  if (!Number.isFinite(textLeft) || textLeft <= 0) throw new Error(`textLeft 측정 실패: ${file}`);

  // ③ 텍스트 칼럼만 다시 런 → 첫 줄이 곧 핸들 줄 (프사 오염 없음).
  //    줄 높이도 반드시 여기서 잰다. 전체 폭 런은 세로로 긴 프사가 줄들을 이어붙여
  //    lineH 를 50↑ 로 뻥튀기시킨다(→ 마스크가 본문까지 덮음).
  const runsT = rowRuns(raw, w, h, { x0: Math.max(0, textLeft - 4) }).filter(
    (r) => r.y1 - r.y0 + 1 >= 10
  );
  if (!runsT.length) throw new Error(`핸들 줄 미검출: ${file}`);
  const handleRun = runsT[0];
  const bodyTop = runsT[1] ? runsT[1].y0 : h;
  const lineH = Math.max(10, Math.min(Math.round(h / 2), median(runsT.map((r) => r.y1 - r.y0 + 1)) || 26));

  // ④ 프사 bbox — textLeft 왼쪽에서 배경보다 밝은 픽셀.
  //    ⚠ 스레드 가이드선 같은 1~2px 세로 잔선이 이미지 전체 높이로 흐르는 스샷이 있다
  //      (110의 여러 장). 그래서 "그 행에 밝은 픽셀이 minRun 개 이상"인 행만 프사로 인정하고,
  //      그런 행들의 **가장 긴 연속 구간**만 취한다. 완전 검정 프사면 폴백.
  const avLimit = Math.max(1, textLeft - 6);
  const minRun = Math.max(6, Math.round(avLimit * 0.15));
  const rowsAv = [];
  for (let y = 0; y < h; y++) {
    const row = y * w;
    let cnt = 0;
    let minx = Infinity;
    let maxx = -1;
    for (let x = 0; x < avLimit; x++) {
      if (raw[row + x] > DARK) {
        cnt++;
        if (x < minx) minx = x;
        maxx = x;
      }
    }
    rowsAv.push(cnt >= minRun ? { minx, maxx } : null);
  }
  let best = null;
  let cur = null;
  for (let y = 0; y <= h; y++) {
    const r = y < h ? rowsAv[y] : null;
    if (r) {
      if (!cur) cur = { y0: y, y1: y, minx: r.minx, maxx: r.maxx };
      else {
        cur.y1 = y;
        cur.minx = Math.min(cur.minx, r.minx);
        cur.maxx = Math.max(cur.maxx, r.maxx);
      }
    } else if (cur) {
      if (!best || cur.y1 - cur.y0 > best.y1 - best.y0) best = cur;
      cur = null;
    }
  }
  const ax0 = best ? best.minx : Infinity;
  const ay0 = best ? best.y0 : Infinity;
  const ax1 = best ? best.maxx : -1;
  const ay1 = best ? best.y1 : -1;
  const avatarFound = ax1 >= 0 && ay1 - ay0 + 1 >= lineH * 0.8;
  // 유튜브 레이아웃상 프사가 반드시 차지하는 최소 영역 (검출 실패/부분검출 대비 하한).
  // 검출된 bbox 와 **합집합**을 쓴다 — 아스키아트 댓글처럼 프사 칼럼에 본문이
  // 삐져나온 스샷에서 검출 밴드가 짧게 끊겨 프사 아랫부분이 노출되는 걸 막는다.
  const floorBox = {
    x0: 0,
    y0: Math.max(0, handleRun.y0 - Math.round(lineH * 0.3)),
    x1: avLimit,
    y1: Math.min(h - 1, handleRun.y0 + Math.round(lineH * 2.1)),
  };
  const avatar = avatarFound
    ? {
        x0: 0,
        y0: Math.min(ay0, floorBox.y0),
        x1: ax1,
        y1: Math.max(ay1, floorBox.y1),
      }
    : floorBox;

  return {
    w,
    h,
    lineH,
    textLeft,
    avatarFound,
    handle: { x0: textLeft, y0: handleRun.y0, x1: handleRun.maxx, y1: handleRun.y1 },
    avatar,
    bodyTop,
  };
}

/**
 * 측정 지오메트리 → 실제 마스크 박스 + 강도. opts 로 개별 덮어쓰기 가능.
 */
export function planBlur(geo, opts = {}) {
  const lineH = geo.lineH;
  const feather = opts.feather ?? Math.max(3, Math.round(lineH * 0.12));
  const block = opts.block ?? Math.max(8, Math.round(lineH * 0.85));
  const sigma = opts.sigma ?? Math.max(8, Math.round(lineH * 0.6));
  const pad = Math.max(2, Math.round(lineH * 0.18));

  // 프사: 오른쪽은 본문 첫 글자를 절대 안 덮도록 페더 번짐까지 빼고 멈춘다.
  // (마스크는 그릴 때 1.5*feather 만큼 부풀리고 blur 하므로 총 번짐이 3*feather.)
  const avRight = Math.min(geo.avatar.x1 + pad, geo.textLeft - 3 * feather - 2);
  const avatarX = 0;
  const avatarY = Math.max(0, geo.avatar.y0 - pad);
  const avatarW = opts.avatarW ?? Math.max(1, avRight - avatarX);
  const avatarH = opts.avatarH ?? Math.max(1, Math.min(geo.h, geo.avatar.y1 + pad) - avatarY);

  // 닉네임: 핸들 글자 bbox + 패딩. 아래쪽은 본문 첫 줄과의 틈 절반까지만(번짐 방지).
  const nickX = opts.nickX ?? Math.max(0, geo.handle.x0 - Math.round(lineH * 0.35));
  const nickY = opts.nickY ?? Math.max(0, geo.handle.y0 - pad);
  const handleEnd = opts.handleEnd ?? geo.handle.x1 + Math.round(lineH * 0.3);
  const gapRoom = geo.bodyTop - 2 - 3 * feather - geo.handle.y1;
  const nickBottom = geo.handle.y1 + Math.max(2, Math.min(pad, gapRoom));
  const nickH = opts.nickH ?? Math.max(1, nickBottom - nickY);

  return {
    feather,
    block,
    sigma,
    avatarX: opts.avatarX ?? avatarX,
    avatarY: opts.avatarY ?? avatarY,
    avatarW,
    avatarH,
    nickX,
    nickY,
    nickH,
    handleEnd: Math.min(geo.w - 1, handleEnd),
  };
}

// 댓글 스샷 1장 블러. (다른 도구에서 import 해서 재사용)
// opts 를 아무것도 안 주면 전부 자동 측정. 주면 그 항목만 덮어쓴다.
export function blurComment(src, out, opts = {}) {
  const geo = measureCommentGeometry(src);
  const p = planBlur(geo, opts);

  const nw = Math.round(p.handleEnd - p.nickX);
  if (nw <= 0) throw new Error(`blurComment: handleEnd(${p.handleEnd}) <= nickX(${p.nickX})`);

  const sw = Math.max(1, Math.round(geo.w / p.block));
  const sh = Math.max(1, Math.round(geo.h / p.block));

  // ⚠ 마스크 박스는 그릴 때 grow 만큼 부풀린 뒤 blur 한다.
  //   흰 박스를 "그대로" blur 하면 박스가 얇을수록(닉 줄 ~35px, feather 5) 가장자리
  //   그라데이션이 박스 안쪽까지 파고들어 **내부 알파가 255 에 도달하지 못한다**
  //   → 원본 글자가 그대로 비쳐서, sigma 를 아무리 올려도 핸들이 읽혔다(110 사례의 진짜 원인).
  //   grow=1.5*feather 로 부풀리면 의도한 박스 전체가 알파 255 평지가 되고,
  //   페더 그라데이션은 박스 "바깥"으로만(총 3*feather) 나간다.
  const grow = Math.ceil(1.5 * p.feather);
  const box = (x, y, w, h) => `x=${x - grow}:y=${y - grow}:w=${w + 2 * grow}:h=${h + 2 * grow}`;
  const fc = [
    `[0:v]split=4[base][fb][fn][fa]`,
    // 모자이크(블록≈글자높이) → 가우시안. 글자 형태 소멸 + 블록 경계 정리.
    `[fb]scale=${sw}:${sh}:flags=area,scale=${geo.w}:${geo.h}:flags=neighbor,gblur=sigma=${p.sigma}:steps=3[bl]`,
    `[bl]split[bl1][bl2]`,
    // 닉네임 마스크 (검정 채우고 흰 박스 → 페더 → gray)
    `[fn]drawbox=x=0:y=0:w=iw:h=ih:color=black:t=fill,drawbox=${box(p.nickX, p.nickY, nw, p.nickH)}:color=white:t=fill,gblur=sigma=${p.feather},format=gray[mn]`,
    // 프사 마스크
    `[fa]drawbox=x=0:y=0:w=iw:h=ih:color=black:t=fill,drawbox=${box(p.avatarX, p.avatarY, p.avatarW, p.avatarH)}:color=white:t=fill,gblur=sigma=${p.feather},format=gray[ma]`,
    // 닉네임 블러(아래) → 프사 블러(위)
    `[bl1][mn]alphamerge[nk]`,
    `[base][nk]overlay=0:0[t]`,
    `[bl2][ma]alphamerge[av]`,
    `[t][av]overlay=0:0`,
  ].join(";");
  execFileSync("ffmpeg", ["-y", "-loglevel", "error", "-i", src, "-filter_complex", fc, out], {
    stdio: ["ignore", "ignore", "inherit"],
  });
  return { out, geo, plan: p };
}

function parseArgs(argv) {
  const opts = { out: null, debug: false };
  const positional = [];
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    const num = () => parseFloat(argv[++i]);
    if (a === "--handle-end") opts.handleEnd = num();
    else if (a === "--out") opts.out = argv[++i];
    else if (a === "--sigma") opts.sigma = num();
    else if (a === "--block") opts.block = num();
    else if (a === "--feather") opts.feather = num();
    else if (a === "--avatar-w") opts.avatarW = num();
    else if (a === "--avatar-h") opts.avatarH = num();
    else if (a === "--avatar-x") opts.avatarX = num();
    else if (a === "--avatar-y") opts.avatarY = num();
    else if (a === "--nick-x") opts.nickX = num();
    else if (a === "--nick-y") opts.nickY = num();
    else if (a === "--nick-h") opts.nickH = num();
    else if (a === "--debug") opts.debug = true;
    else if (a.startsWith("--")) die(`Unknown flag: ${a}`);
    else positional.push(a);
  }
  const [src] = positional;
  if (!src) die("Usage: node tools/blur-comments.mjs <image> [--out <path>] [--debug]");
  if (!fs.existsSync(src)) die(`Not found: ${src}`);
  if (!opts.out) {
    const ext = path.extname(src);
    opts.out = src.slice(0, -ext.length || undefined) + ".blur.png";
  }
  return { src, ...opts };
}

// 직접 실행 시 CLI
// ⚠ new URL(import.meta.url).pathname 은 퍼센트 인코딩("%20" 등)이라 한글/공백 경로에서
//   process.argv[1] 과 절대 일치하지 않는다 → CLI 가 조용히 아무것도 안 함. fileURLToPath 로 디코딩.
if (path.resolve(process.argv[1] || "") === path.resolve(fileURLToPath(import.meta.url))) {
  const { src, out, debug, ...opts } = parseArgs(process.argv.slice(2));
  if (debug) {
    const geo = measureCommentGeometry(src);
    console.log(JSON.stringify({ geo, plan: planBlur(geo, opts) }, null, 2));
    process.exit(0);
  }
  const { plan } = blurComment(src, out, opts);
  console.log(
    `✓ ${out}  (block=${plan.block} sigma=${plan.sigma} feather=${plan.feather} handleEnd=${plan.handleEnd})`
  );
}
