#!/usr/bin/env node
/**
 * transcribe.mjs — STT (whisper.cpp). HyperFrames 의 `npx hyperframes transcribe` 대체.
 *
 *   node tools/transcribe.mjs videos/<ch>/<n>/source.mp4 --language en [--model base] [--out <path>]
 *
 * 출력: <input 디렉토리>/transcript.json — align-script 가 먹는 평탄 배열 [{text, start, end}].
 *
 * ⚠️ 반드시 --language <원어> 를 줄 것. `.en` 모델은 비영어를 영어로 번역해버리므로 금지
 *    (이 스크립트는 항상 다국어 모델만 쓴다).
 * 첫 실행 시 whisper.cpp 빌드 + 모델 다운로드 (이후 캐시). 모델은 medium 이상이 정확.
 */
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { fileURLToPath } from "node:url";
import { execFileSync } from "node:child_process";
import {
  installWhisperCpp,
  downloadWhisperModel,
  transcribe,
} from "@remotion/install-whisper-cpp";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const WHISPER_DIR = path.join(ROOT, "whisper.cpp");
const WHISPER_VERSION = process.env.WHISPER_VERSION || "1.7.4";

const ORIG_LANGS = ["en", "ko", "ja"];
const MULTILINGUAL_MODELS = ["tiny", "base", "small", "medium", "large-v3", "large-v3-turbo"];

function die(msg) {
  console.error(`✗ ${msg}`);
  process.exit(1);
}

function parseArgs(argv) {
  const opts = { input: null, language: null, model: "base", out: null };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--language") opts.language = argv[++i];
    else if (a === "--model") opts.model = argv[++i];
    else if (a === "--out") opts.out = argv[++i];
    else if (a.startsWith("--")) die(`Unknown flag: ${a}`);
    else if (!opts.input) opts.input = a;
    else die(`Unexpected positional arg: ${a}`);
  }
  if (!opts.input) die("Usage: node tools/transcribe.mjs <input.mp4> --language en|ko|ja [--model base] [--out <path>]");
  if (!fs.existsSync(opts.input)) die(`input not found: ${opts.input}`);
  if (!opts.language) die("--language 필수 (en|ko|ja). 비영어인데 생략하면 영어로 번역돼버림.");
  if (!ORIG_LANGS.includes(opts.language)) die(`--language must be one of: ${ORIG_LANGS.join(", ")}`);
  if (opts.model.endsWith(".en")) die(`.en 모델 금지 (비영어를 영어로 번역). 다국어 모델 사용: ${MULTILINGUAL_MODELS.join(", ")}`);
  return opts;
}

// whisper.cpp 는 16kHz mono PCM wav 입력 필요.
function toWav16k(input) {
  const tmp = path.join(os.tmpdir(), `rshorts-stt-${process.pid}.wav`);
  execFileSync("ffmpeg", [
    "-y", "-i", input, "-ar", "16000", "-ac", "1", "-c:a", "pcm_s16le", tmp,
  ], { stdio: ["ignore", "ignore", "inherit"] });
  return tmp;
}

// transcription item(들)을 평탄한 [{text,start,end}] 로. tokenLevelTimestamps 가 있으면 토큰 단위.
function flatten(transcription) {
  const out = [];
  const isSpecial = (t) => /^\s*\[.*\]\s*$/.test(t) || t.trim() === "";
  for (const item of transcription) {
    if (Array.isArray(item.tokens) && item.tokens.length) {
      for (const tok of item.tokens) {
        if (isSpecial(tok.text)) continue;
        out.push({
          text: tok.text.trim(),
          start: tok.offsets.from / 1000,
          end: tok.offsets.to / 1000,
        });
      }
    } else {
      if (isSpecial(item.text)) continue;
      out.push({
        text: item.text.trim(),
        start: item.offsets.from / 1000,
        end: item.offsets.to / 1000,
      });
    }
  }
  return out;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const outPath = args.out ?? path.join(path.dirname(path.resolve(args.input)), "transcript.json");

  console.log(`▸ whisper.cpp 준비 (${WHISPER_DIR}, v${WHISPER_VERSION})…`);
  await installWhisperCpp({ to: WHISPER_DIR, version: WHISPER_VERSION, printOutput: false });
  console.log(`▸ 모델 다운로드/확인: ${args.model}…`);
  await downloadWhisperModel({ model: args.model, folder: WHISPER_DIR, printOutput: false });

  console.log(`▸ 16kHz wav 변환…`);
  const wav = toWav16k(args.input);

  try {
    console.log(`▸ transcribe (language=${args.language})…`);
    const result = await transcribe({
      inputPath: wav,
      whisperPath: WHISPER_DIR,
      whisperCppVersion: WHISPER_VERSION,
      model: args.model,
      language: args.language,
      tokenLevelTimestamps: true,
    });
    const flat = flatten(result.transcription);
    fs.writeFileSync(outPath, JSON.stringify(flat, null, 2) + "\n");
    console.log(`✓ wrote ${path.relative(process.cwd(), outPath)} — ${flat.length} tokens`);
  } finally {
    fs.rmSync(wav, { force: true });
  }
}

main().catch((e) => die(e?.message || String(e)));
