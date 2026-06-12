#!/usr/bin/env node
/**
 * 새 영상 작업 디렉토리 생성 (Remotion 판).
 *
 * 사용법:
 *   node tools/new-video.mjs <channel> <number> [--media <slug>] [--title <t>] [--artist <t>]
 *        [--top-caption <t>] [--orig-lang en|ko|ja] [--trans-lang ko|ja|th]
 *        [--media-kind 映画|ドラマ|アニメ|ドキュメンタリー] [--media-title-ja <t>]
 *        [--artist-track <t>] [--bottom-cta <t>] [--warn-text <t>]
 *
 * HyperFrames 판과 달리 HTML 복사 없음 — videos/<ch>/<n>/ 에 props.json + meta.json + source.mp4 하드링크만 둔다.
 * 컴포지션 로직은 src/channels/ 에 채널당 한 번 존재. 렌더 시 --props 로 주입.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { execFileSync } from "node:child_process";
import {
  CHANNELS,
  ORIG_LANGS,
  TRANS_LANGS,
  FPS,
  channelDefaults,
  hasCaptions,
  hasVideoNumber,
  computeSpaceLabLayout,
  compositionId,
} from "./channels.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");

function die(msg) {
  console.error(`✗ ${msg}`);
  process.exit(1);
}

function parseArgs(argv) {
  const opts = {
    media: "sample",
    title: null,
    artist: null,
    topCaption: null,
    origLang: null,
    transLang: null,
    mediaKind: null,
    mediaTitleJa: null,
    artistTrack: null,
    bottomCTA: null,
    warnText: null,
  };
  const positional = [];
  const take = (i) => argv[++i.v];
  const iref = { v: 0 };
  for (iref.v = 0; iref.v < argv.length; iref.v++) {
    const a = argv[iref.v];
    if (a === "--media") opts.media = take(iref);
    else if (a === "--title") opts.title = take(iref);
    else if (a === "--artist") opts.artist = take(iref);
    else if (a === "--top-caption") opts.topCaption = take(iref).replace(/\\n/g, "\n");
    else if (a === "--orig-lang") opts.origLang = take(iref);
    else if (a === "--trans-lang") opts.transLang = take(iref);
    else if (a === "--media-kind") opts.mediaKind = take(iref);
    else if (a === "--media-title-ja") opts.mediaTitleJa = take(iref);
    else if (a === "--artist-track") opts.artistTrack = take(iref);
    else if (a === "--bottom-cta") opts.bottomCTA = take(iref);
    else if (a === "--warn-text") opts.warnText = take(iref);
    else if (a.startsWith("--")) die(`Unknown flag: ${a}`);
    else positional.push(a);
  }
  const [channel, number] = positional;
  if (!channel || !number) {
    die([
      "Usage: node tools/new-video.mjs <channel> <number> [options]",
      `  channel: one of ${CHANNELS.join(", ")}`,
      "  number:  3자리 권장 (예: 076)",
    ].join("\n"));
  }
  if (positional.length > 2) die(`Unexpected positional arg: ${positional[2]}`);
  if (!CHANNELS.includes(channel)) die(`Unknown channel: ${channel}. Must be one of: ${CHANNELS.join(", ")}`);
  if (!/^[0-9]+$/.test(number)) die(`number must be digits only. Got: ${number}`);
  if (opts.origLang !== null && !ORIG_LANGS.includes(opts.origLang)) die(`--orig-lang must be one of: ${ORIG_LANGS.join(", ")}`);
  if (opts.transLang !== null && !TRANS_LANGS.includes(opts.transLang)) die(`--trans-lang must be one of: ${TRANS_LANGS.join(", ")}`);
  return { channel, number, ...opts };
}

function ensureMediaExists(slug) {
  const mp4 = path.join(ROOT, "media", `${slug}.mp4`);
  if (!fs.existsSync(mp4)) die(`media/${slug}.mp4 not found. prep-media 로 먼저 임포트하거나 --media sample 사용.`);
  return mp4;
}

function parseFps(s) {
  if (!s || typeof s !== "string") return null;
  const [num, den] = s.split("/");
  const n = parseFloat(num), d = den != null ? parseFloat(den) : 1;
  if (!isFinite(n) || !isFinite(d) || d === 0) return null;
  return n / d;
}

// 마지막 디코드 비디오 프레임 pts(초). stream duration 이 아니라 이걸 써서 끝 빈 프레임을 막는다.
function probeLastVideoFramePts(mp4) {
  try {
    const out = execFileSync("ffprobe", [
      "-v", "error", "-select_streams", "v:0",
      "-show_entries", "frame=pts_time", "-of", "csv=p=0", mp4,
    ], { encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });
    let max = -Infinity;
    for (const line of out.split("\n")) {
      const t = parseFloat(line);
      if (isFinite(t) && t > max) max = t;
    }
    return max > 0 ? max : null;
  } catch {
    return null;
  }
}

// durationInFrames = floor(마지막 프레임 pts * fps). fallback: stream duration - 한 프레임.
function probeDurationInFrames(mp4) {
  const lastPts = probeLastVideoFramePts(mp4);
  if (lastPts != null) return Math.floor(lastPts * FPS);
  try {
    const out = execFileSync("ffprobe", [
      "-v", "error", "-print_format", "json",
      "-show_entries", "stream=codec_type,duration,avg_frame_rate:format=duration", mp4,
    ], { encoding: "utf8" });
    const info = JSON.parse(out);
    const v = (info.streams || []).find((s) => s.codec_type === "video");
    const d = v && v.duration ? parseFloat(v.duration) : parseFloat(info.format?.duration);
    if (!isFinite(d) || d <= 0) return null;
    const fps = parseFps(v && v.avg_frame_rate) || FPS;
    return Math.floor((d - 1 / fps) * FPS);
  } catch {
    return null;
  }
}

function probeDimensions(mp4) {
  try {
    const out = execFileSync("ffprobe", [
      "-v", "error", "-select_streams", "v:0",
      "-show_entries", "stream=width,height", "-of", "csv=p=0", mp4,
    ], { encoding: "utf8" }).trim();
    const [w, h] = out.split(",").map((n) => parseInt(n, 10));
    if (w > 0 && h > 0) return { w, h };
  } catch { /* fall through */ }
  return null;
}

