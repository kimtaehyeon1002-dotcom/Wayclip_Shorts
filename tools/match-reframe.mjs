#!/usr/bin/env node
/**
 * 레퍼런스가 샷마다 어떻게 **리프레임(줌/팬)** 했는지 역산한다
 * (굿무비 "레퍼런스 + 원본 2개 입력" 워크플로 R-2b 단계).
 *
 * 왜 필요한가: 원본은 2.4:1 인데 채널 영상 밴드는 1.125:1(굿무비 1080×960) 이라
 * 가로를 절반 넘게 잘라내야 한다. 가운데를 기계적으로 자르면 말하는 얼굴이 잘린다.
 * 레퍼런스 편집자는 이미 샷마다 답을 내놨으니 **그 크롭을 되찾아 그대로 따르는 게 최선**이다.
 *
 * 방법: 레퍼런스 밴드 프레임을 원본 프레임 위에서 (크기 × 위치) 격자탐색해 SAD 최소점을 찾는다.
 * 샷당 여러 지점을 재고 중앙값을 쓴다.
 *
 * 사용법:
 *   node tools/match-reframe.mjs <cuts.json> [옵션]
 *
 * 옵션:
 *   --band <W>x<H>   목표 밴드 크기 (default 1080x960 = 굿무비/레디액션)
 *   --fit height|width   레퍼런스 크롭에서 무엇을 맞출지 (default height — 세로 프레이밍 존중, 좌우를 자름)
 *   --probes <n>     샷당 표본 프레임 수 (default 3)
 *   --out <path>     결과 JSON (default: <cuts.json 이름>.reframe.json)
 *
 * 출력 JSON: { band, shots:[{start,end,srcCrop,bandCrop,centerX,sad}], cropExpr }
 *   cropExpr 는 apply-cuts 의 --reframe 에 그대로 넘길 수 있는 ffmpeg crop 식.
 */
import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { die, even, ff, parseArgs, str, probe, grayFrames } from "./vidutil.mjs";

const RW = 96;

/** 한 프레임에서 레퍼런스 밴드가 원본의 어느 사각형인지 격자탐색 */
function findRect(refFile, origFile, refT, origT, refCrop, origCrop, refAspect, OW, OH) {
  const RH = even(Math.round(RW / refAspect));
  const R = ff(["-v", "error", "-ss", String(refT), "-i", refFile, "-frames:v", "1",
    "-vf", `${refCrop ? `crop=${refCrop},` : ""}scale=${RW}:${RH}`, "-f", "rawvideo", "-pix_fmt", "gray", "-"]).stdout;
  const O = ff(["-v", "error", "-ss", String(origT), "-i", origFile, "-frames:v", "1",
    "-vf", `${origCrop ? `crop=${origCrop},` : ""}scale=${OW}:${OH}`, "-f", "rawvideo", "-pix_fmt", "gray", "-"]).stdout;
  if (R.length < RW * RH || O.length < OW * OH) return null;
  let best = null;
  for (let cw = Math.round(OW * 0.35); cw <= OW; cw += 4) {
    const ch = Math.round(cw / refAspect);
    if (ch > OH) continue;
    for (let x = 0; x + cw <= OW; x += 2) for (let y = 0; y + ch <= OH; y += 2) {
      let sad = 0, n = 0;
      for (let j = 0; j < RH; j += 2) {
        const sy = y + ((j * ch / RH) | 0);
        for (let i = 0; i < RW; i += 2) { sad += Math.abs(O[sy * OW + x + ((i * cw / RW) | 0)] - R[j * RW + i]); n++; }
      }
      sad /= n;
      if (!best || sad < best.sad) best = { cw, ch, x, y, sad };
    }
  }
  return best;
}

const median = (a) => { const s = [...a].sort((x, y) => x - y); return s[s.length >> 1]; };

