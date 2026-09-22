// 박힌 자막의 "글자만" 추출해 줄별 정확한 bbox + 표시 구간을 구한다.
// 원리: 자막은 구간 내내 고정, 뒤 영상은 움직임 → 프레임별 픽셀 최솟값을 취하면
//       글자 픽셀만 밝게 남고 배경은 어두워진다.
import { spawnSync } from "node:child_process";
import fs from "node:fs";

const SRC = "media/toteto-takarabe.mp4"; // 블러 전 원본(정규화본)
const RAW = "band.raw";
const W = 1080, CH = 160, Y0 = 900, FPS = 30;
if (!fs.existsSync(RAW)) {
  spawnSync("ffmpeg", ["-v", "error", "-i", SRC, "-vf", `crop=${W}:${CH}:0:${Y0},format=gray`, "-f", "rawvideo", "-y", RAW], { stdio: "inherit" });
}
const fd = fs.openSync(RAW, "r");
const FRAME = W * CH;
const N = Math.floor(fs.fstatSync(fd).size / FRAME);
const buf = Buffer.alloc(FRAME);
const readF = (f) => { fs.readSync(fd, buf, 0, FRAME, f * FRAME); return buf; };

// 씨앗 구간 (앞서 검출) — 안쪽으로 0.3s 들어간 구간으로 min 이미지를 만든다
const seeds = [
  [0.0, 4.17, "ふりそそいでね おひさま おでこ"],
  [4.63, 7.9, "ひんやりしてね まどあけて"],
  [9.23, 11.8, "そうやっていつでも"],
  [14.33, 16.2, "あおい朝だね"],
  [16.6, 18.47, "あしおと とてと"],
  [18.87, 23.43, "ぷらぷらと あるこう土手を"],
  [23.77, 28.07, "さらさらと わらうタンポポ"],
  [28.67, 32.87, "くよくよと してることも"],
  [33.4, 37.63, "そよそよと かぜがなでるの"],
  [38.17, 40.57, "ゆかいだね ゆかいだね"],
  [40.67, 43.13, "わくわくしていいんだよ"],
];

const results = [];
for (const [s, e, text] of seeds) {
  const f0 = Math.round((s + 0.35) * FPS), f1 = Math.round((e - 0.35) * FPS);
  const mn = new Uint8Array(FRAME).fill(255);
  for (let f = f0; f <= f1 && f < N; f++) {
    const b = readF(f);
    for (let i = 0; i < FRAME; i++) if (b[i] < mn[i]) mn[i] = b[i];
  }
  // 글자 마스크
  const idx = [];
  let x0 = 1e9, x1 = -1, y0 = 1e9, y1 = -1;
  // 자막은 항상 y937..1004(원본) 안. 그 밖은 배경이므로 제외. 임계값도 순백에 가깝게.
  const yA = 935 - Y0, yB = 1010 - Y0;
  const col = new Int32Array(W);
  for (let y = yA; y <= yB; y++) for (let x = 0; x < W; x++) if (mn[y * W + x] > 235) col[x]++;
  // 정지 배경(밝은 털 등)이 섞이므로, 열 클러스터로 나눠 픽셀이 가장 많은 덩어리 = 자막
  const clusters = [];
  let cur = null;
  for (let x = 0; x < W; x++) {
    if (col[x] > 0) { if (!cur) cur = { a: x, b: x, n: col[x] }; else { cur.b = x; cur.n += col[x]; } }
    else if (cur && x - cur.b > 45) { clusters.push(cur); cur = null; }
  }
  if (cur) clusters.push(cur);
  const main = clusters.reduce((m, c) => (!m || c.n > m.n ? c : m), null);
  x0 = main.a; x1 = main.b;
  for (let y = yA; y <= yB; y++) for (let x = x0; x <= x1; x++) {
    if (mn[y * W + x] > 235) { idx.push(y * W + x); if (y < y0) y0 = y; if (y > y1) y1 = y; }
  }
  // 구간 정밀화: 마스크 픽셀 중 밝은 비율 >= 0.55 인 프레임
  const ratio = (f) => { const b = readF(f); let n = 0; for (const i of idx) if (b[i] > 200) n++; return n / idx.length; };
  let ss = Math.round(s * FPS), ee = Math.round(e * FPS);
  while (ss > 0 && ratio(ss - 1) >= 0.55) ss--;
  while (ss < ee && ratio(ss) < 0.55) ss++;
  while (ee < N - 1 && ratio(ee + 1) >= 0.55) ee++;
  while (ee > ss && ratio(ee) < 0.55) ee--;
  results.push({ text, start: +(ss / FPS).toFixed(3), end: +((ee + 1) / FPS).toFixed(3), x0, x1, y0: y0 + Y0, y1: y1 + Y0, px: idx.length });
}
fs.closeSync(fd);

console.log("줄별 글자 bbox / 표시 구간");
for (const r of results) {
  console.log(`  ${r.start.toFixed(2)}–${r.end.toFixed(2)}  x${r.x0}..${r.x1} (w${r.x1 - r.x0 + 1})  y${r.y0}..${r.y1}  "${r.text}"`);
}
fs.writeFileSync("subs.json", JSON.stringify(results, null, 2));
