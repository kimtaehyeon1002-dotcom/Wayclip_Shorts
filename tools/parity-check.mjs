#!/usr/bin/env node
/**
 * parity-check.mjs — 포맷 레지스트리(src/format) 렌더가 리팩터 전 채널 컴포넌트(src/channels)와 **픽셀 단위로 같은지**.
 *
 *   node tools/parity-check.mjs                 # 기본 샘플 세트
 *   node tools/parity-check.mjs --base pre-format-registry --keep
 *   node tools/parity-check.mjs --self          # 하네스 자체 검증 (같은 트리 두 번 → 100% 동일해야)
 *
 * 방법: `.parity/base` 에 기준 커밋 워크트리를 만들고, 두 트리를 각각 한 번씩 번들(@remotion/bundler)한 뒤
 *       같은 props·같은 public dir 로 스틸을 뽑아 ffmpeg SSIM/PSNR + 디코드 md5 로 비교한다.
 *       통과: md5 동일, 또는 SSIM ≥ 0.999 ∧ PSNR ≥ 45dB (비디오 디코더 노이즈 허용).
 * 샘플 영상에 source.mp4 가 없으면 media/ 의 아무 mp4 를 대신 쓴다 (양쪽에 같은 입력이면 충분).
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { execFileSync, spawnSync } from "node:child_process";
import { bundle } from "@remotion/bundler";
import { renderStill, selectComposition } from "@remotion/renderer";
import { compositionId, resolvePropsPath } from "./channels.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const P = path.join(ROOT, ".parity");
const args = process.argv.slice(2);
const opt = (k, d) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : d; };
const BASE_REF = opt("--base", "pre-format-registry");
const SELF = args.includes("--self");
const KEEP = args.includes("--keep");

// 기본 샘플: 채널별 특수 기능이 실제로 켜지는 영상들.
const SAMPLES = [
  { ch: "goodvibesongs", n: "125", lang: "ja" },              // 댓글 오버레이 + 워터마크 + captionYOffset
  { ch: "goodmovies", n: "104", lang: "ja" },                 // 흰 배경 / overscan / 노랑 자막
  { ch: "goodmovies", n: "106", lang: "tw" },                 // 다국어 변형
  { ch: "readyaction", n: "957", lang: "ja" },
  { ch: "readyaction", n: "957", lang: "th" },                // 태국어 줄높이/word-break
  { ch: "readyaction", n: "957", lang: "vi" },
  { ch: "thishiphop", n: "940", lang: "ja" },                 // 라틴 폰트 / palt ja 분기
  { ch: "space_lab", n: "068", lang: "ja", extra: [40] },     // contain-auto + WarnPill 깜빡 프레임
  { ch: "space_lab", n: "068", lang: "th", extra: [40] },
  { ch: "space_lab", n: "056", lang: "ja", extra: [40] },
];

const sh = (cmd, a, o = {}) => execFileSync(cmd, a, { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"], ...o });
function log(s) { console.log(s); }

function ensureBase() {
  const dir = path.join(P, "base");
  if (SELF) return ROOT;
  if (!fs.existsSync(path.join(dir, "package.json"))) {
    fs.mkdirSync(P, { recursive: true });
    try { sh("git", ["worktree", "remove", "--force", dir], { cwd: ROOT }); } catch {}
    sh("git", ["worktree", "add", "--force", "--detach", dir, BASE_REF], { cwd: ROOT });
    log(`✓ 기준 워크트리 ${path.relative(ROOT, dir)} @ ${BASE_REF}`);
  }
  const nm = path.join(dir, "node_modules");
  if (!fs.existsSync(nm)) fs.symlinkSync(path.join(ROOT, "node_modules"), nm);
  return dir;
}

function fallbackMedia() {
  const pref = path.join(ROOT, "media", "aviator-2004.mp4");
  if (fs.existsSync(pref)) return pref;
  const any = fs.readdirSync(path.join(ROOT, "media")).find((f) => f.endsWith(".mp4"));
  if (!any) throw new Error("media/ 에 mp4 가 없어 대체 소스를 만들 수 없음");
  return path.join(ROOT, "media", any);
}

/** 샘플별 props 를 공용 public dir 기준으로 다시 쓴다. */
function prepareSamples() {
  const pub = path.join(P, "pub");
  fs.rmSync(pub, { recursive: true, force: true });
  fs.mkdirSync(pub, { recursive: true });
  const out = [];
  for (const s of SAMPLES) {
    const vdir = path.join(ROOT, "videos", s.ch, s.n);
    const propsPath = resolvePropsPath(fs, path, vdir, s.lang);
    if (!propsPath) { log(`· 건너뜀 ${s.ch}/${s.n}/${s.lang} (props 없음)`); continue; }
    const key = `${s.ch}-${s.n}`;
    const sdir = path.join(pub, key);
    fs.mkdirSync(sdir, { recursive: true });
    const src = path.join(vdir, "source.mp4");
    const mediaSrc = fs.existsSync(src) ? src : fallbackMedia();
    if (!fs.existsSync(path.join(sdir, "source.mp4"))) {
      try { fs.linkSync(mediaSrc, path.join(sdir, "source.mp4")); } catch { fs.copyFileSync(mediaSrc, path.join(sdir, "source.mp4")); }
    }
    const props = JSON.parse(fs.readFileSync(propsPath, "utf8"));
    props.videoSrc = `${key}/source.mp4`;
    if (Array.isArray(props.comments)) {
      for (const c of props.comments) {
        const from = path.join(vdir, c.src);
        if (fs.existsSync(from)) {
          fs.mkdirSync(path.dirname(path.join(sdir, c.src)), { recursive: true });
          fs.copyFileSync(from, path.join(sdir, c.src));
        }
        c.src = `${key}/${c.src}`;
      }
    }
    const d = props.durationInFrames;
    const frames = [...new Set([0, Math.floor(d * 0.25), Math.floor(d * 0.5), Math.floor(d * 0.75), d - 1, ...(s.extra || [])])]
      .filter((f) => f >= 0 && f < d).sort((a, b) => a - b);
    out.push({ ...s, key, props, frames, fallback: mediaSrc !== src });
  }
  return { pub, samples: out };
}

