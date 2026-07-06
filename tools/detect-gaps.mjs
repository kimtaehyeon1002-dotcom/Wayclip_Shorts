#!/usr/bin/env node
/**
 * detect-gaps.mjs — STT 무보컬(간주) 구간 자동 검출.
 *
 * 문제: 음악 STT 에서 whisper 는 보컬이 없는 간주 위에도 토큰을 만들어낸다(환각).
 *       특히 한 글자(모라)를 1초 안팎으로 "늘려서" 채우는 패턴 → 간주에 자막이 연속으로 떠버림.
 *       (예: 088 秒針を噛む 의 さ/す/が(각 ~1s), う/ま/い(각 ~1.3s) = 샤모지 간주 구간)
 *
 * 신호 (새 의존성 0 — 기존 transcript.json 의 토큰 타이밍만 사용):
 *   ① held: 토큰 길이 / 글자수 ≥ hold (기본 0.9s/글자). 정상 발화는 ~0.1–0.4s/글자.
 *   ② 깨진 토큰: 공백/대체문자(�)만 있는 토큰.
 *   ③ inter-token 침묵: 토큰 사이 갭 ≥ minGap (기본 1.0s).
 * 위 중 하나라도 걸리면 그 구간을 "무보컬(blank)" 로 본다. 인접 동급 구간은 병합.
 *
 * transcribe.mjs 가 STT 직후 자동 호출(analyzeGaps/printGapReport export).
 * CLI 로도 단독 실행 가능 — props 에 자동으로 쓰지 않고 "제안"만 한다.
 *   node tools/detect-gaps.mjs videos/goodvibesongs/088            # 디렉토리의 transcript.json
 *   node tools/detect-gaps.mjs <transcript.json> [--hold 0.9] [--min-gap 1.0] [--srt 088자막.srt]
 */
import fs from "node:fs";
import path from "node:path";

const HOLD_DEFAULT = 0.9;   // s/글자 — 이 이상이면 "늘린 환각" 으로 본다
const MIN_GAP_DEFAULT = 1.0; // s — 토큰 사이 이 이상 침묵이면 무보컬

function die(msg) { console.error(`✗ ${msg}`); process.exit(1); }

// 글자수(모라 근사): 공백 제외한 코드포인트 수. 일본어/한국어는 띄어쓰기 영향 적음.
function charLen(text) {
  return [...text.replace(/\s+/g, "")].length;
}
function isBroken(text) {
  const t = text.replace(/\s+/g, "");
  return t.length === 0 || /^[�]+$/.test(t); // 빈 토큰 또는 대체문자만
}

// 인접 동급(kind) span 병합.
function mergeSpans(spans) {
  const out = [];
  for (const s of spans) {
    const last = out[out.length - 1];
    if (last && last.kind === s.kind && s.start - last.end < 0.05) {
      last.end = s.end;
      if (s.text) last.text = (last.text || "") + s.text;
    } else {
      out.push({ ...s });
    }
  }
  return out;
}

// 토큰 배열 → {vocal[], gaps[], totalEnd}. (transcribe.mjs 와 CLI 공용)
export function analyzeGaps(tokens, { hold = HOLD_DEFAULT, minGap = MIN_GAP_DEFAULT } = {}) {
  const raw = [];
  let prevEnd = null;
  for (const tok of tokens) {
    if (prevEnd != null && tok.start - prevEnd >= minGap) {
      raw.push({ start: prevEnd, end: tok.start, kind: "gap", reason: "silence" });
    }
    const cl = Math.max(1, charLen(tok.text));
    const perChar = (tok.end - tok.start) / cl;
    let kind = "vocal", reason = "";
    if (isBroken(tok.text)) { kind = "gap"; reason = "broken"; }
    else if (perChar >= hold) { kind = "gap"; reason = `held ${perChar.toFixed(2)}s/字`; }
    raw.push({ start: tok.start, end: tok.end, kind, reason, text: tok.text });
    prevEnd = tok.end;
  }
  const spans = mergeSpans(raw);
  return {
    spans,
    vocal: spans.filter((s) => s.kind === "vocal"),
    gaps: spans.filter((s) => s.kind === "gap"),
    totalEnd: tokens.length ? tokens[tokens.length - 1].end : 0,
  };
}

