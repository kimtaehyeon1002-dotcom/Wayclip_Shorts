// 언어 어휘 — 단일 소스. src/props.ts 의 zod enum 과 tools/channels.mjs 가 여기서 읽는다.
// (예전엔 두 파일에 손수 미러 — CLAUDE.md 함정 #9. 이제 한 곳.)

/** 원어(음원) 언어 */
export const ORIG_LANGS = /** @type {readonly ["en", "ko", "ja"]} */ (["en", "ko", "ja"]);
/** 번역(시청자) 언어. tw = 대만/번체중국어. 언어코드 = props 파일 접미사 = 출력 폴더 접미사. */
export const TRANS_LANGS = /** @type {readonly ["ko", "ja", "th", "tw", "vi"]} */ (["ko", "ja", "th", "tw", "vi"]);

/** 대화/UI 표시용 이름 */
export const LANG_LABEL = {
  en: { ko: "영어", native: "English" },
  ko: { ko: "한국어", native: "한국어" },
  ja: { ko: "일본어", native: "日本語" },
  tw: { ko: "대만(번체)", native: "繁體中文" },
  th: { ko: "태국어", native: "ไทย" },
  vi: { ko: "베트남어", native: "Tiếng Việt" },
};

/** 채널 베이스 언어 (props.json 이 이 언어). 모든 채널이 일본 타깃이라 ja. */
export const BASE_LANG = /** @type {"ja"} */ ("ja");
