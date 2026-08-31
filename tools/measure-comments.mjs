#!/usr/bin/env node
/**
 * 사용자가 직접 찍어 준 댓글 스크린샷을 **전수 실측**해서 렌더 규격을 통계로 뽑는다.
 *
 * 왜 필요한가 (2026-08-31):
 *   render-comment.mjs 의 규격은 처음엔 스샷 한 장을 눈대중으로 잰 값이었고,
 *   그래서 배경(#0f0f0f vs 실제 #111111)·핸들 크기·줄간격이 전부 어긋나 있었다.
 *   지적을 받고 다시 쟀지만 **한 장은 표본이 아니다** — 스샷마다 브라우저 줌·레티나
 *   배율이 달라서 한 장에 맞추면 다음 장이 틀어진다. 그래서 이때까지 받은 채택본
 *   전부를 재서 규격을 정한다.
 *
 * ⚠️ 절대 px 로 평균 내면 안 된다. 같은 레이아웃이라도 촬영 배율이 1x~2x 로 섞여 있어
 *    px 중앙값은 아무 의미가 없다. 그래서 **줄높이(lineH)로 나눈 비율**을 통계로 잡는다.
 *    비율은 배율 불변이라 스샷 107장을 한 분포로 합칠 수 있다.
 *    렌더할 때는 이 비율 + 목표 lineH 하나만 정하면 나머지가 전부 따라 나온다.
 *
 * 측정은 blur-comments.mjs 의 measureCommentGeometry 를 그대로 쓴다 —
 * 이미 실전 스샷 100+장에서 검증된 로직이고, 두 도구가 같은 좌표계를 봐야 한다.
 *
 * 사용법:
 *   node tools/measure-comments.mjs                       # 채택본 전수
 *   node tools/measure-comments.mjs <파일|디렉토리> ...    # 특정 대상만
 *     --verbose          파일별 상세
 *     --json             JSON 출력
 *     --compare <png>    내 렌더 1장을 코퍼스 비율과 대조 (델타 표)
 */
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { measureCommentGeometry } from "./blur-comments.mjs";

const argv = process.argv.slice(2);
const flag = (n, d) => { const i = argv.indexOf(`--${n}`); return i === -1 ? d : argv[i + 1]; };
const has = (n) => argv.includes(`--${n}`);

// ── 배경색 (오른쪽 위 모서리 — 댓글은 왼쪽 정렬이라 거기가 항상 빈 곳) ──
function bgOf(file) {
  const out = execFileSync("ffprobe", ["-v", "error", "-select_streams", "v:0",
    "-show_entries", "stream=width,height", "-of", "csv=p=0", file], { encoding: "utf8" }).trim();
  const [w] = out.split(",").map(Number);
  const raw = execFileSync("ffmpeg", ["-v", "error", "-i", file, "-vf", "crop=3:3:iw-4:1",
    "-f", "rawvideo", "-pix_fmt", "rgb24", "-"], { maxBuffer: 1 << 20 });
  return [raw[0], raw[1], raw[2]];
}

/** 액션행(마지막 텍스트 줄) 왼쪽 끝의 엄지 아이콘 잉크 높이. */
function iconHeight(file, geo) {
  const raw = execFileSync("ffmpeg", ["-v", "error", "-i", file, "-f", "rawvideo",
    "-pix_fmt", "gray", "-"], { maxBuffer: 1 << 28 });
  const { w, h, textLeft } = geo;
  // 액션행 = 텍스트 칼럼 런 중 마지막. 아이콘은 그 줄 왼쪽 끝 lineH 폭 안에 있다.
  const x0 = textLeft, x1 = Math.min(w, textLeft + Math.round(geo.lineH * 1.2));
  let y0 = Infinity, y1 = -1;
  // 아래에서 위로 훑어 첫 잉크 덩어리 = 액션행
  for (let y = h - 1; y >= 0; y--) {
    let n = 0;
    for (let x = x0; x < x1; x++) if (raw[y * w + x] > 90) n++;
    if (n > 0) { if (y1 < 0) y1 = y; y0 = y; }
    else if (y1 >= 0) break;
  }
  return y1 < 0 ? null : y1 - y0 + 1;
}

