#!/usr/bin/env node
/**
 * render.mjs — 결재본 렌더. 다국어 채널은 한 번에 4개 언어(ja/tw/th/vi)를 낸다.
 *
 *   node tools/render.mjs goodmovies 086                 # 채널 기본 언어 세트 전부
 *   node tools/render.mjs space_lab 047 --langs ja,tw    # 일부만
 *   node tools/render.mjs goodmovies 086 --only-missing  # 이미 있는 결재본은 스킵
 *   node tools/render.mjs readyaction 954                # 단일 언어 채널 → 기존과 동일하게 1개
 *
 * 출력: **언어별 최상위 폴더 분리**, 영상번호는 전 국가 공통(관리 편의).
 *   output/readyaction/952/952.mp4      (일본어 = 베이스, 기존 그대로)
 *   output/readyaction-tw/952/952.mp4   (대만)
 *   output/readyaction-th/952/952.mp4   (태국)
 *   output/readyaction-vi/952/952.mp4   (베트남)
 * 캡션 txt 도 같은 폴더 안에 `<n>캡션.txt` — 파일명엔 언어 접미사를 붙이지 않는다.
 *
 * ⚠️ normalize 단계 없음 — Remotion 출력은 이미 start_time 0 (CLAUDE.md 참조).
 * ⚠️ 렌더는 프리뷰 승인 후에만. 이 도구는 승인 여부를 알 수 없으니 호출 시점을 지킬 것.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import {
  CHANNELS,
  targetsOf,
  TRANS_LANGS,
  compositionId,
  outputChannelDir,
  propsFileName,
  resolvePropsPath,
} from "./channels.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");

function die(msg) {
  console.error(`✗ ${msg}`);
  process.exit(1);
}

function parseArgs() {
  const argv = process.argv.slice(2);
  let channel = null;
  let number = null;
  let langs = null;
  let onlyMissing = false;
  let skipCheck = false;
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--langs") langs = String(argv[++i] || "").split(",").map((s) => s.trim()).filter(Boolean);
    else if (a === "--only-missing") onlyMissing = true;
    else if (a === "--skip-check") skipCheck = true;
    else if (a.startsWith("--")) die(`Unknown flag: ${a}`);
    else if (!channel) channel = a;
    else if (!number) number = a;
    else die(`Unexpected arg: ${a}`);
  }
  if (!channel || !number) {
    die("Usage: node tools/render.mjs <channel> <number> [--langs ja,tw,th,vi] [--only-missing]");
  }
  if (!CHANNELS.includes(channel)) die(`Unknown channel: ${channel}`);
  if (langs) {
    for (const l of langs) if (!TRANS_LANGS.includes(l)) die(`알 수 없는 언어: ${l}`);
  }
  return { channel, number, langs, onlyMissing, skipCheck };
}

function main() {
  const { channel, number, langs: langsArg, onlyMissing, skipCheck } = parseArgs();

  const dirRel = path.join("videos", channel, number);
  const dirAbs = path.join(ROOT, dirRel);
  const metaPath = path.join(dirAbs, "meta.json");
  if (!fs.existsSync(path.join(dirAbs, "props.json"))) die(`${dirRel}/props.json 없음 — new-video 먼저 실행`);
  if (!fs.existsSync(metaPath)) die(`${dirRel}/meta.json 없음`);

  const base = JSON.parse(fs.readFileSync(path.join(dirAbs, "props.json"), "utf8"));
  const baseLang = base.translationLanguage || "ja";

  // 언어 결정: --langs > meta.languages.translations > 다국어 채널 기본 세트 > 베이스 1개
  let langs = langsArg;
  if (!langs) {
    const meta = JSON.parse(fs.readFileSync(metaPath, "utf8"));
    const fromMeta = meta.languages && Array.isArray(meta.languages.translations)
      ? meta.languages.translations
      : null;
    langs = fromMeta || (targetsOf(channel).length > 1 ? targetsOf(channel) : [baseLang]);
  }
  // 실제로 props 가 있는 언어만 — 아직 파생 안 한 언어를 조용히 베이스로 렌더하면 안 됨.
  const plan = [];
  for (const lang of langs) {
    const propsAbs = resolvePropsPath(fs, path, dirAbs, lang);
    if (!propsAbs) {
      console.log(`⚠ ${lang}: ${propsFileName(lang, baseLang)} 없음 — 건너뜀 (derive-lang.mjs 로 파생 필요)`);
      continue;
    }
    plan.push({ lang, propsRel: path.join(dirRel, path.basename(propsAbs)) });
  }
  if (!plan.length) die("렌더할 언어가 없습니다.");

  const compId = compositionId[channel];
  // formats/*.json → src/formats.generated.ts 최신화
  spawnSync(process.execPath, [path.join("tools", "gen-formats.mjs")], { cwd: ROOT, stdio: "inherit" });

  const done = [];
  const skipped = [];
  const failed = [];

  for (const { lang, propsRel } of plan) {
    // 언어별 최상위 폴더 분리: output/<channel>[-<lang>]/<number>/<number>.mp4
    const outDirRel = path.join("output", outputChannelDir(channel, lang, baseLang), number);
    const outRel = path.join(outDirRel, `${number}.mp4`);
    fs.mkdirSync(path.join(ROOT, outDirRel), { recursive: true });

    if (onlyMissing && fs.existsSync(path.join(ROOT, outRel))) {
      console.log(`· ${lang}: ${outRel} 이미 있음 — 스킵`);
      skipped.push(lang);
      continue;
    }

    // 렌더 전 오버플로 사전 검사 — 넘치면 그 언어는 렌더하지 않는다 (긴 렌더를 버리지 않기 위해).
    if (!skipCheck) {
      const check = spawnSync(
        process.execPath,
        [path.join("tools", "check-captions.mjs"), dirRel, ...(lang === baseLang ? [] : ["--lang", lang])],
        { cwd: ROOT, encoding: "utf8" }
      );
      if (check.status !== 0) {
        console.error(`\n✗ ${lang}: check-captions 실패 — 렌더 중단`);
        console.error(check.stdout || "");
        failed.push(`${lang} (오버플로)`);
        continue;
      }
    }

    console.log(`\n▸ 렌더 [${channel}/${number} / ${lang}] → ${outRel}`);
    const r = spawnSync(
      "npx",
      [
        "remotion", "render", "src/index.ts", compId, outRel,
        `--props=${propsRel}`,
        `--public-dir=${dirRel}`,
      ],
      { cwd: ROOT, stdio: "inherit" }
    );
    if (r.status !== 0) {
      failed.push(`${lang} (remotion exit ${r.status})`);
      continue;
    }
    done.push({ lang, outRel });
  }

  console.log("\n─────────────────────────────");
  for (const d of done) console.log(`✓ ${d.lang}  ${d.outRel}`);
  if (skipped.length) console.log(`· 스킵: ${skipped.join(", ")}`);
  if (failed.length) {
    console.log(`✗ 실패: ${failed.join(", ")}`);
  }
  console.log(`\n다음: 각 언어 폴더 안에 캡션 txt 작성 —`);
  for (const p of plan) {
    console.log(
      `  output/${outputChannelDir(channel, p.lang, baseLang)}/${number}/${number}캡션.txt`
    );
  }
  console.log("  (포맷·채널 규칙: /caption 스킬)");

  // 게시(GitHub Actions)는 R2 의 결재본을 읽는다 → 캡션 txt 가 이미 있는 언어는 지금 올리고,
  // 없는 언어는 안내만 (upload-output 이 캡션 없는 폴더는 올리지 않는다).
  if (done.length) {
    const langsDone = done.map((d) => d.lang).join(",");
    console.log(`\n▸ R2 업로드 (캡션 txt 있는 언어만): node tools/upload-output.mjs ${channel} ${number} --langs ${langsDone}`);
    const up = spawnSync(process.execPath, [path.join("tools", "upload-output.mjs"), channel, number, "--langs", langsDone], { cwd: ROOT, stdio: "inherit" });
    if (up.status !== 0) console.log("  (업로드 실패/보류 — 캡션 txt 작성 후 직접: node tools/upload-output.mjs " + channel + " " + number + ")");
    console.log("  ⚠ 캡션 txt 를 나중에 쓴 언어는 반드시 다시: node tools/upload-output.mjs " + channel + " " + number);
  }
  process.exit(failed.length ? 1 : 0);
}

main();
