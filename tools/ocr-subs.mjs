#!/usr/bin/env node
/**
 * 레퍼런스 영상에 **박혀 있는 자막**을 읽어 SRT 로 뽑는다
 * (굿무비 "레퍼런스 + 원본 2개 입력" 워크플로 R-3 단계).
 *
 * 오디오 STT 가 아니다 — 화면 픽셀이 권위. whisper 는 타이밍도 표기도 화면 자막과 다르다.
 *
 *   1) 자막 줄 위치 자동 검출: "가끔만 밝은" 행 = 자막(항상 밝은 흰 밴드나 항상 어두운 영상과 구분).
 *      한 화면에 원어/번역 2줄이 있으면 **위쪽 줄이 원어** → --band 로 선택 (default 0 = 맨 위).
 *   2) 큐 경계: 그 줄의 밝은 픽셀 수가 임계 이상인 구간 = 자막 노출 구간. 구간 내 마스크가
 *      크게 바뀌면 큐가 갈린 것으로 본다.
 *   3) 각 큐 중앙 프레임을 잘라 macOS Vision 으로 OCR (tesseract 불필요).
 *
 * 사용법:
 *   node tools/ocr-subs.mjs <영상> [옵션]
 *
 * 옵션:
 *   --crop w:h:x:y   자막 줄 영역을 직접 지정 (자동 검출 생략)
 *   --band <n>       자동 검출된 자막 줄 중 n 번째 (0 = 맨 위 = 원어, default 0)
 *   --luma <n>       글자로 볼 밝기 임계 (default 215)
 *   --on <n>         자막 있음으로 볼 픽셀 수 (default 80)
 *   --gap <s>        이보다 짧은 공백은 같은 큐로 잇는다 (default 0.1)
 *   --min-cue <s>    이보다 짧은 큐는 버린다 (default 0.15)
 *   --offset <s>     출력 타임스탬프에 더할 값 (default 0)
 *   --out <path>     SRT 저장 경로 (default: <영상이름>.srt)
 *   --keep           디버그용으로 큐 크롭 PNG 를 남긴다
 */
import { spawnSync } from "node:child_process";
import { writeFileSync, mkdtempSync, rmSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const die = (m) => { console.error(`✗ ${m}`); process.exit(1); };
const even = (n) => n - (n % 2);

function parseArgs(argv) {
  const pos = [], opt = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a.startsWith("--")) { const n = a.slice(2); opt[n] = (argv[i + 1] && !argv[i + 1].startsWith("--")) ? argv[++i] : true; }
    else pos.push(a);
  }
  return { pos, opt };
}

function ff(args) {
  const r = spawnSync("ffmpeg", args, { maxBuffer: 1 << 30 });
  if (r.status !== 0) die(`ffmpeg 실패:\n${r.stderr}`);
  return r.stdout;
}
function probe(file) {
  const r = spawnSync("ffprobe", ["-v", "error", "-select_streams", "v:0",
    "-show_entries", "stream=width,height,r_frame_rate,nb_frames", "-show_entries", "format=duration",
    "-of", "default=noprint_wrappers=1:nokey=0", file]);
  const o = Object.fromEntries(r.stdout.toString().trim().split("\n").map(l => l.split("=")));
  const [num, den] = o.r_frame_rate.split("/").map(Number);
  return { W: +o.width, H: +o.height, fps: num / den, dur: +o.duration };
}

/** 가끔만 밝은 행 = 자막 줄. [{y0,y1}] 을 위에서 아래로 */
function findBands(file, { W, H, dur }, luma) {
  // setpts=PTS-STARTPTS: start_time 이 0 이 아닌 파일에서 fps 필터가 t=0 을 메우려고
  // 맨 앞 프레임을 복제해 넣는 걸 막는다 (그러면 큐 시각이 통째로 한 프레임 밀린다).
  const raw = ff(["-v", "error", "-i", file, "-vf", "setpts=PTS-STARTPTS,fps=8", "-f", "rawvideo", "-pix_fmt", "gray", "-"]);
  const F = Math.floor(raw.length / (W * H));
  const hits = new Int32Array(H);
  for (let f = 0; f < F; f++) {
    const o = f * W * H;
    for (let y = 0; y < H; y++) {
      let c = 0;
      for (let x = 0; x < W; x++) if (raw[o + y * W + x] > luma) c++;
      if (c > 3) hits[y]++;
    }
  }
  const isText = (y) => hits[y] > F * 0.08 && hits[y] < F * 0.92; // 가끔만 = 자막
  const bands = [];
  let start = -1;
  for (let y = 0; y <= H; y++) {
    if (y < H && isText(y)) { if (start < 0) start = y; }
    else if (start >= 0) { if (y - start >= 6) bands.push({ y0: start, y1: y - 1 }); start = -1; }
  }
  // 6px 이내로 붙은 조각 병합 (글자 상·하부)
  const merged = [];
  for (const b of bands) {
    const last = merged[merged.length - 1];
    if (last && b.y0 - last.y1 <= 6) last.y1 = b.y1; else merged.push({ ...b });
  }
  return merged;
}