export function measure(file) {
  const geo = measureCommentGeometry(file);
  const bg = bgOf(file);
  const iconH = iconHeight(file, geo);
  const L = geo.lineH;
  return {
    file, bg, ...geo, iconH,
    // 배율 불변 비율 (전부 lineH 기준)
    r: {
      textLeft: +(geo.textLeft / L).toFixed(3),
      avatarW: +((geo.avatar.x1 + 1) / L).toFixed(3),
      handleTop: +(geo.handle.y0 / L).toFixed(3),
      headToBody: geo.bodyTop < geo.h ? +((geo.bodyTop - geo.handle.y0) / L).toFixed(3) : null,
      iconH: iconH == null ? null : +(iconH / L).toFixed(3),
    },
  };
}

// ── 대상 수집 ─────────────────────────────────────────────────────────
export function collect(targets) {
  const files = [];
  const push = (p) => {
    if (!fs.existsSync(p)) return;
    const st = fs.statSync(p);
    if (st.isDirectory()) for (const e of fs.readdirSync(p)) push(path.join(p, e));
    else if (/\.png$/i.test(p) && !/\.blur\.png$/i.test(p)) files.push(p);
  };
  for (const t of targets) push(t);
  return files;
}

export const median = (a) => {
  const v = a.filter((x) => x != null && Number.isFinite(x)).sort((x, y) => x - y);
  if (!v.length) return null;
  const m = Math.floor(v.length / 2);
  return v.length % 2 ? v[m] : +((v[m - 1] + v[m]) / 2).toFixed(3);
};
const spread = (a) => {
  const v = a.filter((x) => x != null && Number.isFinite(x)).sort((x, y) => x - y);
  if (v.length < 4) return null;
  return [v[Math.floor(v.length * 0.25)], v[Math.floor(v.length * 0.75)]];
};
const tally = (a) => {
  const c = new Map();
  for (const x of a) c.set(x, (c.get(x) ?? 0) + 1);
  return [...c.entries()].sort((p, q) => q[1] - p[1]);
};

const IS_CLI = process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1]);

/** 채택본 코퍼스(사용자가 실제로 쓴 스샷)의 비율 통계. 다른 도구가 기준으로 삼는다. */
export function corpusStats() {
  const root = "output/goodvibesongs";
  const dirs = fs.existsSync(root)
    ? fs.readdirSync(root).map((n) => path.join(root, n, `${n}댓글`))
    : [];
  const rs = [];
  for (const f of collect(dirs)) { try { rs.push(measure(f)); } catch {} }
  const R = (k) => rs.map((x) => x.r[k]);
  const bgTally = new Map();
  for (const r of rs) { const k = r.bg.join(","); bgTally.set(k, (bgTally.get(k) ?? 0) + 1); }
  return {
    count: rs.length,
    bg: [...bgTally.entries()].sort((a, b) => b[1] - a[1]),
    ratios: {
      textLeft: median(R("textLeft")), avatarW: median(R("avatarW")),
      headToBody: median(R("headToBody")), iconH: median(R("iconH")),
    },
    // ⚠️ 허용 범위는 코퍼스 자신의 분포에서 온다. 측정값이 글자 내용에 따라 흔들리기
    //    때문에(lineH 를 글리프 잉크로 재므로) 좁은 고정 오차를 쓰면 멀쩡한 렌더가 전부 걸린다.
    iqr: {
      textLeft: spread(R("textLeft")), avatarW: spread(R("avatarW")),
      headToBody: spread(R("headToBody")), iconH: spread(R("iconH")),
    },
  };
}

