#!/usr/bin/env node
/**
 * 별도 음원 + 영상 자동 싱크 먹싱 (prep-media 이전 선택 단계, "0-pre 단계").
 *
 * 직캠/저품질 오디오 영상과 깨끗한 공식 음원을 따로 받았을 때:
 *   1) 영상의 임베디드 오디오와 음원을 onset envelope 교차상관(NCC)으로 정렬해 오프셋 자동 탐지
 *      (coarse 10ms → refine 1ms, 신뢰도 미달이면 후보 출력 후 중단)
 *   2) 깨끗한 음원을 영상에 입혀 먹싱 — 비디오는 무손실(-c:v copy), 오디오는 AAC 192k
 *   3) 먹싱 후 자동 검증 (output 오디오 vs 원본 영상 오디오 잔차 오프셋 재측정)
 *
 * 결과물(-synced.mp4)을 prep-media.mjs 입력으로 사용. loudnorm/키프레임 정규화는
 * prep-media 담당이므로 여기선 하지 않는다.
 *
 * 오프셋 부호 정의: offset = 음원 파일에서 영상 t=0에 대응하는 시각(초).
 *   양수 = 음원이 영상보다 먼저 시작 (음원 앞 offset초를 잘라서 입힘)
 *   음수 = 영상 |offset|초 지점에서 음원 시작 (영상 도입부는 무음 패딩)
 *
 * 사용법:
 *   node tools/sync-av.mjs <video> <audio> [options]
 *
 * 예시:
 *   node tools/sync-av.mjs ~/Downloads/fancam.mp4 ~/Downloads/official.m4a
 *   # → ~/Downloads/fancam-synced.mp4
 *
 * 옵션:
 *   --offset <s>            오프셋 수동 지정, 자동 탐지 생략 (음수 가능)
 *   --analyze-only          오프셋 탐지/리포트만, 먹싱 안 함
 *   --output <path>         출력 경로 (default: <영상 디렉토리>/<영상이름>-synced.mp4)
 *   --trim-overlap          영상/음원이 둘 다 겹치는 구간만 출력 (안 겹치는 쪽은 잘라냄).
 *                           기본 동작은 영상 풀길이 유지 + 모자란 구간 무음 패딩.
 *                           앞이 잘리면 비디오 재인코딩(x264 crf 18), 앞 그대로면 무손실 copy.
 *   --max-offset <s>        탐색 lag 범위를 ±s 로 제한
 *   --keep-original-audio   원본 영상 오디오를 두 번째 트랙으로 보존 (A/B 청취용)
 *   --force                 신뢰도 미달이어도 최고 후보로 먹싱 강행
 *   --no-verify             먹싱 후 자동 검증 생략
 *
 * 멀티 오디오 스트림은 항상 a:0 만 사용. 속도/드리프트 보정은 범위 외(v1) — 감지 시 경고만.
 */
import fs from "node:fs";
import path from "node:path";
import { execFileSync, spawnSync } from "node:child_process";

const RATE = 8000;            // 탐지용 디코드 샘플레이트
const COARSE_HOP = 80;        // 10ms @ 8kHz → 100Hz envelope
const FINE_HOP = 8;           // 1ms @ 8kHz → 1000Hz envelope
const MIN_OVERLAP_S = 5;      // coarse 탐색 최소 겹침
const MIN_PEAK = 0.35;        // coarse 피크 합격 하한
const MIN_PEAK_RATIO = 1.25;  // 1위/2위 피크 비율 하한
const REFINE_MIN_PEAK = 0.2;  // refine 피크가 이 미만이면 coarse 값 유지
const LONG_AUDIO_WARN_S = 1200;

function die(msg) {
  console.error(`✗ ${msg}`);
  process.exit(1);
}