async function bundleTree(tree, pub, label) {
  log(`▸ 번들 ${label} (${path.relative(ROOT, tree) || "."})`);
  return bundle({
    entryPoint: path.join(tree, "src", "index.ts"),
    publicDir: pub,
    outDir: path.join(P, `bundle-${label}`),
    onProgress: () => {},
  });
}

async function renderSet(serveUrl, samples, label) {
  const outDir = path.join(P, "stills", label);
  fs.mkdirSync(outDir, { recursive: true });
  const files = [];
  for (const s of samples) {
    const id = compositionId[s.ch];
    const composition = await selectComposition({ serveUrl, id, inputProps: s.props });
    for (const frame of s.frames) {
      const output = path.join(outDir, `${s.key}-${s.lang}-f${frame}.png`);
      await renderStill({ composition, serveUrl, output, frame, inputProps: s.props, imageFormat: "png", logLevel: "error" });
      files.push({ sample: s, frame, file: output });
      process.stdout.write(`  ${label}: ${s.key}/${s.lang} f${frame}\r`);
    }
  }
  process.stdout.write("\n");
  return files;
}

function compare(a, b) {
  const md5 = (f) => /MD5=(\w+)/.exec(sh("ffmpeg", ["-v", "error", "-i", f, "-f", "md5", "-"]))?.[1];
  const ma = md5(a), mb = md5(b);
  if (ma && ma === mb) return { same: true, ssim: 1, psnr: Infinity };
  const r = spawnSync("ffmpeg", ["-i", a, "-i", b, "-lavfi", "[0:v][1:v]ssim;[0:v][1:v]psnr", "-f", "null", "-"], { encoding: "utf8" });
  const ssim = parseFloat(/SSIM.*All:([\d.]+)/.exec(r.stderr)?.[1] ?? "0");
  const psnrM = /PSNR.*average:([\d.]+|inf)/.exec(r.stderr)?.[1];
  const psnr = psnrM === "inf" ? Infinity : parseFloat(psnrM ?? "0");
  return { same: false, ssim, psnr };
}

async function main() {
  const baseTree = ensureBase();
  const { pub, samples } = prepareSamples();
  if (!samples.length) throw new Error("샘플 없음");
  log(`샘플 ${samples.length}개 / 스틸 ${samples.reduce((n, s) => n + s.frames.length, 0)}장 × 2`);
  for (const s of samples) if (s.fallback) log(`  · ${s.key}: source.mp4 없음 → media 대체 (${path.basename(fallbackMedia())})`);

  const baseUrl = await bundleTree(baseTree, pub, "base");
  const newUrl = await bundleTree(ROOT, pub, "new");
  const A = await renderSet(baseUrl, samples, "base");
  const B = await renderSet(newUrl, samples, "new");

  let fails = 0;
  const rows = [];
  for (let i = 0; i < A.length; i++) {
    const { same, ssim, psnr } = compare(A[i].file, B[i].file);
    const ok = same || (ssim >= 0.999 && psnr >= 45);
    if (!ok) {
      fails++;
      const diff = B[i].file.replace(/\.png$/, ".diff.png");
      spawnSync("ffmpeg", ["-y", "-v", "error", "-i", A[i].file, "-i", B[i].file, "-lavfi", "blend=all_mode=difference,eq=brightness=0.5", diff]);
    }
    rows.push(`${ok ? "✓" : "✗"} ${A[i].sample.key}/${A[i].sample.lang} f${A[i].frame}  ${same ? "md5 동일" : `ssim ${ssim.toFixed(4)} psnr ${psnr === Infinity ? "inf" : psnr.toFixed(1)}`}`);
  }
  log("\n" + rows.join("\n"));
  log(`\n${fails ? "✗" : "✓"} 패리티 ${A.length - fails}/${A.length} 통과${fails ? ` — 실패 스틸: .parity/stills/new/*.diff.png` : ""}`);
  if (!KEEP && !fails) { fs.rmSync(path.join(P, "stills"), { recursive: true, force: true }); }
  process.exit(fails ? 1 : 0);
}

main().catch((e) => { console.error("✗", e.message); process.exit(1); });
