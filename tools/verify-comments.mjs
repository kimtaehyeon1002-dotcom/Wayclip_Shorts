#!/usr/bin/env node
/**
 * 댓글 폴더(`<번호>댓글/`) 검수 — **Claude 가 작업하면서 눈으로 확인하기 위한 도구.**
 *
 * 왜 필요한가 (2026-08-31):
 *   합성 렌더는 숫자로는 통과하는데 눈으로 보면 틀린 경우가 반복됐다
 *   (싫어요 아이콘 8px 밀림 / 글자 굵기 / 좋아요 수가 흰색 / 네이티브 2x 라 혼자 쨍함).
 *   전부 "총 폭·좌표는 ✓" 였다. 그래서 **한 장짜리 검수 시트를 만들어 실제로 본다.**
 *
 * 하는 일:
 *   ① 폴더의 모든 댓글 PNG 를 한 장의 시트(`_검수시트.png`)로 합친다 — 파일명·크기 라벨 포함
 *   ② 각 장을 채택본 코퍼스 비율과 대조해 표로 출력 (measure-comments 의 기준 그대로)
 *   ③ manifest.json 정합성 확인 (파일 누락 / 고아 파일 / 블러 좌표 유무)
 *   ④ `--ref <실제스샷>` 을 주면 첫 장과 겹쳐 본 오버레이(`_대조.png`)도 만든다
 *      (노랑=실제만, 파랑=렌더만, 흰색=일치)
 *
 * 사용법:
 *   node tools/verify-comments.mjs 118댓글
 *   node tools/verify-comments.mjs 118댓글 --ref ~/Desktop/스샷.png
 *     --no-sheet   시트 생성 생략 (표만)
 */
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { measure, corpusStats } from "./measure-comments.mjs";

const CHROME = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";

const argv = process.argv.slice(2);
const flag = (n, d) => { const i = argv.indexOf(`--${n}`); return i === -1 ? d : argv[i + 1]; };
const has = (n) => argv.includes(`--${n}`);

const VALUE_FLAGS = new Set(["ref"]);
const dir = argv.find((a, i) => {
  if (a.startsWith("--")) return false;
  const prev = argv[i - 1];
  return !(prev?.startsWith("--") && VALUE_FLAGS.has(prev.slice(2)));
});
if (!dir) { console.error("✗ 댓글 폴더를 지정할 것 — 예: node tools/verify-comments.mjs 118댓글"); process.exit(1); }
if (!fs.existsSync(dir)) { console.error(`✗ 없는 폴더: ${dir}`); process.exit(1); }

const pngs = fs.readdirSync(dir)
  .filter((f) => /\.png$/i.test(f) && !f.startsWith("_"))
  .sort();
if (!pngs.length) { console.error(`✗ ${dir} 에 PNG 가 없다`); process.exit(1); }

const probe = (f) => {
  const o = execFileSync("ffprobe", ["-v", "error", "-select_streams", "v:0",
    "-show_entries", "stream=width,height", "-of", "csv=p=0", f], { encoding: "utf8" }).trim();
  const [w, h] = o.split(",").map(Number);
  return { w, h };
};

// ── ① 검수 시트 ───────────────────────────────────────────────────────
// ffmpeg vstack 은 폭이 다르면 실패한다. 댓글은 폭이 제각각이라 HTML 로 쌓고 크롬으로 찍는다
// (라벨을 같이 그릴 수 있는 것도 이유 — 어느 장이 문제인지 바로 짚으려면 이름이 붙어야 한다).
function buildSheet() {
  const cells = pngs.map((f) => {
    const p = path.join(dir, f);
    const { w, h } = probe(p);
    const b64 = fs.readFileSync(p).toString("base64");
    return `<div class="row"><div class="lbl">${f.replace(/\.png$/, "")} <span>${w}×${h}</span></div>` +
           `<img src="data:image/png;base64,${b64}"></div>`;
  }).join("");
  const html = `<meta charset="utf-8"><style>
    body{margin:0;background:#000;font:12px -apple-system,sans-serif;color:#888;padding:10px}
    .row{margin-bottom:14px}
    .lbl{margin-bottom:3px;color:#7fd}
    .lbl span{color:#666;margin-left:8px}
    img{display:block;background:#111}
  </style>${cells}`;
  const tmp = path.join(dir, "_sheet.html");
  fs.writeFileSync(tmp, html);
  const out = path.join(dir, "_검수시트.png");
  // 높이는 넉넉히 잡고 크롬이 알아서 자르게 둔다 (내용이 넘치면 잘리므로 장수로 추정)
  const totalH = pngs.reduce((a, f) => a + probe(path.join(dir, f)).h + 34, 40);
  const maxW = Math.max(...pngs.map((f) => probe(path.join(dir, f)).w)) + 30;
  execFileSync(CHROME, ["--headless=new", "--disable-gpu", "--no-sandbox", "--hide-scrollbars",
    `--window-size=${Math.max(maxW, 420)},${totalH}`, `--screenshot=${out}`,
    `file://${encodeURI(path.resolve(tmp))}`], { stdio: "ignore" });
  fs.rmSync(tmp, { force: true });
  return out;
}

// ── ② 코퍼스 대조 ─────────────────────────────────────────────────────
const corpus = corpusStats();
const T = corpus.ratios;
const bgRef = corpus.bg[0][0];