function parseArgs(argv) {
  const opts = {
    offset: null, analyzeOnly: false, output: null, maxOffset: null,
    keepOriginalAudio: false, force: false, noVerify: false, trimOverlap: false,
  };
  const positional = [];
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--offset") opts.offset = parseFloat(argv[++i]);
    else if (a === "--analyze-only") opts.analyzeOnly = true;
    else if (a === "--output") opts.output = argv[++i];
    else if (a === "--trim-overlap") opts.trimOverlap = true;
    else if (a === "--max-offset") opts.maxOffset = parseFloat(argv[++i]);
    else if (a === "--keep-original-audio") opts.keepOriginalAudio = true;
    else if (a === "--force") opts.force = true;
    else if (a === "--no-verify") opts.noVerify = true;
    else if (a.startsWith("--")) die(`Unknown flag: ${a}`);
    else positional.push(a);
  }
  const [video, audio] = positional;
  if (!video || !audio) {
    die([
      "Usage: node tools/sync-av.mjs <video> <audio> [options]",
      "  <video>  임베디드 오디오가 저품질인 영상 (mp4/mov/...)",
      "  <audio>  깨끗한 음원 (mp3/m4a/wav/... — 영상 파일도 허용, a:0 사용)",
      "  --offset <s> | --analyze-only | --output <path> | --trim-overlap | --max-offset <s>",
      "  --keep-original-audio | --force | --no-verify",
      "  offset 부호: 음원 t=offset 지점 = 영상 t=0 (음수면 영상 도입부 무음 패딩)",
    ].join("\n"));
  }
  if (positional.length > 2) die(`Unexpected positional arg: ${positional[2]}`);
  if (opts.offset !== null && !isFinite(opts.offset)) die("--offset 값이 숫자가 아님");
  if (opts.maxOffset !== null && (!isFinite(opts.maxOffset) || opts.maxOffset <= 0)) {
    die("--max-offset 은 양수여야 함");
  }
  if (!fs.existsSync(video)) die(`video file not found: ${video}`);
  if (!fs.existsSync(audio)) die(`audio file not found: ${audio}`);
  return { video, audio, ...opts };
}

function ffprobeJson(file) {
  const out = execFileSync("ffprobe", [
    "-v", "error", "-print_format", "json",
    "-show_entries", "stream=codec_type,codec_name,duration,sample_rate:format=duration",
    file,
  ], { encoding: "utf8" });
  return JSON.parse(out);
}

function hasAudioStream(file) {
  const info = ffprobeJson(file);
  return (info.streams || []).some((s) => s.codec_type === "audio");
}

function hasVideoStream(file) {
  const info = ffprobeJson(file);
  return (info.streams || []).some((s) => s.codec_type === "video");
}

function videoDurationOf(file) {
  const info = ffprobeJson(file);
  const v = (info.streams || []).find((s) => s.codec_type === "video");
  const d = v && v.duration ? parseFloat(v.duration) : parseFloat(info.format?.duration);
  if (!isFinite(d)) die(`could not read duration of ${file}`);
  return d;
}

// 첫 오디오 스트림(a:0) 정보 — duration / sample_rate
function audioInfoOf(file) {
  const info = ffprobeJson(file);
  const a = (info.streams || []).find((s) => s.codec_type === "audio");
  if (!a) return null;
  const d = a.duration ? parseFloat(a.duration) : parseFloat(info.format?.duration);
  const sr = a.sample_rate ? parseInt(a.sample_rate, 10) : null;
  return { duration: isFinite(d) ? d : null, sampleRate: isFinite(sr) ? sr : null };
}

// a:0 을 mono 8kHz f32le PCM 으로 디코드 → Float32Array
function decodePcm(file) {
  const res = spawnSync("ffmpeg", [
    "-v", "error", "-i", file,
    "-map", "a:0", "-ac", "1", "-ar", String(RATE), "-f", "f32le", "-",
  ], { maxBuffer: 1 << 30 });
  if (res.error) die(`ffmpeg 실행 실패: ${res.error.message}`);
  if (res.status !== 0) die(`오디오 디코드 실패 (${file}):\n${String(res.stderr || "")}`);
  const buf = res.stdout;
  const n = Math.floor(buf.length / 4);
  if (n < RATE) die(`오디오가 너무 짧음 (${file}): ${(n / RATE).toFixed(2)}s`);
  // Buffer pool offset 이 4의 배수가 아닐 수 있어 정렬된 ArrayBuffer 로 복사 후 view
  const ab = new ArrayBuffer(n * 4);
  new Uint8Array(ab).set(buf.subarray(0, n * 4));
  return new Float32Array(ab);
}