function writeJson(file, obj) {
  fs.writeFileSync(file, JSON.stringify(obj, null, 2) + "\n");
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const { channel, number, media } = args;

  const mediaMp4 = ensureMediaExists(media);
  const defaults = channelDefaults[channel];

  const origLang = args.origLang ?? defaults.originalLanguage ?? "en";
  const transLang = args.transLang ?? defaults.translationLanguage ?? "ko";

  const videoDir = path.join(ROOT, "videos", channel, number);
  if (fs.existsSync(videoDir)) die(`Already exists: videos/${channel}/${number}/`);
  fs.mkdirSync(videoDir, { recursive: true });

  // duration (sample placeholder 는 기본 900프레임 유지)
  const durationInFrames =
    media === "sample" ? 900 : probeDurationInFrames(mediaMp4) ?? 900;

  // props = 채널 default + CLI override
  const props = { ...defaults };
  props.originalLanguage = origLang;
  props.translationLanguage = transLang;
  if (args.title !== null) props.title = args.title;
  if (args.artist !== null) props.artist = args.artist;
  if (args.topCaption !== null) props.topCaption = args.topCaption;
  if (args.mediaKind !== null && "mediaKind" in props) props.mediaKind = args.mediaKind;
  if (args.mediaTitleJa !== null && "mediaTitleJa" in props) props.mediaTitleJa = args.mediaTitleJa;
  if (args.artistTrack !== null && "artistTrack" in props) props.artistTrack = args.artistTrack;
  if (args.bottomCTA !== null && "bottomCTA" in props) props.bottomCTA = args.bottomCTA;
  if (args.warnText !== null && "warnText" in props) props.warnText = args.warnText;

  // #번호 자동 주입 (videoNumber 보유 채널)
  if (hasVideoNumber[channel]) props.videoNumber = `#${number}`;

  // 자막 워크플로 채널은 captions 빈 배열로 시작
  if (hasCaptions[channel]) props.captions = [];

  // space_lab: 영상 비율로 밴드 layout 자동 계산
  if (channel === "space_lab") {
    const dim = media === "sample" ? null : probeDimensions(mediaMp4);
    if (dim) {
      props.layout = computeSpaceLabLayout(dim.w, dim.h);
    }
  }

  // videoSrc 는 기본 "source.mp4" (영상 디렉토리 = 렌더 시 --public-dir 가 가리키는 public 루트).
  props.videoSrc = "source.mp4";
  props.durationInFrames = durationInFrames;
  writeJson(path.join(videoDir, "props.json"), props);

  const meta = {
    channel,
    number,
    name: `${channel}/${number}`,
    media: { slug: media, link: "source.mp4" },
    languages: { original: origLang, translation: transLang },
    durationInFrames,
  };
  writeJson(path.join(videoDir, "meta.json"), meta);

  // source.mp4 = media/<slug>.mp4 하드링크.
  // 왜 심볼링크가 아니라 하드링크: Remotion 은 --public-dir 를 임시 번들로 복사할 때 심볼링크를
  // 건너뛴다(404). 하드링크는 실재 파일 항목이라 복사됨 + 같은 볼륨이면 inode 공유 → 추가 디스크 0.
  // 왜 public/media 전체가 아니라 영상 디렉토리만: 렌더 시 --public-dir=videos/<ch>/<n> 로 그 영상의
  // 미디어 1개만 번들 (public/media 에 전 영상을 쌓으면 렌더마다 전부 복사돼 느려짐).
  const srcLink = path.join(videoDir, "source.mp4");
  try {
    fs.linkSync(path.resolve(mediaMp4), srcLink);
  } catch {
    fs.copyFileSync(path.resolve(mediaMp4), srcLink); // 다른 볼륨 fallback
  }

  const videoPath = `videos/${channel}/${number}`;
  const compId = compositionId[channel];
  const durS = (durationInFrames / FPS).toFixed(2);
  console.log(`✓ Created ${videoPath}/`);
  console.log(`  channel=${channel}  number=${number}  media=${media}  orig=${origLang}  trans=${transLang}`);
  console.log(`  durationInFrames=${durationInFrames} (${durS}s @ ${FPS}fps)` + (media === "sample" ? "  [sample placeholder]" : ""));
  console.log("");
  console.log("Next:");
  if (hasCaptions[channel]) {
    console.log(`  1) node tools/transcribe.mjs ${videoPath}/source.mp4 --language ${origLang}`);
    console.log(`  2) 자막 생성 — 둘 중 하나:`);
    console.log(`     A. 스크립트 있음: ${videoPath}/script.txt 작성 후  node tools/align-script.mjs ${videoPath}`);
    console.log(`     B. 스크립트 없음: Claude 가 transcript → props.json captions 변환 (phrase 그룹핑 + ${transLang.toUpperCase()} 번역)`);
    console.log(`  3) node tools/check-captions.mjs ${videoPath}`);
    console.log(`  4) node tools/validate-props.mjs ${videoPath}`);
    console.log(`  5) mkdir -p output/${channel} && npx remotion render src/index.ts ${compId} output/${channel}/${number}.mp4 \\`);
    console.log(`        --props=${videoPath}/props.json --public-dir=${videoPath}`);
  } else {
    console.log(`  1) ${videoPath}/props.json 에서 topCaption(헤드라인) 등 확인 (이 채널은 자막 없음)`);
    console.log(`  2) node tools/preview.mjs ${channel} ${number}`);
    console.log(`  3) node tools/validate-props.mjs ${videoPath}`);
    console.log(`  4) mkdir -p output/${channel} && npx remotion render src/index.ts ${compId} output/${channel}/${number}.mp4 \\`);
    console.log(`        --props=${videoPath}/props.json --public-dir=${videoPath}`);
  }
}

main();
