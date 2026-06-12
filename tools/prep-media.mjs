#!/usr/bin/env node
/**
 * 공유 미디어 임포트 (모든 채널 공통 "0단계").
 *
 * 원본 음악/영화/드라마 클립을 media/<slug>.mp4 로 들여오면서 렌더 안전성을 보장:
 *   1) H.264 + 조밀한 키프레임(-g 30)으로 트랜스코드 — seek 기반 렌더가 프레임에서 멈추는 것 방지.
 *      (HEVC/.mov 뿐 아니라 키프레임이 듬성한 H.264 소스도 동일 문제 → 임포트 시 항상 정규화)
 *   2) 음량이 작을 때만 loudnorm으로 정규화 (기본 타깃 -14 LUFS). 이미 충분히 크면 건드리지 않음.
 *   3) 사이드카 media/<slug>.json 생성/갱신 (실측 duration_s 포함).
 *
 * 사용법:
 *   node tools/prep-media.mjs <input-file> <slug> [options]
 *
 * 예시:
 *   node tools/prep-media.mjs ~/Desktop/066소스.mp4 jamila-wife \
 *     --kind drama --title "Designated Survivor" \
 *     --source "Designated Survivor (TV series)" --lang en \
 *     --notes "충격 반전 인터뷰 장면"
 *
 * 옵션:
 *   --kind <music|movie|drama|anime|doc|...>   사이드카 kind (default: movie)
 *   --title <text>
 *   --source <text>                            artist_or_source
 *   --lang <en|ko|ja>                          original_language (default: en)
 *   --notes <text>
 *   --target-lufs <n>                          loudnorm 타깃 (default: -14)
 *   --quiet-threshold <n>                      통합 라우드니스가 이 값 미만이면 정규화 (default: -16)
 *   --force-normalize                          항상 정규화 (조용/큼 무관)
 *   --no-normalize                             정규화 건너뜀 (오디오는 그대로 aac 재인코딩)
 *   --crf <n>                                  x264 CRF (default: 18, 시각적 무손실급)
 *   --overwrite                                media/<slug>.mp4 가 이미 있으면 덮어쓰기
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { execFileSync, spawnSync } from "node:child_process";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const ORIG_LANGS = ["en", "ko", "ja"];

function die(msg) {
  console.error(`✗ ${msg}`);
  process.exit(1);
}

function parseArgs(argv) {
  const opts = {
    kind: "movie", title: null, source: null, lang: "en", notes: null,
    targetLufs: -14, quietThreshold: -16,
    forceNormalize: false, noNormalize: false, crf: 18, overwrite: false,
  };
  const positional = [];
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--kind") opts.kind = argv[++i];
    else if (a === "--title") opts.title = argv[++i];
    else if (a === "--source") opts.source = argv[++i];
    else if (a === "--lang") opts.lang = argv[++i];
    else if (a === "--notes") opts.notes = argv[++i];
    else if (a === "--target-lufs") opts.targetLufs = parseFloat(argv[++i]);
    else if (a === "--quiet-threshold") opts.quietThreshold = parseFloat(argv[++i]);
    else if (a === "--force-normalize") opts.forceNormalize = true;
    else if (a === "--no-normalize") opts.noNormalize = true;
    else if (a === "--crf") opts.crf = parseInt(argv[++i], 10);
    else if (a === "--overwrite") opts.overwrite = true;
    else if (a.startsWith("--")) die(`Unknown flag: ${a}`);
    else positional.push(a);
  }
  const [input, slug] = positional;
  if (!input || !slug) {
    die([
      "Usage: node tools/prep-media.mjs <input-file> <slug> [options]",
      "  <input-file>  원본 mp4/mov/... 경로",
      "  <slug>        media/<slug>.mp4 로 저장될 슬러그 (소문자/숫자/하이픈)",
      "  --kind, --title, --source, --lang, --notes   사이드카 필드",
      "  --target-lufs -14   --quiet-threshold -16   --force-normalize | --no-normalize",
      "  --crf 18   --overwrite",
    ].join("\n"));
  }
  if (positional.length > 2) die(`Unexpected positional arg: ${positional[2]}`);
  if (!/^[a-z0-9][a-z0-9-]*$/.test(slug)) die(`slug must be lowercase letters/digits/hyphens. Got: ${slug}`);
  if (!ORIG_LANGS.includes(opts.lang)) die(`--lang must be one of: ${ORIG_LANGS.join(", ")}`);
  if (!fs.existsSync(input)) die(`input file not found: ${input}`);
  return { input, slug, ...opts };
}

function ffprobeJson(file) {
  const out = execFileSync("ffprobe", [
    "-v", "error", "-print_format", "json",
    "-show_entries", "stream=codec_type,codec_name,duration:format=duration",
    file,
  ], { encoding: "utf8" });
  return JSON.parse(out);
}

function videoDurationOf(file) {
  const info = ffprobeJson(file);
  const v = (info.streams || []).find((s) => s.codec_type === "video");
  const d = v && v.duration ? parseFloat(v.duration) : parseFloat(info.format?.duration);
  if (!isFinite(d)) die(`could not read duration of ${file}`);
  return d;
}

function hasAudioStream(file) {
  const info = ffprobeJson(file);
  return (info.streams || []).some((s) => s.codec_type === "audio");
}

// loudnorm 측정 패스 — 통합 라우드니스(input_i) 반환. 오디오 없으면 null.
// ffmpeg는 print_format=json 결과를 stderr에 출력하고 exit 0으로 끝나므로 spawnSync로 stderr를 직접 읽는다.
function measureLoudness(file) {
  if (!hasAudioStream(file)) return null;
  const res = spawnSync("ffmpeg", [
    "-hide_banner", "-i", file,
    "-af", "loudnorm=print_format=json", "-f", "null", "-",
  ], { encoding: "utf8" });
  const stderr = String(res.stderr || "");
  const m = stderr.match(/\{[\s\S]*"input_i"[\s\S]*?\}/);
  if (!m) return null;
  try {
    return parseFloat(JSON.parse(m[0]).input_i);
  } catch {
    return null;
  }
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const { input, slug } = args;

  const outMp4 = path.join(ROOT, "media", `${slug}.mp4`);
  const outJson = path.join(ROOT, "media", `${slug}.json`);
  if (fs.existsSync(outMp4) && !args.overwrite) {
    die(`media/${slug}.mp4 already exists. --overwrite 로 덮어쓰거나 다른 slug 사용.`);
  }

  const inInfo = ffprobeJson(input);
  const inVideo = (inInfo.streams || []).find((s) => s.codec_type === "video");
  const hasAudio = hasAudioStream(input);

  // 정규화 여부 결정
  let inputLufs = null;
  let willNormalize = false;
  if (hasAudio && !args.noNormalize) {
    if (args.forceNormalize) {
      willNormalize = true;
    } else {
      inputLufs = measureLoudness(input);
      if (inputLufs !== null && inputLufs < args.quietThreshold) willNormalize = true;
    }
  }

  console.log(`▸ input:  ${input}`);
  console.log(`  video=${inVideo?.codec_name || "?"}  audio=${hasAudio ? "yes" : "none"}` +
    (inputLufs !== null ? `  integrated=${inputLufs} LUFS` : ""));
  console.log(`▸ transcode: H.264 (crf ${args.crf}) + 키프레임 -g 30` +
    (willNormalize ? `  + loudnorm I=${args.targetLufs}` : (hasAudio ? "  (audio: 정규화 불필요)" : "  (audio 없음)")));

  // ffmpeg 트랜스코드
  const vf = ["-c:v", "libx264", "-preset", "medium", "-crf", String(args.crf),
    "-g", "30", "-keyint_min", "30", "-sc_threshold", "0", "-pix_fmt", "yuv420p"];
  let af = [];
  if (hasAudio) {
    if (willNormalize) af = ["-af", `loudnorm=I=${args.targetLufs}:TP=-1.5:LRA=11`];
    af = af.concat(["-c:a", "aac", "-b:a", "192k"]);
  } else {
    af = ["-an"];
  }
  execFileSync("ffmpeg", ["-y", "-i", input, ...vf, ...af, "-loglevel", "error", outMp4],
    { stdio: ["ignore", "inherit", "inherit"] });

  const outDur = videoDurationOf(outMp4);
  const outLufs = (hasAudio && willNormalize) ? measureLoudness(outMp4) : inputLufs;

  // 사이드카 — 기존 파일 있으면 필드 보존, duration_s만 갱신
  let sidecar = {};
  if (fs.existsSync(outJson)) {
    try { sidecar = JSON.parse(fs.readFileSync(outJson, "utf8")); } catch { sidecar = {}; }
  }
  sidecar.slug = slug;
  sidecar.kind = args.kind ?? sidecar.kind ?? "movie";
  if (args.title !== null || sidecar.title === undefined) sidecar.title = args.title ?? sidecar.title ?? "";
  if (args.source !== null || sidecar.artist_or_source === undefined) {
    sidecar.artist_or_source = args.source ?? sidecar.artist_or_source ?? "";
  }
  sidecar.original_language = args.lang ?? sidecar.original_language ?? "en";
  sidecar.duration_s = Math.round(outDur * 100) / 100;
  if (args.notes !== null || sidecar.notes === undefined) sidecar.notes = args.notes ?? sidecar.notes ?? "";
  fs.writeFileSync(outJson, JSON.stringify(sidecar, null, 2) + "\n");

  console.log("");
  console.log(`✓ media/${slug}.mp4  (${sidecar.duration_s}s` +
    (outLufs !== null ? `, ${outLufs} LUFS` : "") + ")");
  console.log(`✓ media/${slug}.json`);
  console.log("");
  console.log("Next:");
  console.log(`  node tools/new-video.mjs <channel> <number> --media ${slug} \\`);
  console.log(`    --orig-lang ${sidecar.original_language} --trans-lang <ko|ja|th> [--title ... --top-caption ...]`);
}

main();