// onset strength envelope: hop 단위 log 에너지의 양의 차분, zero-mean.
// 로그 도메인 + onset 이라 믹스가 크게 달라도(직캠 앰비언스 vs 스튜디오 마스터)
// 공통 트랜지언트(드럼/음절 시작)로 정렬 가능.
function onsetEnvelope(pcm, hop) {
  const n = Math.floor(pcm.length / hop);
  const logE = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    let s = 0;
    const base = i * hop;
    for (let j = 0; j < hop; j++) { const x = pcm[base + j]; s += x * x; }
    logE[i] = Math.log(s / hop + 1e-9);
  }
  const env = new Float32Array(n);
  let mean = 0;
  for (let i = 1; i < n; i++) {
    const d = logE[i] - logE[i - 1];
    env[i] = d > 0 ? d : 0;
    mean += env[i];
  }
  mean /= Math.max(1, n);
  for (let i = 0; i < n; i++) env[i] -= mean;
  return env;
}

// sliding NCC: b[i+τ] ≈ a[i] 인 τ 탐색. prefix sum 으로 per-lag 정규화.
// 반환: { scores, lagLo } — scores[k] = lag (lagLo + k) 의 정규화 상관값 (겹침 부족 lag 은 -Infinity)
function nccSearch(a, b, { minOverlap, lagLo = null, lagHi = null }) {
  const Nv = a.length, Na = b.length;
  const lo = Math.max(lagLo ?? -(Nv - minOverlap), -(Nv - minOverlap));
  const hi = Math.min(lagHi ?? (Na - minOverlap), Na - minOverlap);
  if (hi < lo) return null;
  const pa2 = new Float64Array(Nv + 1);
  for (let i = 0; i < Nv; i++) pa2[i + 1] = pa2[i] + a[i] * a[i];
  const pb2 = new Float64Array(Na + 1);
  for (let i = 0; i < Na; i++) pb2[i + 1] = pb2[i] + b[i] * b[i];
  const scores = new Float64Array(hi - lo + 1).fill(-Infinity);
  for (let t = lo; t <= hi; t++) {
    const i0 = Math.max(0, -t), i1 = Math.min(Nv, Na - t);
    if (i1 - i0 < minOverlap) continue;
    let dot = 0;
    for (let i = i0; i < i1; i++) dot += a[i] * b[i + t];
    const na = pa2[i1] - pa2[i0];
    const nb = pb2[i1 + t] - pb2[i0 + t];
    scores[t - lo] = dot / Math.sqrt(na * nb + 1e-12);
  }
  return { scores, lagLo: lo };
}

// 상위 n개 피크 (greedy non-max suppression, 메인 피크 ±excludeRadius 프레임 제외)
function topPeaks(scores, lagLo, { n = 3, excludeRadius = 100 } = {}) {
  const s = Float64Array.from(scores);
  const peaks = [];
  for (let k = 0; k < n; k++) {
    let pk = -1, best = -Infinity;
    for (let i = 0; i < s.length; i++) if (s[i] > best) { best = s[i]; pk = i; }
    if (pk < 0 || !isFinite(best)) break;
    peaks.push({ lag: lagLo + pk, score: best });
    s.fill(-Infinity, Math.max(0, pk - excludeRadius), Math.min(s.length, pk + excludeRadius + 1));
  }
  return peaks;
}

