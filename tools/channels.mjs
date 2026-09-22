// 채널 정의 — **얇은 로더**. 진실은 formats/<slug>.json (packages/shared/format-schema.mjs 스키마).
// 예전 export 이름은 전부 유지한다 — new-video / validate-props / check-captions / render / preview /
// derive-lang 등 기존 도구가 그대로 import 한다. 새 포맷은 JSON 하나 추가하면 여기 자동 반영.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { loadFormats } from "@wayclip/shared/formats-node.mjs";
import { compositionIdOf, deriveCaptionLayout } from "@wayclip/shared/format-schema.mjs";
import { STRUCTURAL_KEYS } from "@wayclip/shared/props-fields.mjs";
import { CANVAS_W, CANVAS_H, FPS, computeSpaceLabLayout, computeContainAutoLayout } from "@wayclip/shared/layout.mjs";
import { BASE_LANG } from "@wayclip/shared/langs.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

/** slug → 포맷 (order 순). */
export const FORMATS = loadFormats(path.join(ROOT, "formats"));
const mapF = (fn) => Object.fromEntries(Object.values(FORMATS).map((f) => [f.slug, fn(f)]));

export const CHANNELS = Object.keys(FORMATS);
export { ORIG_LANGS, TRANS_LANGS } from "@wayclip/shared/langs.mjs";
export { propsFileName, outputChannelDir } from "@wayclip/shared/output-paths.mjs";
export { STRUCTURAL_KEYS, CANVAS_W, CANVAS_H, FPS, computeSpaceLabLayout, computeContainAutoLayout };

/** 채널의 타깃 언어 목록 (베이스 포함). */
export const targetsOf = (slug) => FORMATS[slug].languages.targets;
export const MULTILANG_CHANNELS = CHANNELS.filter((s) => targetsOf(s).length > 1);
/** 다국어 채널 공통 세트 (호환용 — 새 코드는 targetsOf 를 쓸 것). */
export const MULTILANG_SET = [...new Set(MULTILANG_CHANNELS.flatMap(targetsOf))];

export const channelFixedStrings = mapF((f) => f.fixedStrings);
export const GOODVIBE_WATERMARK = FORMATS.goodvibesongs?.features.watermark?.default;
export const channelDefaults = mapF((f) => structuredClone(f.scaffold));
export const compositionId = mapF((f) => compositionIdOf(f.slug));
export const hasCaptions = mapF((f) => f.features.captions);
export const hasVideoNumber = Object.fromEntries(Object.values(FORMATS).filter((f) => f.features.videoNumber !== "none").map((f) => [f.slug, true]));
export const numberFrom1000 = Object.fromEntries(Object.values(FORMATS).filter((f) => f.features.videoNumber === "1000-n").map((f) => [f.slug, true]));
export const captionLayouts = mapF(deriveCaptionLayout);
export const previewPorts = mapF((f) => f.previewPort);
export const displayNames = mapF((f) => f.displayName.ko);
/** 밴드를 영상 비율로 자동 계산하는 채널 (space_lab 식). */
export const isContainAuto = (slug) => FORMATS[slug].layout.mode === "contain-auto";
/** 그 채널의 #번호 문자열. */
export function videoNumberFor(slug, number) {
  const mode = FORMATS[slug].features.videoNumber;
  if (mode === "none") return null;
  return mode === "1000-n" ? `#${1000 - parseInt(number, 10)}` : `#${number}`;
}
/** 채널×언어 IG 시크릿 이름 (formats/<slug>.json publisher.accounts). */
export function igSecretFor(slug, lang = BASE_LANG) {
  return FORMATS[slug].publisher.accounts[lang]?.secret ?? `IG_${slug.toUpperCase()}_${lang.toUpperCase()}`;
}

/**
 * `--lang X` → 실제 읽을 props 경로.
 * props.X.json 이 있으면 그것, 없고 props.json 의 translationLanguage 가 X 면 props.json.
 * 둘 다 아니면 null (호출부가 에러 처리).
 */
export function resolvePropsPath(fs, path, dirAbs, lang) {
  const base = path.join(dirAbs, "props.json");
  if (!lang) return fs.existsSync(base) ? base : null;
  const variant = path.join(dirAbs, `props.${lang}.json`);
  if (fs.existsSync(variant)) return variant;
  if (!fs.existsSync(base)) return null;
  try {
    const p = JSON.parse(fs.readFileSync(base, "utf8"));
    if (p.translationLanguage === lang) return base;
  } catch {
    /* 파싱 실패는 호출부의 기존 에러 경로가 잡는다 */
  }
  return null;
}