// 보기 좋은 리포트 출력. (transcribe 자동실행 / CLI 공용)
export function printGapReport({ vocal, gaps, totalEnd }, { tokenCount, hold = HOLD_DEFAULT, minGap = MIN_GAP_DEFAULT } = {}) {
  console.log(`\n▸ 무보컬 구간 검출 (hold≥${hold}s/字, gap≥${minGap}s · 총 ${totalEnd.toFixed(2)}s, 토큰 ${tokenCount ?? "?"})`);
  if (!gaps.length) {
    console.log("  (검출된 무보컬 구간 없음 — 전 구간 보컬로 추정)");
    return;
  }
  console.log("  ── 무보컬 gap (자막 비울 곳) ──");
  for (const s of gaps) console.log(`   ${s.start.toFixed(2)}–${s.end.toFixed(2)}s  (${s.reason || "silence"})`);
  console.log("  ── 보컬 span (자막 둘 곳) ──");
  for (const s of vocal) console.log(`   ${s.start.toFixed(2)}–${s.end.toFixed(2)}s  "${(s.text || "").trim()}"`);
  console.log("  ⓘ 위 gap 구간엔 caption 을 두지 말 것(공백) — 간주에 자막 연속 방지. (제안일 뿐, props 자동수정 안 함)");
}

// ── 이하 CLI 전용 (SRT 정답 비교 검증) ──
function parseSrtGaps(srtPath, totalEnd) {
  const raw = fs.readFileSync(srtPath, "utf8");
  const cues = [];
  const re = /(\d\d):(\d\d):(\d\d),(\d\d\d)\s*-->\s*(\d\d):(\d\d):(\d\d),(\d\d\d)/g;
  let m;
  while ((m = re.exec(raw))) {
    const s = (+m[1]) * 3600 + (+m[2]) * 60 + (+m[3]) + (+m[4]) / 1000;
    const e = (+m[5]) * 3600 + (+m[6]) * 60 + (+m[7]) + (+m[8]) / 1000;
    cues.push([s, e]);
  }
  cues.sort((a, b) => a[0] - b[0]);
  const gaps = [];
  let cursor = 0;
  for (const [s, e] of cues) {
    if (s - cursor >= 0.3) gaps.push([+cursor.toFixed(2), +s.toFixed(2)]);
    cursor = Math.max(cursor, e);
  }
  if (totalEnd - cursor >= 0.3) gaps.push([+cursor.toFixed(2), +totalEnd.toFixed(2)]);
  return gaps;
}
const overlap = (a, b) => Math.max(0, Math.min(a[1], b[1]) - Math.max(a[0], b[0]));

function main() {
  const argv = process.argv.slice(2);
  let input = null, hold = HOLD_DEFAULT, minGap = MIN_GAP_DEFAULT, srt = null;
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--hold") hold = parseFloat(argv[++i]);
    else if (a === "--min-gap") minGap = parseFloat(argv[++i]);
    else if (a === "--srt") srt = argv[++i];
    else if (!a.startsWith("--")) input = a;
    else die(`Unknown flag: ${a}`);
  }
  if (!input) die("Usage: node tools/detect-gaps.mjs <videoDir|transcript.json> [--hold 0.9] [--min-gap 1.0] [--srt file]");

  let tPath = input;
  if (fs.statSync(input).isDirectory()) tPath = path.join(input, "transcript.json");
  if (!fs.existsSync(tPath)) die(`transcript.json 없음: ${tPath}`);
  const tokens = JSON.parse(fs.readFileSync(tPath, "utf8"));
  if (!Array.isArray(tokens) || !tokens.length) die("transcript 가 비었거나 토큰 배열이 아님");

  const result = analyzeGaps(tokens, { hold, minGap });
  console.log(`\n▸ detect-gaps  ${path.relative(process.cwd(), tPath)}`);
  printGapReport(result, { tokenCount: tokens.length, hold, minGap });

  if (srt) {
    const truth = parseSrtGaps(srt, result.totalEnd);
    console.log(`\n  ── SRT 정답 갭 대비 검증 (${path.basename(srt)}) ──`);
    let hit = 0;
    for (const g of truth) {
      const cov = result.gaps.reduce((acc, dg) => acc + overlap(g, [dg.start, dg.end]), 0);
      const pct = ((cov / (g[1] - g[0])) * 100).toFixed(0);
      if (cov / (g[1] - g[0]) >= 0.5) hit++;
      console.log(`   정답 ${g[0]}–${g[1]}s  →  검출 커버 ${pct}%  ${pct >= 50 ? "✓" : "✗(놓침)"}`);
    }
    console.log(`\n   정답 갭 ${truth.length}개 중 ${hit}개 검출 (≥50% 커버 기준)`);
  }
  console.log("");
}

// 직접 실행 시에만 CLI (import 시엔 함수만 노출)
if (path.resolve(process.argv[1] || "") === path.resolve(new URL(import.meta.url).pathname)) {
  main();
}