// coarse 오프셋 ±150ms 범위를 1ms envelope 로 정밀화 (+ 포물선 보간 → sub-ms)
// 실패(피크 약함/범위 밖)면 null → coarse 값 유지
function refineOffset(videoPcm, audioPcm, coarseS) {
  const PAD = 0.15;
  const videoDurS = videoPcm.length / RATE;
  const audioDurS = audioPcm.length / RATE;
  // 윈도우는 음원이 (±PAD 여유 포함) 커버하는 video 구간 안에서만 선택
  const tLo = Math.max(0, PAD - coarseS);
  const tHiEnd = Math.min(videoDurS, audioDurS - coarseS - PAD);
  if (tHiEnd - tLo < 5) return null;
  const winS = Math.min(30, tHiEnd - tLo);
  // onset 밀도(Σ envelope⁺)가 최대인 winS 구간을 유효 범위에서 선택
  const envC = onsetEnvelope(videoPcm, COARSE_HOP);
  const W = Math.max(1, Math.floor(winS * 100));
  const pos = new Float64Array(envC.length + 1);
  for (let i = 0; i < envC.length; i++) pos[i + 1] = pos[i] + Math.max(0, envC[i]);
  let iLo = Math.min(envC.length - W, Math.ceil(tLo * 100 - 1e-6));
  let iHi = Math.min(envC.length - W, Math.floor((tHiEnd - winS) * 100 + 1e-6));
  // winS == 가용폭 전체일 때 수치 오차로 범위가 붕괴할 수 있음 (PAD 여유 ~10ms 손해뿐이라 무해)
  if (iHi < iLo) iLo = iHi;
  if (iLo < 0) return null;
  let best = -Infinity, bestI = iLo;
  for (let i = iLo; i <= iHi; i++) {
    const run = pos[i + W] - pos[i];
    if (run > best) { best = run; bestI = i; }
  }
  const t0 = bestI / 100;
  const vA = Math.floor(t0 * RATE);
  const vB = Math.min(videoPcm.length, vA + Math.floor(winS * RATE));
  const aStartS = Math.max(0, t0 + coarseS - PAD);
  const aA = Math.floor(aStartS * RATE);
  const aB = Math.min(audioPcm.length, aA + (vB - vA) + Math.floor(2 * PAD * RATE));
  const envV = onsetEnvelope(videoPcm.subarray(vA, vB), FINE_HOP);
  const envA = onsetEnvelope(audioPcm.subarray(aA, aB), FINE_HOP);
  if (envA.length <= envV.length) return null;
  const res = nccSearch(envV, envA, { minOverlap: envV.length });
  if (!res) return null;
  const s = res.scores;
  let pk = 0;
  for (let i = 1; i < s.length; i++) if (s[i] > s[pk]) pk = i;
  if (!isFinite(s[pk]) || s[pk] < REFINE_MIN_PEAK) return null;
  let frac = 0;
  if (pk > 0 && pk < s.length - 1 && isFinite(s[pk - 1]) && isFinite(s[pk + 1])) {
    const denom = s[pk - 1] - 2 * s[pk] + s[pk + 1];
    if (denom < 0) frac = 0.5 * (s[pk - 1] - s[pk + 1]) / denom;
  }
  const tau = (res.lagLo + pk + frac) / 1000;
  return { offset: aA / RATE + tau - t0, score: s[pk] };
}

// 영상 시작/중간/끝 세그먼트별 로컬 오프셋 비교 — 단조 50ms+ 차이면 드리프트로 판단.
// v1 은 감지/경고만 (속도 보정 없음). 판단 불가 구간이 있으면 null.
function checkDrift(videoPcm, audioPcm, offsetS) {
  const SEG = 15, PAD = 2;
  const dur = videoPcm.length / RATE;
  if (dur < 45) return null;
  const local = [];
  for (const vt of [0, (dur - SEG) / 2, dur - SEG]) {
    const vA = Math.floor(vt * RATE), vB = vA + SEG * RATE;
    const aStartS = Math.max(0, vt + offsetS - PAD);
    const aA = Math.floor(aStartS * RATE);
    const aB = Math.min(audioPcm.length, aA + (SEG + 2 * PAD) * RATE);
    const envV = onsetEnvelope(videoPcm.subarray(vA, vB), COARSE_HOP);
    const envA = onsetEnvelope(audioPcm.subarray(aA, aB), COARSE_HOP);
    if (envA.length <= envV.length) return null;
    const res = nccSearch(envV, envA, { minOverlap: envV.length });
    if (!res) return null;
    const s = res.scores;
    let pk = 0;
    for (let i = 1; i < s.length; i++) if (s[i] > s[pk]) pk = i;
    if (!isFinite(s[pk]) || s[pk] < REFINE_MIN_PEAK) return null;
    local.push(aA / RATE + (res.lagLo + pk) / 100 - vt);
  }
  const [o1, o2, o3] = local;
  const monotonic = ((o2 - o1) >= 0 && (o3 - o2) >= 0) || ((o2 - o1) <= 0 && (o3 - o2) <= 0);
  if (monotonic && Math.abs(o3 - o1) > 0.05) {
    return { total: o3 - o1, perMin: (o3 - o1) / (dur / 60) };
  }
  return null;
}

