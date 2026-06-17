#!/usr/bin/env node
/**
 * check-captions.mjs — 렌더 전 자막/상단멘트 줄 깨짐(가로 오버플로) 사전 감지.
 * (HyperFrames 판의 advance 추정기 그대로 — 입력만 props.json + channels.mjs 레이아웃 상수로 변경)
 *
 *   node tools/check-captions.mjs videos/<channel>/<number>
 *
 * 왜: 상단멘트/자막 한 줄이 영역 폭보다 길면 자동 줄바꿈돼 채널 룰(상단멘트 최대 2줄 등)을
 *     깨고 단어가 중간에 잘린다. 렌더 전에 "이 줄은 넘칠 것 같다"를 추정해 플래그.
 *
 * 동작: 폰트 메트릭 없이 글자별 advance(em) 가중치로 줄 폭을 보수적으로 추정. 경계선은 통과(과검출↓).
 * 종료코드: 상단멘트가 넘칠 것으로 추정되면 1, 아니면 0. (자막은 정보성 경고만)
 */
import { readFileSync, existsSync } from "node:fs";
import { join, resolve } from "node:path";
import { CANVAS_W, captionLayouts } from "./channels.mjs";

// 글자별 advance 폭(em, font-size 1 기준). 보수적(살짝 넓게).
function charAdvance(ch) {
  const c = ch.codePointAt(0);
  if ((c >= 0x0300 && c <= 0x036f) || (c >= 0x0e30 && c <= 0x0e3a) ||
      (c >= 0x0e47 && c <= 0x0e4e) || c === 0x0e31) return 0;
  if ((c >= 0x4e00 && c <= 0x9fff) || (c >= 0x3400 && c <= 0x4dbf)) return 1.0;
  if ((c >= 0x3040 && c <= 0x30ff)) return 0.95;
  if ((c >= 0xac00 && c <= 0xd7a3) || (c >= 0x1100 && c <= 0x11ff) ||
      (c >= 0x3130 && c <= 0x318f)) return 1.0;
  if ((c >= 0x3000 && c <= 0x303f) || (c >= 0xff00 && c <= 0xffef)) return 0.5;
  if (c >= 0x0e00 && c <= 0x0e7f) return 0.6;
  if (ch === " ") return 0.27;
  if (/[A-Z]/.test(ch)) return 0.62;
  if (/[a-z]/.test(ch)) return 0.5;
  if (/[0-9]/.test(ch)) return 0.55;
  if (/[.,:;!?'’`|]/.test(ch)) return 0.28;
  if (/[()\[\]{}<>\/\\"“”]/.test(ch)) return 0.34;
  if (ch === "-" || ch === "—") return 0.5;
  return 0.6;
}

function estimateLineEm(text) {
  // 마크업 마커([[ ]] ** **)는 폭 계산에서 제외
  const clean = String(text).replace(/\[\[|\]\]|\*\*/g, "");
  let em = 0;
  for (const ch of clean) em += charAdvance(ch);
  return em;
}

function die(msg, code = 2) {
  console.error(`✗ ${msg}`);
  process.exit(code);
}

function main() {
  const dir = resolve(process.argv[2] || "");
  const propsPath = join(dir, "props.json");
  const metaPath = join(dir, "meta.json");
  if (!existsSync(propsPath)) die(`props.json 없음: ${propsPath}`);
  if (!existsSync(metaPath)) die(`meta.json 없음: ${metaPath}`);

  const props = JSON.parse(readFileSync(propsPath, "utf8"));
  const meta = JSON.parse(readFileSync(metaPath, "utf8"));
  const channel = meta.channel;
  const layout = captionLayouts[channel];
  if (!layout) die(`알 수 없는 채널: ${channel}`);

  // ── 상단 멘트 ──
  const topAvail = CANVAS_W - layout.top.padL - layout.top.padR;
  const topFs = layout.top.fontPx;
  const topText = String(props.topCaption || "").replace(/\\n/g, "\n");
  const topLines = topText.split("\n").map((s) => s.trim()).filter(Boolean).slice(0, layout.top.maxLines);

  let topOverflow = false;
  console.log(`\n▸ 상단멘트  (영역폭 ${Math.round(topAvail)}px, 폰트 ${Math.round(topFs)}px)  [${channel}]`);
  if (!topLines.length) console.log("  (비어있음)");
  const lineSizes = Array.isArray(props.topCaptionLineSizes) ? props.topCaptionLineSizes : null;
  topLines.forEach((line, i) => {
    // 줄별 pt 오버라이드가 있으면 px(=pt×4/3)로 환산해 사용, 없으면 채널 기본 fontPx.
    const ovPt = lineSizes && typeof lineSizes[i] === "number" ? lineSizes[i] : null;
    const fs = ovPt != null ? ovPt * (4 / 3) : topFs;
    const estPx = estimateLineEm(line) * fs;
    const over = estPx > topAvail * 1.0;
    if (over) topOverflow = true;
    console.log(`  ${over ? "⚠ 넘침" : "✓"}  L${i + 1}: "${line}"`);
    console.log(`        추정 ${Math.round(estPx)}px / ${Math.round(topAvail)}px`);
  });

  // ── 자막 (정보성) ──
  if (layout.caption && Array.isArray(props.captions) && props.captions.length) {
    const subAvail = CANVAS_W - layout.caption.zoneL - layout.caption.zoneR;
    const fs = layout.caption.fontPx;
    const warn = [];
    for (const cap of props.captions) {
      for (const field of ["original", "translation"]) {
        const text = cap[field];
        if (!text) continue;
        const segs = String(text).split(/\\n|\n/);
        const estPx = Math.max(...segs.map((s) => estimateLineEm(s) * fs));
        if (estPx > subAvail * 1.0) warn.push({ field, text, estPx });
      }
    }
    if (warn.length) {
      console.log(`\n▸ 자막 (참고 — 한 줄 폭 ${Math.round(subAvail)}px 초과 → 2줄로 래핑됨)`);
      for (const w of warn) console.log(`  · ${w.field}: "${w.text}"  (추정 ${Math.round(w.estPx)}px)`);
      console.log("  ※ 2줄 래핑이 허용될 수 있음. 의도와 다르면 props.json captions 라인을 짧게 나눌 것.");
    }
  }

  // ── 결론 ──
  console.log("");
  if (topOverflow) {
    console.log("⚠ 상단멘트 줄이 영역을 넘칠 것으로 추정됩니다.");
    console.log("  → 사용자에게 물어볼 것: (1) 그 줄만 폰트 축소  (2) 문구 변경  (3) 두 줄로 분리");
    process.exit(1);
  }
  console.log("✓ 상단멘트 오버플로 없음.");
  process.exit(0);
}

main();