function main() {
  const { pos, opt } = parseArgs(process.argv.slice(2));
  if (!pos.length) die("사용법: node tools/match-reframe.mjs <cuts.json> [--band 1080x960]");
  const cfg = JSON.parse(readFileSync(pos[0], "utf8"));
  const [bandW, bandH] = String(opt.band ?? "1080x960").split("x").map(Number);
  const fit = (opt.fit === "width") ? "width" : "height";
  const probes = Number(opt.probes ?? 3);
  const outPath = str(opt.out) ?? pos[0].replace(/\.json$/, "") + ".reframe.json";

  const refCrop = cfg.crop, origCrop = cfg.origCrop;
  const [rcW, rcH] = refCrop ? refCrop.split(":").map(Number) : [probe(cfg.reference).W, probe(cfg.reference).H];
  const refAspect = rcW / rcH;
  const [ocW, ocH] = origCrop ? origCrop.split(":").map(Number) : [probe(cfg.original).W, probe(cfg.original).H];
  const OW = 480, OH = even(Math.round(OW * ocH / ocW));
  const k = ocW / OW; // 축소본 → 원본 픽셀 배율

  // 샷 = 세그먼트 경계 + 그 안의 영화 자체 컷
  const shots = [];
  for (const s of cfg.segments) {
    if (s.offset == null) continue;
    const inner = [...(s.innerCuts ?? [])].sort((a, b) => a - b);
    const bs = [s.refStart, ...inner, s.refEnd];
    for (let i = 0; i + 1 < bs.length; i++) shots.push({ start: bs[i], end: bs[i + 1], offset: s.offset });
  }
  if (!shots.length) die("세그먼트가 없다");

  console.error(`샷 ${shots.length}개 / 레퍼런스 밴드 비율 ${refAspect.toFixed(3)} / 원본 콘텐츠 ${ocW}x${ocH}`);
  const out = [];
  for (const sh of shots) {
    const len = sh.end - sh.start;
    const ts = Array.from({ length: probes }, (_, i) => sh.start + len * (i + 1) / (probes + 1));
    const rects = [];
    for (const t of ts) {
      const r = findRect(cfg.reference, cfg.original, t, t + sh.offset, refCrop, origCrop, refAspect, OW, OH);
      if (r) rects.push(r);
    }
    if (!rects.length) { console.error(`  ${sh.start.toFixed(2)}–${sh.end.toFixed(2)}: 매칭 실패`); continue; }
    const cw = median(rects.map(r => r.cw)) * k;
    const cx = median(rects.map(r => r.x + r.cw / 2)) * k;
    const cy = median(rects.map(r => r.y + r.ch / 2)) * k;
    const sad = median(rects.map(r => r.sad));

    // 목표 밴드 비율로 변환 — 레퍼런스 크롭의 **중심**을 유지
    const target = bandW / bandH;
    const refH = cw / refAspect;
    let h = fit === "height" ? refH : cw / target;
    let w = h * target;
    if (w > ocW) { w = ocW; h = w / target; }
    if (h > ocH) { h = ocH; w = h * target; }
    // 레퍼런스 크롭이 원본 세로를 거의 다 쓰면(≥95%) 세로를 꽉 채운다.
    // 프레이밍 차이는 무시할 수준인데 업스케일이 줄어 화질에 이득.
    if (h >= ocH * 0.95 && h < ocH) { h = ocH; w = Math.min(ocW, h * target); }
    w = even(Math.round(w)); h = even(Math.round(h));
    let x = even(Math.round(cx - w / 2)), y = even(Math.round(cy - h / 2));
    x = Math.max(0, Math.min(even(ocW - w), x));
    y = Math.max(0, Math.min(even(ocH - h), y));

    out.push({
      start: +sh.start.toFixed(3), end: +sh.end.toFixed(3),
      srcCrop: `${even(Math.round(cw))}:${even(Math.round(refH))}:${even(Math.round(cx - cw / 2))}:${even(Math.round(cy - refH / 2))}`,
      bandCrop: `${w}:${h}:${x}:${y}`, centerX: Math.round(cx), zoom: +(ocW / cw).toFixed(2), sad: +sad.toFixed(1),
    });
  }

  // 시간분기 crop 식 — 모든 샷의 w:h 가 같아야 하나의 crop 으로 묶인다
  const ws = new Set(out.map(o => o.bandCrop.split(":").slice(0, 2).join(":")));
  let cropExpr = null;
  if (ws.size === 1 && out.length) {
    const [w, h] = [...ws][0].split(":");
    const xs = out.map(o => o.bandCrop.split(":")[2]);
    const ys = out.map(o => o.bandCrop.split(":")[3]);
    const branch = (vals) => vals.reduceRight((acc, v, i) =>
      i === vals.length - 1 ? String(v) : `if(lt(t,${out[i].end}),${v},${acc})`, "");
    cropExpr = `crop=${w}:${h}:'${branch(xs)}':'${branch(ys)}'`;
  }

  writeFileSync(outPath, JSON.stringify({ band: `${bandW}x${bandH}`, fit, source: `${ocW}x${ocH}`, origCrop, shots: out, cropExpr }, null, 2));

  console.log(`\n샷별 리프레임 (목표 밴드 ${bandW}x${bandH})\n`);
  console.log("   구간(레퍼런스)      레퍼런스 크롭(원본px)      줌     밴드 크롭            SAD");
  console.log("   ───────────────────────────────────────────────────────────────────────────────");
  for (const o of out)
    console.log(`   ${o.start.toFixed(2).padStart(5)}→${o.end.toFixed(2).padEnd(6)}  ${o.srcCrop.padEnd(22)} ${String(o.zoom).padStart(4)}x  ${o.bandCrop.padEnd(18)} ${String(o.sad).padStart(5)}`);
  console.log(`\n→ ${outPath}`);
  if (cropExpr) console.log(`crop 식: ${cropExpr}`);
  else console.log("⚠️ 샷마다 크롭 크기가 달라 하나의 crop 식으로 못 묶었다 — apply-cuts 가 샷별로 나눠 처리한다");
}

main();