// opts: { output, keepOriginalAudio, trimStartV, outDur }
// trimStartV > 0 (겹침 추출로 영상 앞이 잘림) 이면 비디오 재인코딩(입력 -ss 는 재인코딩 시 frame-accurate),
// 아니면 무손실 copy. 영상 입력에 -ss 가 걸리면 0:a:0(보존 트랙)도 같이 잘려 정렬 유지됨.
function muxOutput(videoFile, audioFile, offsetS, audioSampleRate, opts) {
  const trimStartV = opts.trimStartV ?? 0;
  const audioStart = Math.max(0, offsetS);
  let afilter;
  if (offsetS >= 0 || trimStartV > 0) {
    afilter = `[1:a:0]atrim=start=${audioStart.toFixed(6)},asetpts=PTS-STARTPTS,apad[a]`;
  } else if (audioSampleRate) {
    // 'S' suffix = 샘플 단위 딜레이 (sample-accurate)
    afilter = `[1:a:0]adelay=delays=${Math.round(-offsetS * audioSampleRate)}S:all=1,apad[a]`;
  } else {
    afilter = `[1:a:0]adelay=delays=${Math.round(-offsetS * 1000)}:all=1,apad[a]`;
  }
  const inputV = trimStartV > 0 ? ["-ss", trimStartV.toFixed(6), "-i", videoFile] : ["-i", videoFile];
  const vcodec = trimStartV > 0
    ? ["-c:v", "libx264", "-preset", "medium", "-crf", "18",
       "-g", "30", "-keyint_min", "30", "-sc_threshold", "0", "-pix_fmt", "yuv420p"]
    : ["-c:v", "copy"];
  const maps = ["-map", "0:v:0", "-map", "[a]"];
  if (opts.keepOriginalAudio) maps.push("-map", "0:a:0");
  execFileSync("ffmpeg", [
    "-y", "-v", "error",
    ...inputV, "-i", audioFile,
    "-filter_complex", afilter,
    ...maps,
    ...vcodec, "-c:a", "aac", "-b:a", "192k",
    "-t", opts.outDur.toFixed(3),
    "-movflags", "+faststart",
    opts.output,
  ], { stdio: ["ignore", "inherit", "inherit"] });
}

// output 의 (교체된) 오디오 vs 원본 영상의 임베디드 오디오 — 잔차 오프셋 ±2s 범위 재측정
function verifyOutput(outFile, videoPcm) {
  const outPcm = decodePcm(outFile);
  const envOut = onsetEnvelope(outPcm, COARSE_HOP);
  const envVid = onsetEnvelope(videoPcm, COARSE_HOP);
  const minOv = Math.max(100, Math.min(envVid.length, envOut.length) - 300);
  const res = nccSearch(envVid, envOut, { minOverlap: minOv, lagLo: -200, lagHi: 200 });
  if (!res) return null;
  const peaks = topPeaks(res.scores, res.lagLo, { n: 1 });
  if (!peaks.length) return null;
  return { residual: peaks[0].lag / 100, score: peaks[0].score };
}