console.log(`■ ${dir} — ${pngs.length}장  (기준: 채택본 ${corpus.count}장)\n`);
console.log(`  ${"파일".padEnd(30)} ${"크기".padEnd(10)} ${"배경".padEnd(10)} textLeft  프사폭  핸들→본문  아이콘  판정`);

let pass = 0;
const bad = [];
for (const f of pngs) {
  const p = path.join(dir, f);
  let m;
  try { m = measure(p); }
  catch (e) { console.log(`  ${f.slice(0, 28).padEnd(30)} 측정 실패 — ${e.message}`); bad.push([f, "측정 실패"]); continue; }
  // 판정 기준 = 코퍼스 사분위 범위를 반폭만큼 넓힌 밴드.
  // 측정값이 글자 내용에 따라 흔들리므로(lineH 를 글리프 잉크로 잰다) 고정 오차는 못 쓴다.
  const band = (k) => {
    const q = corpus.iqr[k];
    if (!q) return null;
    const pad = Math.max((q[1] - q[0]) * 0.5, 0.15);
    return [q[0] - pad, q[1] + pad];
  };
  const chk = (v, k) => {
    const b = band(k);
    if (v == null || !b) return "-";
    if (v >= b[0] && v <= b[1]) return "✓";
    const off = v < b[0] ? v - b[0] : v - b[1];
    return `✗${off > 0 ? "+" : ""}${off.toFixed(2)}`;
  };
  const cells = [
    chk(m.r.textLeft, "textLeft"), chk(m.r.avatarW, "avatarW"),
    chk(m.r.headToBody, "headToBody"), chk(m.r.iconH, "iconH"),
  ];
  const bgOk = m.bg.join(",") === bgRef;
  const ok = bgOk && cells.every((c) => c === "✓" || c === "-");
  if (ok) pass++; else bad.push([f, [...(bgOk ? [] : ["배경"]), ...cells.filter((c) => c.startsWith("✗"))].join(" ")]);
  console.log(`  ${f.slice(0, 28).padEnd(30)} ${`${m.w}×${m.h}`.padEnd(10)} ${(bgOk ? "✓" : m.bg.join(",")).padEnd(10)} ${cells[0].padEnd(9)} ${cells[1].padEnd(7)} ${cells[2].padEnd(10)} ${cells[3].padEnd(7)} ${ok ? "✓" : "✗"}`);
}
console.log(`\n  통과 ${pass}/${pngs.length}`);
if (bad.length) for (const [f, why] of bad) console.log(`    ✗ ${f} — ${why}`);

// ── ③ manifest 정합성 ─────────────────────────────────────────────────
const mfPath = path.join(dir, "manifest.json");
if (!fs.existsSync(mfPath)) {
  console.log(`\n  ⚠ manifest.json 이 없다 — prep-comments 가 note/블러좌표 없이 돌게 된다`);
} else {
  const mf = JSON.parse(fs.readFileSync(mfPath, "utf8"));
  const listed = new Set(mf.map((e) => e.file));
  const missing = mf.filter((e) => !fs.existsSync(path.join(dir, e.file))).map((e) => e.file);
  const orphan = pngs.filter((f) => !listed.has(f));
  const noGeo = mf.filter((e) => e.handleEnd == null).map((e) => e.file);
  console.log(`\n  manifest: ${mf.length}건` +
    (missing.length ? `\n    ✗ 파일 없음: ${missing.join(", ")}` : "") +
    (orphan.length ? `\n    ✗ manifest 에 없는 PNG: ${orphan.join(", ")}` : "") +
    (noGeo.length ? `\n    ⚠ 블러 좌표 없음(자동측정으로 넘어감): ${noGeo.join(", ")}` : "") +
    (!missing.length && !orphan.length && !noGeo.length ? "  ✓" : ""));
  const anchored = mf.filter((e) => e.anchor != null).length;
  console.log(`    anchor 지정: ${anchored}/${mf.length}` + (anchored === 0 ? "  (자막 확정 후 붙일 것)" : ""));
}

// ── ④ 시트 + 실제 스샷 오버레이 ───────────────────────────────────────
if (!has("no-sheet")) {
  const sheet = buildSheet();
  console.log(`\n  검수 시트 → ${sheet}   ← 이걸 직접 열어볼 것`);
}

const ref = flag("ref", null);
if (ref) {
  if (!fs.existsSync(ref)) { console.error(`  ✗ 없는 레퍼런스: ${ref}`); process.exit(1); }
  const first = path.join(dir, pngs[0]);
  const a = probe(ref), b = probe(first);
  const W = Math.max(a.w, b.w) + 10, H = Math.max(a.h, b.h) + 10;
  const out = path.join(dir, "_대조.png");
  execFileSync("ffmpeg", ["-v", "error", "-y", "-i", ref, "-i", first, "-filter_complex",
    `[0:v]format=gray,pad=${W}:${H}:0:0:black[a];[1:v]format=gray,pad=${W}:${H}:0:0:black[b];` +
    `[a][b]mergeplanes=0x001000:gbrp,scale=iw*3:ih*3:flags=neighbor`, out], { stdio: "ignore" });
  console.log(`  오버레이 → ${out}   (노랑=실제만 / 파랑=렌더만 / 흰색=일치)`);
}
