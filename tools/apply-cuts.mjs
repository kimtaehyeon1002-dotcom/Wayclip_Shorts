#!/usr/bin/env node
/**
 * 컷 리스트대로 원본을 잘라 붙여 "컷편집본" 을 만든다
 * (굿무비 "레퍼런스 + 원본 2개 입력" 워크플로 R-2 단계).
 *
 * 입력은 match-cuts.mjs 의 cuts.json (+ 선택적으로 match-reframe.mjs 의 reframe.json).
 *   · 세그먼트가 1개면 단순 트림, 여러 개면 순서대로 concat.
 *   · --reframe 을 주면 **샷별 리프레임**(레퍼런스가 쓴 크롭)을 시간분기 crop 으로 굽는다.
 *     밴드 크기(--out-size)까지 미리 맞춰 두면 Remotion 의 cover 크롭이 무손실 통과가 된다.
 *   · 오디오는 --audio ref | orig.
 *       ref  = 레퍼런스 소리 그대로(음악·믹스 포함). 레퍼런스에 A/V 어긋남이 있으면 그것까지 재현된다.
 *              --audio-shift <s> (= match-cuts 가 알려준 avSkew) 를 주면 그 어긋남만 보정한다.
 *       orig = 원본 소리. 그림과 같은 타임코드에서 오므로 절대 어긋나지 않는다.
 *   · --srt 를 주면 레퍼런스 시간축 자막을 **컷편집본 시간축으로 리매핑**해 같이 내보낸다.
 *     (여러 세그먼트를 붙이면 큐 시각이 통째로 달라지므로 반드시 이 경로를 쓸 것.)
 *
 * 사용법:
 *   node tools/apply-cuts.mjs <cuts.json> --out <출력.mp4> [옵션]
 *
 * 옵션:
 *   --reframe <path|expr>  샷별 리프레임 (reframe.json 경로 또는 ffmpeg crop 식)
 *   --out-size WxH         최종 크기 (default: reframe 의 band, 없으면 원본 크롭 크기)
 *   --audio orig|ref       오디오 출처 (default ref — 레퍼런스에서 소리를 가져오는 게 이 워크플로의 전제)
 *   --audio-shift <s>      레퍼런스 오디오를 이만큼 늦춘다(= A/V 어긋남 보정). default 0 (레퍼런스 그대로)
 *   --snap <s>             세그먼트 경계를 원본의 실제 컷에 이만큼 이내면 스냅 (default 0.25, 0=끔)
 *   --srt <path>           레퍼런스 시간축 SRT
 *   --srt-out <path>       리매핑 결과 (default: <출력>.srt)
 *   --crf <n>              x264 CRF (default 16 — 이후 prep-media 가 다시 인코딩하므로 넉넉히)
 */
