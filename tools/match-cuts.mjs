#!/usr/bin/env node
/**
 * 레퍼런스 영상 ↔ 원본 영상 컷 매칭 (굿무비 "레퍼런스 + 원본 2개 입력" 워크플로 R-1 단계).
 *
 * 레퍼런스(이미 컷편집된 짧은 클립)의 각 구간이 원본 어디서 왔는지 찾아 컷 리스트를 만든다.
 * **두 축을 따로 재고 비교하는 게 핵심**:
 *
 *   ① 화면 오프셋 — 레퍼런스 컷 시각과 원본 컷 시각을 프레임 단위로 짝지어 구한다.
 *      컷은 불연속이라 변별력이 압도적이다. 이게 **컷을 자를 기준**.
 *   ② 오디오 오프셋 — 파형 교차상관. 레퍼런스에 음악이 덧입혀졌으면 실패하니 화면이 보조한다.
 *
 * 둘이 다르면 = **레퍼런스 파일 자체의 A/V 싱크 어긋남**. 104(터미네이터2)에서 0.224s 발견.
 * 그때 화면 오프셋으로 자르고, 박힌 자막(=그림의 일부)도 화면 오프셋 기준으로 읽는다.
 * 오디오를 레퍼런스에서 가져올 거면 apply-cuts 의 --audio-shift 로 그 차이를 보정할 수 있다.
 *
 * 사용법:
 *   node tools/match-cuts.mjs <레퍼런스> <원본> [옵션]
 *
 * 옵션:
 *   --crop w:h:x:y     레퍼런스에서 영상 밴드만 (완성 쇼츠 레퍼런스면 필수). 짝수여야 함
 *   --auto-crop        영상 밴드 자동 검출 (시간에 따라 변하는 영역 = 영상)
 *   --orig-crop w:h:x:y 원본 레터박스 제거 영역
 *   --auto-orig-crop   원본 레터박스 자동 검출 (cropdetect)
 *   --thresh <n>       컷 검출 임계 (default 18)
 *   --pad <s>          컷 경계 안쪽 여유 (전환 프레임 회피, default 0.12)
 *   --tol <s>          같은 오프셋으로 볼 허용 오차 (default 0.06)
 *   --out <path>       컷 리스트 JSON
 *   --verify [png]     컷마다 레퍼런스/원본 프레임을 짝지은 검증 시트 (눈으로 볼 것)
 */
import { writeFileSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { spawnSync } from "node:child_process";
import path from "node:path";
import { die, even, ff, parseArgs, str, probe, envelope, grayFrames, frameCuts, waveOffset } from "./vidutil.mjs";

/** 시간에 따라 변하는 영역 = 영상 밴드 (고정 흰/검정 밴드·고정 텍스트 제외) */
function autoCrop(file, m) {
  const times = [m.dur * 0.2, m.dur * 0.5, m.dur * 0.8];
  const fr = times.map(t => ff(["-v", "error", "-ss", String(t), "-i", file, "-frames:v", "1",
    "-f", "rawvideo", "-pix_fmt", "gray", "-"]).stdout);
  const varies = (i) => { let mn = 255, mx = 0; for (const f of fr) { const v = f[i]; if (v < mn) mn = v; if (v > mx) mx = v; } return mx - mn > 12; };
  const rows = [], cols = [];
  for (let y = 0; y < m.H; y++) { let c = 0; for (let x = 0; x < m.W; x += 4) if (varies(y * m.W + x)) c++; rows.push(c > m.W / 48); }
  for (let x = 0; x < m.W; x++) { let c = 0; for (let y = 0; y < m.H; y += 4) if (varies(y * m.W + x)) c++; cols.push(c > m.H / 48); }
  const span = (a) => { const i = a.indexOf(true), j = a.lastIndexOf(true); return [i, j - i + 1]; };
  const [y0, h] = span(rows), [x0, w] = span(cols);
  if (h < 40 || w < 40) return null;
  return `${even(w)}:${even(h)}:${even(x0)}:${even(y0)}`;
}

/** 원본 레터박스 자동 검출 */
function autoLetterbox(file, m) {
  const r = spawnSync("ffmpeg", ["-v", "info", "-ss", String(m.dur * 0.4), "-t", "8", "-i", file,
    "-vf", "cropdetect=24:2:0", "-f", "null", "-"], { maxBuffer: 1 << 28 });
  const hits = {};
  for (const g of (r.stderr.toString()).matchAll(/crop=(\d+):(\d+):(\d+):(\d+)/g)) hits[g[0]] = (hits[g[0]] ?? 0) + 1;
  const top = Object.entries(hits).sort((a, b) => b[1] - a[1])[0];
  return top ? top[0].slice(5) : null;
}

/** 두 컷 배열을 짝지어 오프셋 후보를 클러스터링. [{offset, pairs:[[refIdx,origIdx]], spread}] */
function offsetClusters(refCuts, origCuts, tol) {
  const cand = [];
  for (const r of refCuts) for (const o of origCuts) cand.push(o.t - r.t);
  const clusters = [];
  for (const c of cand) {
    let hit = [], used = new Set();
    for (const [ri, r] of refCuts.entries()) {
      let bi = -1, bd = tol;
      for (const [oi, o] of origCuts.entries()) {
        const d = Math.abs(o.t - (r.t + c));
        if (d < bd && !used.has(oi)) { bd = d; bi = oi; }
      }
      if (bi >= 0) { hit.push([ri, bi, origCuts[bi].t - r.t]); used.add(bi); }
    }
    if (!hit.length) continue;
    const offs = hit.map(h => h[2]).sort((a, b) => a - b);
    clusters.push({ offset: offs[offs.length >> 1], n: hit.length, pairs: hit, spread: offs[offs.length - 1] - offs[0] });
  }
  clusters.sort((a, b) => b.n - a.n || a.spread - b.spread);
  const out = [];
  for (const c of clusters) if (!out.some(o => Math.abs(o.offset - c.offset) < tol * 2)) out.push(c);
  return out;
}

/** 화면 시그니처(평균밝기+움직임) — 오디오가 실패한 구간의 보조 */
const SIG_FPS = 20;
function signature(file, crop) {
  const g = grayFrames(file, { crop, w: 64, h: 36, fps: SIG_FPS });
  const luma = new Float64Array(g.F), motion = new Float64Array(g.F);
  for (let f = 0; f < g.F; f++) {
    const o = f * g.N; let s = 0, d = 0;
    for (let i = 0; i < g.N; i++) { s += g.data[o + i]; if (f) d += Math.abs(g.data[o + i] - g.data[o - g.N + i]); }
    luma[f] = s / g.N; motion[f] = f ? d / g.N : 0;
  }
  return { luma, motion, F: g.F };
}
const ncc = (a, b, s, W, o) => {
  let ma = 0, mb = 0;
  for (let i = 0; i < W; i++) { ma += a[s + i]; mb += b[o + i]; }
  ma /= W; mb /= W;
  let d = 0, v1 = 0, v2 = 0;
  for (let i = 0; i < W; i++) { const x = a[s + i] - ma, y = b[o + i] - mb; d += x * y; v1 += x * x; v2 += y * y; }
  return v1 > 1e-9 && v2 > 1e-9 ? d / Math.sqrt(v1 * v2) : -2;
};
function matchVideo(rs, os, a, b) {
  const s = Math.round(a * SIG_FPS), W = Math.round((b - a) * SIG_FPS);
  if (W < 12 || s + W > rs.F) return null;
  const lim = os.F - W; if (lim < 1) return null;
  const sc = new Float64Array(lim + 1);
  let best = -4, at = 0;
  for (let o = 0; o <= lim; o++) { sc[o] = ncc(rs.luma, os.luma, s, W, o) + ncc(rs.motion, os.motion, s, W, o); if (sc[o] > best) { best = sc[o]; at = o; } }
  let second = -4;
  for (let o = 0; o <= lim; o++) if (Math.abs(o - at) > SIG_FPS && sc[o] > second) second = sc[o];
  return { offset: at / SIG_FPS - a, score: best / 2, margin: (best - second) / 2 };
}

/** 엔벨로프 NCC 로 구간 [a,b) 의 오디오 오프셋 */
function matchAudio(refEnv, origEnv, fps, a, b) {
  const s = Math.round(a * fps), e = Math.round(b * fps), W = e - s;
  if (W < 20) return null;
  let m = 0; for (let i = 0; i < W; i++) m += refEnv[s + i]; m /= W;
  let v = 0; for (let i = 0; i < W; i++) { const d = refEnv[s + i] - m; v += d * d; }
  const sd = Math.sqrt(v); if (sd < 1e-6) return null;
  const rw = new Float64Array(W);
  for (let i = 0; i < W; i++) rw[i] = (refEnv[s + i] - m) / sd;
  const lim = origEnv.length - W;
  let best = -2, at = 0; const sc = new Float64Array(lim + 1);
  for (let o = 0; o <= lim; o++) {
    let sum = 0, sq = 0, dot = 0;
    for (let i = 0; i < W; i++) { const x = origEnv[o + i]; sum += x; sq += x * x; dot += rw[i] * x; }
    const mo = sum / W, vo = sq - W * mo * mo;
    sc[o] = vo < 1e-9 ? -2 : (dot - mo * rw.reduce((p, c) => p + c, 0)) / Math.sqrt(vo);
    if (sc[o] > best) { best = sc[o]; at = o; }
  }
  let second = -2;
  for (let o = 0; o <= lim; o++) if (Math.abs(o - at) > fps / 2 && sc[o] > second) second = sc[o];
  return { offset: at / fps - a, score: best, margin: best - second };
}

/** 검증 시트 — 컷마다 3지점, 위=레퍼런스 / 아래=원본. **프레임 번호**로 집어 반올림 오차를 없앤다. */
function verifySheet(refFile, origFile, segs, crop, origCrop, out) {
  const rm = probe(refFile), om = probe(origFile);
  const dir = mkdtempSync(path.join(tmpdir(), "cutverify-"));
  const grab = (file, m, t, cr, tag, i) => {
    const n = Math.max(0, Math.round((t - m.start) * m.fps));
    const p = path.join(dir, `${tag}${i}.png`);
    ff(["-v", "error", "-i", file, "-vf", `${cr ? `crop=${cr},` : ""}select='eq(n\\,${n})',scale=360:300:force_original_aspect_ratio=decrease,pad=360:300:(360-iw)/2:(300-ih)/2:black`,
      "-fps_mode", "passthrough", "-frames:v", "1", p, "-y"]);
    return p;
  };
  const cols = [];
  for (const s of segs) {
    if (s.offset === null) continue;
    const len = s.refEnd - s.refStart;
    for (const f of [0.12, 0.5, 0.88]) {
      const rt = s.refStart + len * f;
      cols.push([grab(refFile, rm, rt, crop, "a", cols.length), grab(origFile, om, rt + s.offset, origCrop, "b", cols.length)]);
    }
  }
  if (!cols.length) { rmSync(dir, { recursive: true, force: true }); return null; }
  const inputs = cols.flatMap(([a, b]) => ["-i", a, "-i", b]);
  const stacks = cols.map((_, i) => `[${i * 2}][${i * 2 + 1}]vstack[c${i}]`).join(";");
  ff(["-v", "error", ...inputs, "-filter_complex", `${stacks};${cols.map((_, i) => `[c${i}]`).join("")}hstack=${cols.length}`, "-frames:v", "1", out, "-y"]);
  rmSync(dir, { recursive: true, force: true });
  return out;
}

function main() {
  const { pos, opt } = parseArgs(process.argv.slice(2));
  if (pos.length < 2) die("사용법: node tools/match-cuts.mjs <레퍼런스> <원본> [--crop w:h:x:y] [--orig-crop w:h:x:y]");
  const [refFile, origFile] = pos;
  const pad = Number(opt.pad ?? 0.12), tol = Number(opt.tol ?? 0.06), thresh = Number(opt.thresh ?? 18);
  const outPath = str(opt.out) ?? path.join(path.dirname(refFile), path.basename(refFile).replace(/\.[^.]+$/, "") + ".cuts.json");
  const rm = probe(refFile), om = probe(origFile);

  let crop = str(opt.crop);
  if (!crop && opt["auto-crop"]) { crop = autoCrop(refFile, rm); console.error(`레퍼런스 밴드 자동검출: ${crop ?? "(실패)"}`); }
  let origCrop = str(opt["orig-crop"]);
  if (!origCrop && opt["auto-orig-crop"]) { origCrop = autoLetterbox(origFile, om); console.error(`원본 레터박스 자동검출: ${origCrop ?? "(없음)"}`); }

  const refCuts = frameCuts(refFile, { crop, thresh });
  const origCuts = frameCuts(origFile, { crop: origCrop, thresh });
  console.error(`컷 검출 — 레퍼런스 ${refCuts.length}개 / 원본 ${origCuts.length}개`);

  // ── ① 화면 오프셋 (컷 배열 짝짓기)
  const clusters = offsetClusters(refCuts, origCuts, tol);
  const picture = clusters[0] ?? null;
  if (picture) console.error(`화면 오프셋 ${picture.offset.toFixed(3)} — 레퍼런스 컷 ${picture.n}/${refCuts.length}개 일치 (편차 ${picture.spread.toFixed(3)}s)`);

  // ── 세그먼트 = 화면 오프셋이 같은 이웃 컷끼리 묶은 구간
  const bounds = [0, ...refCuts.map(c => c.t), rm.dur];
  let segs = [];
  for (let i = 0; i + 1 < bounds.length; i++) segs.push({ refStart: +bounds[i].toFixed(3), refEnd: +bounds[i + 1].toFixed(3), offset: null, by: null });

  // ── ② 오디오 오프셋 (구간별)
  const { env: refEnv, fps: efps } = envelope(refFile);
  const { env: origEnv } = envelope(origFile);
  for (const s of segs) {
    const r = matchAudio(refEnv, origEnv, efps, Math.min(s.refStart + pad, s.refEnd - 0.05), Math.max(s.refEnd - pad, s.refStart + 0.05));
    if (r) { s.audioOffset = +r.offset.toFixed(3); s.audioScore = +r.score.toFixed(3); s.audioMargin = +r.margin.toFixed(3); }
  }

  // ── 화면 오프셋을 각 구간에 배정.
  //    레퍼런스 컷 k 가 원본 컷과 맞으면 = 그건 **영화 자체 컷**이라는 뜻이고,
  //    그 앞 구간(k)과 뒤 구간(k+1)이 **둘 다** 같은 오프셋에서 온 것이다.
  //    (구간 하나만 칠하면 연속 구간이 쪼개져 뒤 구간이 엉뚱한 오디오 후보로 넘어간다)
  for (const cl of clusters) {
    if (cl.n < 1) continue;
    for (const [ri] of cl.pairs) {
      for (const j of [ri, ri + 1]) {
        if (segs[j] && segs[j].offset === null) { segs[j].offset = +cl.offset.toFixed(3); segs[j].by = "picture"; }
      }
    }
  }
  if (segs.length === 1 && picture && segs[0].offset === null) { segs[0].offset = +picture.offset.toFixed(3); segs[0].by = "picture"; }
  // 화면으로 못 정한 구간 → 오디오, 그것도 약하면 화면 시그니처
  let rs = null, os = null;
  for (const s of segs) {
    if (s.offset !== null) continue;
    if (s.audioMargin != null && s.audioMargin >= 0.12 && s.audioScore >= 0.7) { s.offset = s.audioOffset; s.by = "audio"; continue; }
    rs ??= signature(refFile, crop); os ??= signature(origFile, origCrop);
    const v = matchVideo(rs, os, s.refStart + pad, s.refEnd - pad);
    if (v && v.margin > 0.1 && v.score > 0.35) { s.offset = +v.offset.toFixed(3); s.by = "video-sig"; }
    else if (s.audioOffset != null) { s.offset = s.audioOffset; s.by = "audio(약함)"; }
  }

  // ── 같은 오프셋 이웃 구간 병합 (영화 자체 컷은 편집 컷이 아니다)
  const merged = [];
  for (const s of segs) {
    const last = merged[merged.length - 1];
    if (last && last.offset !== null && s.offset !== null && Math.abs(s.offset - last.offset) < tol) {
      last.innerCuts = [...(last.innerCuts ?? []), s.refStart];
      last.refEnd = s.refEnd;
    } else merged.push({ ...s });
  }
  segs = merged;
  for (const s of segs) {
    if (s.offset === null) continue;
    s.origStart = +(s.refStart + s.offset).toFixed(3);
    s.origEnd = +(s.refEnd + s.offset).toFixed(3);
  }

  // ── A/V 어긋남 = 오디오 오프셋 − 화면 오프셋
  const audioAll = waveOffset(refFile, origFile, {
    refAt: Math.max(0.5, segs[0].refStart + pad), len: Math.min(8, segs[0].refEnd - segs[0].refStart - 2 * pad),
    guess: segs[0].offset ?? segs[0].audioOffset ?? 0, search: 0.5,
  });
  const avSkew = (audioAll && picture) ? +(audioAll.offset - picture.offset).toFixed(3) : null;

  const json = {
    reference: refFile, original: origFile,
    refDuration: +rm.dur.toFixed(3), origDuration: +om.dur.toFixed(3),
    crop, origCrop,
    pictureOffset: picture ? +picture.offset.toFixed(3) : null,
    audioOffset: audioAll ? +audioAll.offset.toFixed(4) : null,
    audioCorr: audioAll ? +audioAll.corr.toFixed(4) : null,
    avSkew,
    refCuts: refCuts.map(c => ({ n: c.n, t: +c.t.toFixed(4) })),
    segments: segs,
  };
  writeFileSync(outPath, JSON.stringify(json, null, 2));

  console.log(`\n컷 ${segs.length}개 (레퍼런스 ${rm.dur.toFixed(2)}s / 원본 ${om.dur.toFixed(2)}s)\n`);
  console.log("  #  레퍼런스 구간       길이     원본 구간               오프셋   근거        비고");
  console.log("  ─────────────────────────────────────────────────────────────────────────────────────────");
  for (const [i, s] of segs.entries()) {
    const len = (s.refEnd - s.refStart).toFixed(2);
    const note = s.innerCuts?.length ? `영화 자체 컷 ${s.innerCuts.map(x => x.toFixed(2)).join("/")}` : "";
    console.log(`  ${String(i + 1).padStart(2)}  ${s.refStart.toFixed(2).padStart(5)}→${s.refEnd.toFixed(2).padEnd(5)}  ${len.padStart(5)}s  ${String(s.origStart ?? "—").padStart(8)}→${String(s.origEnd ?? "—").padEnd(8)}  ${String(s.offset ?? "—").padStart(7)}  ${(s.by ?? "?").padEnd(10)}  ${note}`);
  }
  if (audioAll) console.log(`\n오디오 오프셋 ${audioAll.offset.toFixed(4)} (파형상관 ${audioAll.corr.toFixed(3)})`);
  if (avSkew !== null && Math.abs(avSkew) > 0.08) {
    console.log(`⚠️  레퍼런스 A/V 싱크 어긋남 ${avSkew > 0 ? "+" : ""}${avSkew}s — 소리가 그림보다 ${avSkew > 0 ? "앞섬" : "뒤짐"}`);
    console.log(`    · 컷·자막은 **화면 오프셋** 기준 (박힌 자막은 그림의 일부)`);
    console.log(`    · 레퍼런스 오디오를 쓸 거면 apply-cuts --audio ref --audio-shift ${avSkew} 로 보정 가능`);
    console.log(`    · 보정 없이 그대로 두면 레퍼런스와 똑같은 립싱크(= 어긋난 채)가 재현된다`);
  }
  console.log(`\n→ ${outPath}`);

  if (opt.verify) {
    const sheet = str(opt.verify) ?? outPath.replace(/\.json$/, "") + "-검증.png";
    verifySheet(refFile, origFile, segs, crop, origCrop, sheet);
    console.log(`검증 시트 → ${sheet}  (위=레퍼런스 / 아래=원본, 컷당 3지점 — 눈으로 확인 후 사용자 승인)`);
  }
}

main();
