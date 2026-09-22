// 결재본 출력 경로 규칙 — 로컬 output/ 과 R2 키가 **같은 문자열**을 쓴다.
//   output/<channel>[-<lang>]/<number>/<number>.mp4
//   output/<channel>[-<lang>]/<number>/<number>캡션.txt
// 폴더가 언어를 나타내므로 파일명엔 접미사가 없고, 번호는 전 국가 공통.
import { BASE_LANG } from "./langs.mjs";

/** 변형 props 파일명. 베이스 언어면 props.json. */
export function propsFileName(lang, baseLang = BASE_LANG) {
  return !lang || lang === baseLang ? "props.json" : `props.${lang}.json`;
}

/** 출력 최상위 폴더명: 베이스 언어면 채널 slug 그대로, 아니면 `<slug>-<lang>`. */
export function outputChannelDir(channel, lang, baseLang = BASE_LANG) {
  return !lang || lang === baseLang ? channel : `${channel}-${lang}`;
}

/** `goodmovies-tw` → { channel: "goodmovies", lang: "tw" } / `goodmovies` → lang = baseLang */
export function parseOutputChannelDir(dirName, baseLang = BASE_LANG) {
  const m = /^(.+?)-([a-z]{2})$/.exec(dirName);
  if (m) return { channel: m[1], lang: m[2] };
  return { channel: dirName, lang: baseLang };
}

export const CAPTION_TXT_SUFFIX = "캡션.txt";

/** 결재본 mp4 상대경로(= R2 키). */
export function outputVideoKey(channel, number, lang, baseLang = BASE_LANG) {
  const n = String(number);
  return `output/${outputChannelDir(channel, lang, baseLang)}/${n}/${n}.mp4`;
}

/** 캡션 txt 상대경로(= R2 키). */
export function outputCaptionKey(channel, number, lang, baseLang = BASE_LANG) {
  const n = String(number);
  return `output/${outputChannelDir(channel, lang, baseLang)}/${n}/${n}${CAPTION_TXT_SUFFIX}`;
}