import { readFileSync, writeFileSync, existsSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { die, even, ff, parseArgs, str, probe, frameCuts } from "./vidutil.mjs";

const parseSrt = (txt) => txt.trim().split(/\n\s*\n/).map(b => {
  const L = b.split("\n"), m = L[1]?.match(/([\d:,.]+)\s*-->\s*([\d:,.]+)/);
  if (!m) return null;
  const t = (s) => { const [h, mi, rest] = s.split(":"); const [sec, ms] = rest.replace(".", ",").split(","); return +h * 3600 + +mi * 60 + +sec + (+ms || 0) / 1000; };
  return { start: t(m[1]), end: t(m[2]), text: L.slice(2).join("\n") };
}).filter(Boolean);
const fmt = (s) => {
  const h = Math.floor(s / 3600), m = Math.floor(s / 60) % 60, sec = Math.floor(s % 60), ms = Math.round((s % 1) * 1000);
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(sec).padStart(2, "0")},${String(ms).padStart(3, "0")}`;
};

/** reframe.json 의 샷들을 세그먼트 로컬 시간(t=0 이 세그먼트 시작)으로 rebase 한 crop 식 */
function cropExprFor(shots, refStart, refEnd) {
  const inside = shots.filter(s => s.end > refStart + 1e-6 && s.start < refEnd - 1e-6);
  if (!inside.length) return null;
  const [w, h] = inside[0].bandCrop.split(":").map(Number);
  if (inside.some(s => { const p = s.bandCrop.split(":").map(Number); return p[0] !== w || p[1] !== h; }))
    return null; // 크기가 섞이면 한 식으로 못 묶는다
  const branch = (idx) => inside.reduceRight((acc, s, i) => {
    const v = s.bandCrop.split(":")[idx];
    return i === inside.length - 1 ? String(v) : `if(lt(t,${(s.end - refStart).toFixed(3)}),${v},${acc})`;
  }, "");
  return `crop=${w}:${h}:'${branch(2)}':'${branch(3)}'`;
}

function main() {
  const { pos, opt } = parseArgs(process.argv.slice(2));
  if (!pos.length || !opt.out) die("사용법: node tools/apply-cuts.mjs <cuts.json> --out <출력.mp4>");
  const cfg = JSON.parse(readFileSync(pos[0], "utf8"));
  const out = String(opt.out);
  const audioFrom = (opt.audio ?? "ref") === "orig" ? "orig" : "ref";
  const audioShift = Number(opt["audio-shift"] ?? 0);
  const snap = Number(opt.snap ?? 0.25);
  const crf = String(opt.crf ?? 16);
  const origCrop = cfg.origCrop ?? null;

  // reframe
  let shots = null, band = null;
  const rf = str(opt.reframe);
  let rawExpr = null;
  if (rf) {
    if (existsSync(rf)) { const j = JSON.parse(readFileSync(rf, "utf8")); shots = j.shots; band = j.band; }
    else rawExpr = rf.startsWith("crop=") ? rf : `crop=${rf}`;
  }
  const outSize = str(opt["out-size"]) ?? band ?? null;

  let segs = cfg.segments.filter(s => s.offset != null).map(s => ({ ...s }));
  if (!segs.length) die("유효한 세그먼트가 없다");

  // ── 경계를 원본의 실제 컷에 스냅 (프레임 단위 컷 목록 사용)
  if (snap > 0) {
    const oc = frameCuts(cfg.original, { crop: origCrop }).map(c => c.t);
    const near = (t) => { let b = null, d = snap; for (const c of oc) { const x = Math.abs(c - t); if (x < d) { d = x; b = c; } } return b; };
    for (const s of segs) {
      const a = near(s.origStart), b = near(s.origEnd);
      if (a != null && Math.abs(a - s.origStart) > 1e-6) { console.error(`  시작 ${s.origStart.toFixed(3)} → 원본 컷 ${a.toFixed(3)} 스냅`); s.headShift = a - s.origStart; s.origStart = a; }
      if (b != null && Math.abs(b - s.origEnd) > 1e-6) { console.error(`  끝   ${s.origEnd.toFixed(3)} → 원본 컷 ${b.toFixed(3)} 스냅`); s.origEnd = b; }
      s.refStart += s.headShift ?? 0;   // 레퍼런스 시간축도 같은 만큼 이동 (자막 리매핑용)
      s.refEnd = s.refStart + (s.origEnd - s.origStart);
    }
  }

  // ── 레퍼런스 오디오 보정으로 앞이 모자라면 클립 시작을 그만큼 늦춘다
  let headTrim = 0;
  if (audioFrom === "ref" && audioShift !== 0) {
    const deficit = Math.max(0, audioShift - segs[0].refStart);
    if (deficit > 0) {
      headTrim = deficit;
      console.error(`  A/V 보정에 앞 ${deficit.toFixed(3)}s 의 레퍼런스 오디오가 필요 → 클립 시작을 그만큼 늦춤`);
      segs[0].refStart += deficit; segs[0].origStart += deficit;
    }
  }

  const dir = mkdtempSync(path.join(tmpdir(), "applycuts-"));
  // 레퍼런스 오디오는 **한 번 WAV 로 펼친 뒤** 자른다.
  // 압축 오디오에 -ss 를 걸면 프라이밍 때문에 20ms 안팎으로 밀려서, 화면과 미세하게 어긋난다.
  let refWav = null;
  if (audioFrom === "ref") {
    refWav = path.join(dir, "ref.wav");
    ff(["-v", "error", "-i", cfg.reference, "-vn", "-ac", "2", "-ar", "48000", "-c:a", "pcm_s16le", refWav, "-y"]);
    const avail = probe(cfg.reference).dur;
    for (const s of segs) {
      const need = (s.refStart - audioShift) + (s.origEnd - s.origStart);
      if (need > cfg.refDuration + 1e-3) {
        const over = need - cfg.refDuration;
        console.error(`  ⚠️ 레퍼런스 오디오가 ${over.toFixed(3)}s 모자라 그만큼 컷을 줄인다`);
        s.origEnd -= over; s.refEnd -= over;
      }
    }
  }
  const parts = [], aparts = [];
  for (const [i, s] of segs.entries()) {
    const dur = s.origEnd - s.origStart;
    const expr = rawExpr ?? (shots ? cropExprFor(shots, s.refStart, s.refEnd) : null);
    const vf = [origCrop ? `crop=${origCrop}` : null, expr,
      outSize ? `scale=${outSize.replace("x", ":")}:flags=lanczos` : null, "setsar=1"].filter(Boolean).join(",");
    console.error(`컷 ${i + 1}/${segs.length}: 원본 ${s.origStart.toFixed(3)} +${dur.toFixed(3)}s${expr ? "  (리프레임 적용)" : ""}`);
    const p = path.join(dir, `v${i}.mp4`);
    ff(["-v", "error", "-ss", String(s.origStart), "-t", String(dur), "-i", cfg.original,
      "-vf", vf, "-an", "-c:v", "libx264", "-crf", crf, "-preset", "medium", "-pix_fmt", "yuv420p",
      "-video_track_timescale", "30000", p, "-y"]);
    parts.push(p);

    // 오디오는 **PCM 으로 잘라 이어 붙이고 맨 끝에 한 번만 AAC 인코딩**한다.
    // 세그먼트마다 AAC 로 인코딩하면 인코더 프라이밍(1024샘플 ≈ 21ms)이 매번 붙어
    // 화면보다 그만큼씩 앞당겨진다(104에서 실측 0.0228s).
    const a = path.join(dir, `a${i}.wav`);
    if (audioFrom === "ref") {
      const at = s.refStart - audioShift;
      if (at < -1e-6) die(`레퍼런스 오디오가 ${(-at).toFixed(3)}s 모자란다 — --audio-shift 를 줄이거나 --audio orig 를 쓸 것`);
      ff(["-v", "error", "-ss", String(at), "-t", String(dur), "-i", refWav,
        "-c:a", "pcm_s16le", "-ar", "48000", "-ac", "2", a, "-y"]);
    } else {
      ff(["-v", "error", "-ss", String(s.origStart), "-t", String(dur), "-i", cfg.original,
        "-vn", "-c:a", "pcm_s16le", "-ar", "48000", "-ac", "2", a, "-y"]);
    }
    aparts.push(a);
  }

  const vlist = path.join(dir, "v.txt"), alist = path.join(dir, "a.txt");
  writeFileSync(vlist, parts.map(p => `file '${p}'`).join("\n"));
  writeFileSync(alist, aparts.map(p => `file '${p}'`).join("\n"));
  const vAll = path.join(dir, "vall.mp4"), aAll = path.join(dir, "aall.wav");
  ff(["-v", "error", "-f", "concat", "-safe", "0", "-i", vlist, "-c", "copy", vAll, "-y"]);
  ff(["-v", "error", "-f", "concat", "-safe", "0", "-i", alist, "-c", "copy", aAll, "-y"]);
  ff(["-v", "error", "-i", vAll, "-i", aAll, "-map", "0:v", "-map", "1:a",
    "-c:v", "copy", "-c:a", "aac", "-b:a", "192k", "-ar", "48000", "-ac", "2", out, "-y"]);
  rmSync(dir, { recursive: true, force: true });

  // ── 자막 리매핑 (레퍼런스 시간축 → 출력 시간축)
  let mapped = null;
  if (str(opt.srt)) {
    const cues = parseSrt(readFileSync(str(opt.srt), "utf8"));
    let acc = 0;
    const spans = segs.map(s => { const e = { a: s.refStart, b: s.refEnd, outA: acc }; acc += s.origEnd - s.origStart; return e; });
    const map = (t) => { for (const sp of spans) if (t >= sp.a - 1e-6 && t <= sp.b + 1e-6) return sp.outA + (t - sp.a); return null; };
    const kept = [];
    for (const c of cues) {
      const a = map(c.start), b = map(c.end);
      if (a == null || b == null || b <= a) { console.error(`  ⚠️ 큐 "${c.text.slice(0, 22)}" 는 컷 밖 — 버림`); continue; }
      kept.push({ ...c, start: a, end: b });
    }
    mapped = str(opt["srt-out"]) ?? out.replace(/\.[^.]+$/, "") + ".srt";
    writeFileSync(mapped, kept.map((c, i) => `${i + 1}\n${fmt(c.start)} --> ${fmt(c.end)}\n${c.text}\n`).join("\n"));
  }

  const total = segs.reduce((a, s) => a + (s.origEnd - s.origStart), 0);
  console.log(`\n컷편집본 → ${out}`);
  console.log(`  ${segs.length}컷 / ${total.toFixed(3)}s / 오디오 ${audioFrom === "ref" ? `레퍼런스${audioShift ? ` (${audioShift > 0 ? "+" : ""}${audioShift}s 보정)` : " (보정 없음 — 레퍼런스 그대로)"}` : "원본"}${outSize ? ` / ${outSize}` : ""}`);
  if (mapped) console.log(`자막 리매핑 → ${mapped}`);
}

main();