// ── CLI (import 될 땐 실행되지 않는다) ────────────────────────────────
if (IS_CLI) {
  const VALUE_FLAGS = new Set(["compare"]);
  const positional = argv.filter((a, i) => {
    if (a.startsWith("--")) return false;
    const prev = argv[i - 1];
    return !(prev?.startsWith("--") && VALUE_FLAGS.has(prev.slice(2)));
  });

  let targets = positional;
  if (!targets.length) {
    const root = "output/goodvibesongs";
    targets = fs.existsSync(root)
      ? fs.readdirSync(root).map((n) => path.join(root, n, `${n}댓글`))
      : [];
  }

  const files = collect(targets);
  if (!files.length) { console.error("✗ 측정할 스샷이 없다"); process.exit(1); }

  const results = [];
  const failed = [];
  for (const f of files) {
    try { results.push(measure(f)); }
    catch (e) { failed.push([f, e.message]); }
  }


  const R = (k) => results.map((x) => x.r[k]);
  const stats = {
    count: results.length,
    bg: tally(results.map((r) => r.bg.join(","))),
    lineH: tally(results.map((r) => r.lineH)).slice(0, 8),
    ratios: {
      textLeft: median(R("textLeft")),
      avatarW: median(R("avatarW")),
      handleTop: median(R("handleTop")),
      headToBody: median(R("headToBody")),
      iconH: median(R("iconH")),
    },
    iqr: {
      textLeft: spread(R("textLeft")),
      avatarW: spread(R("avatarW")),
      headToBody: spread(R("headToBody")),
      iconH: spread(R("iconH")),
    },
  };

  if (has("json")) {
    console.log(JSON.stringify({ stats, results }, null, 2));
  } else {
    if (has("verbose")) {
      for (const r of results)
        console.log(`  ${path.basename(r.file).slice(0, 34).padEnd(36)} ${String(r.w).padStart(4)}×${String(r.h).padEnd(4)} bg=${r.bg.join(",").padEnd(11)} lineH=${String(r.lineH).padStart(3)}  textLeft/L=${r.r.textLeft}  아이콘/L=${r.r.iconH}`);
      console.log("");
    }
    console.log(`■ 실측 ${stats.count}장${failed.length ? ` (실패 ${failed.length})` : ""}\n`);
    console.log(`  배경색   ${stats.bg.map(([v, n]) => `rgb(${v})×${n}`).join("   ")}`);
    console.log(`  줄높이   ${stats.lineH.map(([v, n]) => `${v}px×${n}`).join("  ")}  ← 촬영 배율이 제각각이라 절대 px 는 의미 없음\n`);
    console.log(`  ${"비율 (÷lineH)".padEnd(16)} ${"중앙값".padStart(8)} ${"사분위".padStart(16)}`);
    const row = (k, v, q) => console.log(`  ${k.padEnd(16)} ${String(v ?? "-").padStart(8)} ${(q ? `${q[0]} ~ ${q[1]}` : "-").padStart(16)}`);
    row("textLeft", stats.ratios.textLeft, stats.iqr.textLeft);
    row("프사 폭", stats.ratios.avatarW, stats.iqr.avatarW);
    row("핸들줄 상단", stats.ratios.handleTop, null);
    row("핸들→본문", stats.ratios.headToBody, stats.iqr.headToBody);
    row("아이콘 높이", stats.ratios.iconH, stats.iqr.iconH);
    if (failed.length) {
      console.log(`\n  ⚠ 측정 실패 ${failed.length}장:`);
      failed.slice(0, 5).forEach(([f, m]) => console.log(`    ${path.basename(f)} — ${m}`));
    }
  }

  // ── 내 렌더와 대조 ────────────────────────────────────────────────────
  const cmp = flag("compare", null);
  if (cmp) {
    const m = measure(cmp);
    console.log(`\n■ 대조: ${path.basename(cmp)}  (${m.w}×${m.h}, lineH=${m.lineH})\n`);
    const bgReal = stats.bg[0][0];
    console.log(`  ${"항목".padEnd(14)} ${"코퍼스".padStart(9)} ${"내 렌더".padStart(9)}   판정`);
    console.log(`  ${"배경색".padEnd(14)} ${bgReal.padStart(9)} ${m.bg.join(",").padStart(9)}   ${bgReal === m.bg.join(",") ? "✓" : "✗"}`);
    const line = (k, real, mine, tol = 0.08) => {
      if (real == null || mine == null) return console.log(`  ${k.padEnd(14)} ${String(real ?? "-").padStart(9)} ${String(mine ?? "-").padStart(9)}   -`);
      const d = mine - real;
      console.log(`  ${k.padEnd(14)} ${String(real).padStart(9)} ${String(mine).padStart(9)}   ${Math.abs(d) <= tol ? "✓" : `✗ ${d > 0 ? "+" : ""}${d.toFixed(2)}`}`);
    };
    line("textLeft", stats.ratios.textLeft, m.r.textLeft);
    line("프사 폭", stats.ratios.avatarW, m.r.avatarW);
    line("핸들→본문", stats.ratios.headToBody, m.r.headToBody);
    line("아이콘 높이", stats.ratios.iconH, m.r.iconH);
  }

}
