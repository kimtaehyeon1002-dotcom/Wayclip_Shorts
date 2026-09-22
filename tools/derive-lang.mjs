#!/usr/bin/env node
/**
 * derive-lang.mjs — 일본어 베이스 props.json 에서 언어 변형 props.<lang>.json 을 파생/재동기화.
 *
 *   node tools/derive-lang.mjs videos/goodmovies/086 --langs tw,th,vi        # 생성
 *   node tools/derive-lang.mjs videos/goodmovies/086 --langs tw,th,vi --sync # 구조만 재동기화
 *   node tools/derive-lang.mjs videos/space_lab/047                          # 기본 tw,th,vi
 *
 * 이 도구는 **번역하지 않는다.** 생성 모드는 일본어 텍스트를 그대로 복사해 두고,
 * Claude 가 이어서 그 자리에 현지화 의역을 써넣는다 (직역 금지 — CLAUDE.md 전역 규칙).
 *
 * --sync 는 이미 번역된 변형 파일의 **구조 필드만** props.json 기준으로 덮어쓴다.
 * (일본어를 나중에 고쳤을 때 4개 언어가 어긋나는 걸 막는 용도. 번역문은 절대 안 건드림.)
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  MULTILANG_SET,
  TRANS_LANGS,
  channelFixedStrings,
  propsFileName,
} from "./channels.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");

// props.json 에서 변형으로 항상 그대로 따라가야 하는 필드 (레이아웃·타이밍·미디어).
// 여기 없는 필드 = 번역 대상 텍스트 → 변형에서 자유롭게 바뀐다.
const STRUCTURAL_KEYS = [
  "durationInFrames",
  "videoSrc",
  "layout",
  "videoNumber",
  "captionPaddingTop",
  "topCaptionMaxLines",
  "originalLanguage",
  "mediaKind",
  // 2026-07-29 개편분 — 레이아웃 파라미터라 언어와 무관하게 베이스를 따라간다.
  "captionYOffset",
  "watermark",
  "warnBlink",
  "warnOpacity",
  "videoFit",
  "videoAspectRatio",
  "videoObjectPosition",
  "bandHeight",
  "endFadeSeconds",
  "comments",
];

function die(msg) {
  console.error(`✗ ${msg}`);
  process.exit(1);
}

function writeJson(p, obj) {
  fs.writeFileSync(p, JSON.stringify(obj, null, 2) + "\n");
}

function parseArgs() {
  const argv = process.argv.slice(2);
  let dir = null;
  let langs = null;
  let sync = false;
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--langs") langs = String(argv[++i] || "").split(",").map((s) => s.trim()).filter(Boolean);
    else if (a === "--sync") sync = true;
    else if (a.startsWith("--")) die(`Unknown flag: ${a}`);
    else if (!dir) dir = a;
    else die(`Unexpected arg: ${a}`);
  }
  if (!dir) die("Usage: node tools/derive-lang.mjs videos/<channel>/<number> [--langs tw,th,vi] [--sync]");
  // 기본값: 베이스(ja)를 뺀 양산 언어 세트
  if (!langs) langs = MULTILANG_SET.filter((l) => l !== "ja");
  for (const l of langs) {
    if (!TRANS_LANGS.includes(l)) die(`알 수 없는 언어: ${l} (가능: ${TRANS_LANGS.join(", ")})`);
  }
  return { dir, langs, sync };
}

function main() {
  const { dir, langs, sync } = parseArgs();
  const absDir = path.resolve(ROOT, dir);
  const basePath = path.join(absDir, "props.json");
  const metaPath = path.join(absDir, "meta.json");
  if (!fs.existsSync(basePath)) die(`props.json 없음: ${basePath}`);

  const base = JSON.parse(fs.readFileSync(basePath, "utf8"));
  const baseLang = base.translationLanguage || "ja";
  const channel = fs.existsSync(metaPath)
    ? JSON.parse(fs.readFileSync(metaPath, "utf8")).channel
    : null;
  const fixed = (channel && channelFixedStrings[channel]) || {};

  for (const lang of langs) {
    if (lang === baseLang) {
      console.log(`· ${lang}: 베이스 언어 — props.json 그대로 (스킵)`);
      continue;
    }
    const file = propsFileName(lang, baseLang);
    const outPath = path.join(absDir, file);
    const exists = fs.existsSync(outPath);

    if (exists && !sync) {
      console.log(`· ${file}: 이미 있음 — 건너뜀 (구조 갱신은 --sync)`);
      continue;
    }

    if (!exists) {
      // 생성: 일본어 전체를 복사하고 언어만 교체. 텍스트는 Claude 가 이 파일 위에서 번역한다.
      const variant = { ...base, translationLanguage: lang };
      // 채널 고정 문구(시리즈 카피/CTA/경고문구)는 이미 번역본이 있으니 자동으로 채운다.
      const auto = fixed[lang] || {};
      const filled = [];
      for (const [k, v] of Object.entries(auto)) {
        if (k in variant) {
          variant[k] = v;
          filled.push(k);
        }
      }
      writeJson(outPath, variant);
      const todo = filled.length ? ` (${filled.join("/")} 자동 채움 — 나머지 텍스트는 번역 필요)` : " (텍스트는 아직 " + baseLang + " — 번역 필요)";
      console.log(`✓ ${file} 생성${todo}`);
      continue;
    }

    // --sync: 구조 필드만 덮어쓰고 번역문은 보존
    const variant = JSON.parse(fs.readFileSync(outPath, "utf8"));
    const changed = [];
    for (const k of STRUCTURAL_KEYS) {
      if (!(k in base)) continue;
      if (JSON.stringify(variant[k]) !== JSON.stringify(base[k])) changed.push(k);
      variant[k] = base[k];
    }
    variant.translationLanguage = lang;

    // captions 는 타임스탬프만 동기화 — translation/original 텍스트는 변형 것을 유지.
    if (Array.isArray(base.captions)) {
      const vc = Array.isArray(variant.captions) ? variant.captions : [];
      if (vc.length !== base.captions.length) {
        die(
          `${file}: caption 개수 불일치 (베이스 ${base.captions.length} vs 변형 ${vc.length}). ` +
            `cue 1:1 대응은 전 언어 공통 불변식 — 수동으로 맞춘 뒤 다시 실행할 것.`
        );
      }
      let timingChanged = 0;
      variant.captions = base.captions.map((b, i) => {
        if (vc[i].start !== b.start || vc[i].end !== b.end) timingChanged++;
        return { ...vc[i], start: b.start, end: b.end };
      });
      if (timingChanged) changed.push(`captions timing ×${timingChanged}`);
    }

    writeJson(outPath, variant);
    console.log(
      changed.length
        ? `✓ ${file} 동기화 — 갱신: ${changed.join(", ")}`
        : `· ${file} 동기화 — 변경 없음`
    );
  }

  // meta.json 에 언어 세트 기록
  if (fs.existsSync(metaPath)) {
    const meta = JSON.parse(fs.readFileSync(metaPath, "utf8"));
    const all = [baseLang, ...langs.filter((l) => l !== baseLang)];
    meta.languages = { ...(meta.languages || {}), translations: all };
    writeJson(metaPath, meta);
    console.log(`✓ meta.json languages.translations = [${all.join(", ")}]`);
  }

  console.log(`\n다음: 각 props.<lang>.json 의 텍스트를 현지화 번역 → check-captions --lang <code> → render.mjs`);
}

main();