function detectCues(file, crop, { fps }, luma, onPx, gap, minCue) {
  const [cw, ch] = crop.split(":").map(Number);
  if (cw % 2 || ch % 2) die(`crop 은 짝수여야 한다 (받은 값 ${cw}x${ch}) — ffmpeg 가 내림해 큐 타임스탬프가 드리프트한다`);
  const raw = ff(["-v", "error", "-i", file, "-vf", `crop=${crop},setpts=PTS-STARTPTS,fps=${fps}`, "-f", "rawvideo", "-pix_fmt", "gray", "-"]);
  const N = cw * ch;
  if (raw.length % N) die(`프레임 바이트 정렬 실패 (${raw.length} % ${N} ≠ 0) — crop 을 확인할 것`);
  const F = raw.length / N;
  const on = [], masks = [];
  for (let f = 0; f < F; f++) {
    const o = f * N; const m = new Uint8Array(N); let c = 0;
    for (let i = 0; i < N; i++) if (raw[o + i] > luma) { m[i] = 1; c++; }
    on.push(c > onPx); masks.push(m);
  }
  // 짧은 공백 잇기
  const gapF = Math.round(gap * fps);
  for (let i = 0; i < F; i++) {
    if (on[i]) continue;
    let j = i; while (j < F && !on[j]) j++;
    if (i > 0 && j < F && j - i <= gapF) for (let k = i; k < j; k++) on[k] = true;
    i = j;
  }
  const cues = [];
  for (let i = 0; i < F; i++) {
    if (!on[i]) continue;
    let j = i; while (j < F && on[j]) j++;
    // 구간 내 내용 급변 = 큐 분할
    let seg = i;
    for (let k = i + 1; k < j; k++) {
      let d = 0; const a = masks[k], b = masks[k - 1];
      for (let p = 0; p < N; p++) if (a[p] !== b[p]) d++;
      if (d > N * 0.05) { if ((k - seg) / fps >= minCue) cues.push([seg / fps, k / fps]); seg = k; }
    }
    if ((j - seg) / fps >= minCue) cues.push([seg / fps, j / fps]);
    i = j;
  }
  return cues;
}

function ocr(files) {
  const r = spawnSync("swift", [path.join(path.dirname(fileURLToPath(import.meta.url)), "assets", "vision-ocr.swift"), ...files],
    { maxBuffer: 1 << 28 });
  if (r.status !== 0) die(`Vision OCR 실패 (swift 필요):\n${r.stderr}`);
  const byFile = new Map();
  for (const e of JSON.parse(r.stdout.toString())) byFile.set(e.file, e.lines);
  return files.map(f => (byFile.get(f) ?? []).join(" ").trim());
}

const ts = (s) => {
  const h = Math.floor(s / 3600), m = Math.floor(s / 60) % 60, sec = Math.floor(s % 60), ms = Math.round((s % 1) * 1000);
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(sec).padStart(2, "0")},${String(ms).padStart(3, "0")}`;
};

function main() {
  const { pos, opt } = parseArgs(process.argv.slice(2));
  if (!pos.length) die("사용법: node tools/ocr-subs.mjs <영상> [--crop w:h:x:y] [--band 0]");
  const file = pos[0];
  const luma = Number(opt.luma ?? 215), onPx = Number(opt.on ?? 80);
  const gap = Number(opt.gap ?? 0.1), minCue = Number(opt["min-cue"] ?? 0.15);
  const offset = Number(opt.offset ?? 0);
  const outPath = opt.out ?? file.replace(/\.[^.]+$/, "") + ".srt";
  const meta = probe(file);

  let crop = typeof opt.crop === "string" ? opt.crop : null;
  if (!crop) {
    console.error("자막 줄 자동 검출…");
    const bands = findBands(file, meta, luma);
    if (!bands.length) die("자막 줄을 찾지 못했다 — --crop 으로 직접 지정할 것");
    bands.forEach((b, i) => console.error(`  [${i}] y ${b.y0}–${b.y1} (높이 ${b.y1 - b.y0 + 1})`));
    const b = bands[Number(opt.band ?? 0)];
    if (!b) die(`--band ${opt.band} 없음 (검출 ${bands.length}개)`);
    const pad = 5;
    // ⚠️ crop 은 짝수여야 한다 — 홀수를 주면 ffmpeg 가 조용히 내림해서
    //    프레임 바이트 수가 어긋나고 큐 타임스탬프가 통째로 드리프트한다.
    const y0 = even(Math.max(0, b.y0 - pad));
    const y1 = Math.min(meta.H - 1, b.y1 + pad);
    crop = `${even(meta.W)}:${even(y1 - y0 + 1)}:0:${y0}`;
    console.error(`  → 사용: crop=${crop}`);
  }

  const cues = detectCues(file, crop, meta, luma, onPx, gap, minCue);
  if (!cues.length) die("큐를 찾지 못했다 — --on / --luma 조정");
  console.error(`큐 ${cues.length}개 검출 — OCR…`);

  const dir = opt.keep ? path.join(path.dirname(outPath), "ocr-cues") : mkdtempSync(path.join(tmpdir(), "ocrsub-"));
  if (opt.keep) mkdirSync(dir, { recursive: true });
  const imgs = cues.map(([a, b], i) => {
    const p = path.join(dir, `${String(i + 1).padStart(2, "0")}.png`);
    ff(["-v", "error", "-ss", String((a + b) / 2), "-i", file, "-frames:v", "1",
      "-vf", `crop=${crop},scale=iw*2:ih*2:flags=lanczos`, p, "-y"]);
    return p;
  });
  const texts = ocr(imgs);
  if (!opt.keep) rmSync(dir, { recursive: true, force: true });

  const srt = cues.map(([a, b], i) =>
    `${i + 1}\n${ts(a + offset)} --> ${ts(b + offset)}\n${texts[i] || "???"}\n`).join("\n");
  writeFileSync(outPath, srt);

  console.log();
  for (const [i, [a, b]] of cues.entries())
    console.log(`  ${String(i + 1).padStart(2)}  ${a.toFixed(3).padStart(7)}→${b.toFixed(3).padEnd(7)}  ${texts[i] || "??? (OCR 실패)"}`);
  console.log(`\n→ ${outPath}`);
  if (texts.some(t => !t)) console.log("⚠️  OCR 실패한 큐 있음 — --keep 로 크롭을 남겨 눈으로 확인할 것");
}

main();