function describeOffset(offsetS, trimOverlap) {
  const o = offsetS.toFixed(3);
  if (offsetS >= 0) {
    return `offset +${o}s — 음원의 ${o}초 지점이 영상 시작(t=0)과 일치 (음원 앞 ${o}s 잘라서 입힘)`;
  }
  const p = (-offsetS).toFixed(3);
  return `offset ${o}s — 영상 ${p}초 지점에서 음원 시작 ` +
    (trimOverlap ? `(도입부 ${p}s는 잘림)` : `(도입부 ${p}s는 무음 패딩)`);
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const { video, audio } = args;

  if (!hasVideoStream(video)) die(`비디오 스트림이 없음: ${video}`);
  const audioInfo = audioInfoOf(audio);
  if (!audioInfo) die(`오디오 스트림이 없음: ${audio}`);
  const videoDur = videoDurationOf(video);
  const audioDur = audioInfo.duration ?? Infinity;
  const vHasAudio = hasAudioStream(video);

  console.log(`▸ video: ${video}  (${videoDur.toFixed(2)}s, 임베디드 오디오 ${vHasAudio ? "있음" : "없음"})`);
  console.log(`▸ audio: ${audio}  (${isFinite(audioDur) ? audioDur.toFixed(2) + "s" : "길이 미상"})`);

  let offset;
  let videoPcm = null;

  if (args.offset !== null) {
    offset = args.offset;
    console.log(`▸ 수동 오프셋 사용: ${describeOffset(offset, args.trimOverlap)}`);
    if (!args.noVerify && vHasAudio && !args.analyzeOnly) videoPcm = decodePcm(video);
  } else {
    if (!vHasAudio) {
      die("영상에 오디오가 없어 자동 정렬 불가. --offset <s> 로 수동 지정 필요.");
    }
    if (audioDur > LONG_AUDIO_WARN_S) {
      console.log(`⚠ 음원이 ${(audioDur / 60).toFixed(1)}분으로 김 — 탐색이 느리면 --max-offset 으로 범위 제한 권장`);
    }
    console.log("▸ 오디오 디코드 + onset envelope 계산 중...");
    videoPcm = decodePcm(video);
    const audioPcm = decodePcm(audio);
    const envV = onsetEnvelope(videoPcm, COARSE_HOP);
    const envA = onsetEnvelope(audioPcm, COARSE_HOP);

    const minOverlap = Math.max(100, Math.min(MIN_OVERLAP_S * 100, Math.floor(envV.length * 0.8)));
    const lagLimit = args.maxOffset !== null ? Math.round(args.maxOffset * 100) : null;
    console.log("▸ 교차상관 탐색 중...");
    const res = nccSearch(envV, envA, {
      minOverlap,
      lagLo: lagLimit !== null ? -lagLimit : null,
      lagHi: lagLimit !== null ? lagLimit : null,
    });
    if (!res) die("탐색 가능한 lag 범위가 없음 (--max-offset 이 너무 작거나 입력이 너무 짧음)");

    const peaks = topPeaks(res.scores, res.lagLo, { n: 3, excludeRadius: 100 });
    if (!peaks.length) die("상관 피크를 찾지 못함");
    const p1 = peaks[0].score;
    const p2 = peaks.length > 1 ? peaks[1].score : -Infinity;
    const confident = p1 >= MIN_PEAK && (p2 <= 0 || p1 / Math.max(p2, 1e-6) >= MIN_PEAK_RATIO);

    if (!confident && !args.force) {
      console.error(`⚠ 정렬 신뢰도 미달 (peak=${p1.toFixed(3)}, 2위 대비 ${p2 > 0 ? (p1 / p2).toFixed(2) : "∞"}배)`);
      console.error("  후보 오프셋:");
      for (const p of peaks) {
        console.error(`    ${(p.lag / 100) >= 0 ? "+" : ""}${(p.lag / 100).toFixed(2)}s  (score ${p.score.toFixed(3)})`);
      }
      console.error("  → 직접 들어보고 --offset <s> 로 지정하거나, 최고 후보로 강행하려면 --force.");
      console.error("  (라이브 버전 vs 스튜디오 음원처럼 연주 자체가 다르면 자동 정렬 불가)");
      process.exit(1);
    }

    const coarse = peaks[0].lag / 100;
    const fine = refineOffset(videoPcm, audioPcm, coarse);
    offset = fine ? fine.offset : coarse;
    if (!fine) console.log("⚠ 정밀화 실패 — coarse 값 사용 (10ms 정밀도)");

    console.log(`✓ ${describeOffset(offset, args.trimOverlap)}`);
    console.log(`  신뢰도: peak ${p1.toFixed(3)}` +
      (p2 > 0 ? `, 2위 대비 ${(p1 / p2).toFixed(2)}배` : "") +
      (fine ? `, refine peak ${fine.score.toFixed(3)}` : "") +
      (confident ? "" : "  (--force 강행)"));

    const drift = checkDrift(videoPcm, audioPcm, offset);
    if (drift) {
      console.log(`⚠ 구간별 오프셋 드리프트 감지: 전체 ${(drift.total * 1000).toFixed(0)}ms (~${(drift.perMin * 1000).toFixed(0)}ms/min)`);
      console.log("  다른 마스터/속도 차이 가능성. v1은 고정 오프셋만 지원 — 끝부분 싱크가 어긋날 수 있으니 미리보기로 확인.");
    }
  }

  if (args.analyzeOnly) {
    console.log("▸ --analyze-only: 먹싱 생략");
    return;
  }

  // 오프셋 정합성 + 커버리지 점검
  if (offset >= audioDur) die(`offset(${offset.toFixed(2)}s)이 음원 길이(${audioDur.toFixed(2)}s)를 벗어남`);
  if (offset <= -videoDur) die(`offset(${offset.toFixed(2)}s)이 영상 길이(-${videoDur.toFixed(2)}s)를 벗어남`);
  const coveredEnd = (isFinite(audioDur) ? audioDur : Infinity) - offset; // 영상 타임라인에서 음원이 끝나는 시각

  let trimStartV = 0;
  let outDur = videoDur;
  if (args.trimOverlap) {
    trimStartV = Math.max(0, -offset);
    const trimEndV = Math.min(videoDur, coveredEnd);
    if (trimEndV - trimStartV < 1) die("영상/음원 겹침 구간이 1초 미만 — 오프셋이 잘못됐거나 입력 불일치");
    outDur = trimEndV - trimStartV;
    if (trimStartV > 0 || trimEndV < videoDur) {
      console.log(`▸ 겹침 구간만 추출: 영상 ${trimStartV.toFixed(2)}s ~ ${trimEndV.toFixed(2)}s (${outDur.toFixed(2)}s)` +
        (trimStartV > 0 ? "  — 앞 잘림 → 비디오 재인코딩" : "  — 끝만 잘림 → 비디오 무손실 copy"));
    }
  } else if (coveredEnd < videoDur) {
    console.log(`⚠ 음원이 영상보다 짧음 — 영상 ${coveredEnd.toFixed(2)}s~${videoDur.toFixed(2)}s 구간은 무음 패딩`);
  }

  const output = args.output ?? path.join(
    path.dirname(path.resolve(video)),
    `${path.basename(video, path.extname(video))}-synced.mp4`,
  );
  if (fs.existsSync(output)) die(`output already exists: ${output}\n  --output 으로 다른 경로 지정.`);

  let keepOriginal = args.keepOriginalAudio;
  if (keepOriginal && !vHasAudio) {
    console.log("⚠ 원본 영상에 오디오가 없어 --keep-original-audio 무시");
    keepOriginal = false;
  }

  console.log(`▸ 먹싱 중 (video ${trimStartV > 0 ? "재인코딩" : "무손실 copy"} + audio AAC 192k)...`);
  muxOutput(video, audio, offset, audioInfo.sampleRate, {
    output, keepOriginalAudio: keepOriginal, trimStartV, outDur,
  });
  console.log(`✓ ${output}`);

  if (!args.noVerify && vHasAudio) {
    if (!videoPcm) videoPcm = decodePcm(video);
    // 겹침 추출로 영상 앞이 잘렸으면 원본 PCM 도 같은 지점부터 비교
    const v = verifyOutput(output, trimStartV > 0 ? videoPcm.subarray(Math.floor(trimStartV * RATE)) : videoPcm);
    if (v && Math.abs(v.residual) <= 0.02) {
      console.log(`✓ verify: 잔차 ${(v.residual * 1000).toFixed(0)}ms (score ${v.score.toFixed(3)})`);
    } else if (v) {
      console.log(`⚠ verify: 잔차 ${(v.residual * 1000).toFixed(0)}ms — 임베디드 오디오 품질이 낮으면 측정 자체가 불안정할 수 있음. 청취로 확인.`);
    } else {
      console.log("⚠ verify: 측정 불가 — 청취로 확인.");
    }
  }

  console.log("");
  console.log("Next:");
  console.log(`  node tools/prep-media.mjs ${output} <slug> --kind music --title ... --source ... --lang <en|ko|ja>`);
}

main();
