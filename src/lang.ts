import { FONT } from "./fonts";
import type { Lang, OrigLang } from "./props";

// 원어 자막은 영어 음원일 때만 노출 (한/일 음원은 번역만).
// 원본 CSS: html:not([data-orig-lang="en"]) .cap-original { display:none }
export const showOriginal = (orig: OrigLang): boolean => orig === "en";

const SANS = "sans-serif";

// 출시 채널(hyperframes)은 웹폰트를 로드하지 않아 **맥 시스템 폰트**로 렌더됐다.
// 동일한 룩을 위해 각 스택을 "맥 시스템 폰트 우선 + 원격 웹폰트(off-mac) 폴백" 으로 구성한다.
//   일본어  → Hiragino Sans         (off-mac: Noto Sans JP)
//   라틴/영 → San Francisco(-apple-system)  (off-mac: Inter)
//   한국어  → Apple SD Gothic Neo    (off-mac: Pretendard / Noto Sans KR)
//   태국어  → Thonburi               (off-mac: Noto Sans Thai)
//   대만(tw)→ PingFang TC            (off-mac: Noto Sans TC)  ※ 번체중국어
//   베트남  → San Francisco          (off-mac: Inter + vietnamese subset)
const JP = `"Hiragino Sans", "Yu Gothic", "${FONT.jp}"`;
const LATIN = `-apple-system, BlinkMacSystemFont, "Helvetica Neue", "${FONT.inter}"`;
const KO = `"Apple SD Gothic Neo", "${FONT.pretendard}", "${FONT.kr}"`;
const TH = `"Thonburi", "${FONT.thai}", "Sarabun"`;
const TW = `"PingFang TC", "Heiti TC", "${FONT.tc}"`;
// 베트남어는 라틴 + 성조부호라 전용 서체가 아니라 라틴 스택을 그대로 쓴다 (SF/Inter 둘 다 vietnamese 커버).
const VI = LATIN;

// ── cap-translation (모든 채널 공통 본문 자막) ──
export function captionFont(lang: Lang): string {
  switch (lang) {
    case "ko":
      return [KO, SANS].join(", ");
    case "ja":
      return [JP, SANS].join(", ");
    case "th":
      return [TH, SANS].join(", ");
    case "tw":
      return [TW, SANS].join(", ");
    case "vi":
      return [VI, SANS].join(", ");
    case "en":
      return [LATIN, SANS].join(", ");
  }
}

// ── cap-original 기본 (굿바이브/굿무비) — 언어 native ──
export function originalFont(lang: Lang): string {
  switch (lang) {
    case "ko":
      return [KO, SANS].join(", ");
    case "ja":
      return [JP, SANS].join(", ");
    case "en":
      return [LATIN, SANS].join(", ");
    case "th":
      return [TH, SANS].join(", ");
    case "tw":
      return [TW, SANS].join(", ");
    case "vi":
      return [VI, SANS].join(", ");
  }
}

// ── cap-original (레디액션) — 전 언어 일본어 폰트(Hiragino)로 통일: 합성 italic + thin weight ──
export function originalFontJp(): string {
  return [JP, SANS].join(", ");
}

// ── cap-original (디스힙합) — 라틴 SF 우선, 일본어 글리프는 Hiragino 폴백 ──
export function originalFontLatin(): string {
  return [LATIN, `"Hiragino Sans"`, `"${FONT.jp}"`, SANS].join(", ");
}

// ── 라틴 전용 (디스힙합 하단 #번호 / Artist-Track) ──
export function latinFont(): string {
  return [LATIN, SANS].join(", ");
}

// ── top-caption: 일본어 우선 (굿바이브/레디액션) ──
export function topFontJpLead(lang: Lang): string {
  switch (lang) {
    case "ja":
      return [JP, SANS].join(", ");
    case "ko":
      return [KO, JP, SANS].join(", ");
    case "en":
      return [LATIN, JP, SANS].join(", ");
    case "th":
      return [TH, JP, SANS].join(", ");
    case "tw":
      return [TW, JP, SANS].join(", ");
    case "vi":
      return [VI, JP, SANS].join(", ");
  }
}

// ── top-caption: 언어 native 우선 (굿무비/스페이스랩) ──
export function topFontNative(lang: Lang): string {
  switch (lang) {
    case "ja":
      return [JP, SANS].join(", ");
    case "ko":
      return [KO, JP, SANS].join(", ");
    case "en":
      return [LATIN, JP, SANS].join(", ");
    case "th":
      return [TH, JP, SANS].join(", ");
    // 번체는 일본어 한자 자형(신자체)으로 폴백되면 안 되므로 TC 를 확실히 앞에 둔다.
    case "tw":
      return [TW, JP, SANS].join(", ");
    case "vi":
      return [VI, JP, SANS].join(", ");
  }
}

// ── top-caption: 라틴(SF) 우선 + 일본어 Hiragino 폴백 (디스힙합) ──
export function topFontInterLead(lang: Lang): string {
  switch (lang) {
    case "th":
      return [LATIN, TH, JP, SANS].join(", ");
    case "tw":
      return [LATIN, TW, JP, SANS].join(", ");
    default:
      return [LATIN, JP, SANS].join(", ");
  }
}

// 문자 체계별 최소 line-height.
//   태국어: 성조/모음 부호가 글자 위·아래로 2단씩 쌓임.
//   베트남어: 라틴이지만 성조 + 모음부호가 겹쳐 위쪽으로 한 단 더 올라감.
export const scriptLineHeight = (lang: Lang, base: number): number => {
  if (lang === "th") return Math.max(base, 1.45);
  if (lang === "vi") return Math.max(base, 1.35);
  return base;
};

/** @deprecated scriptLineHeight 를 쓸 것 — 기존 호출부 호환용 별칭. */
export const thaiLineHeight = scriptLineHeight;

// 음수 트래킹은 CJK 조판 관습(글자폭이 고정 1em 이라 좁혀야 자연스러움).
// 태국어·베트남어는 부호가 붙어 있어 좁히면 가독성이 급격히 나빠지므로 0.
export const letterSpacingFor = (lang: Lang, cjkEm = -0.04): string => {
  switch (lang) {
    case "ja":
    case "tw":
      return `${cjkEm}em`;
    case "ko":
      return `${cjkEm / 2}em`;
    default:
      return "0";
  }
};

// "palt" = 일본어 프로포셔널 자간 OpenType 기능. CJK 외 언어엔 무의미하고
// 폰트에 따라 라틴 커닝을 건드릴 수 있으므로 ja/tw 에만 적용.
export const paltFor = (lang: Lang): string =>
  lang === "ja" || lang === "tw" ? '"palt" 1' : "normal";

// CJK 는 단어 중간 개행을 막는 게 관습(keep-all)이지만,
// 태국어는 띄어쓰기가 없어 keep-all 이면 한 줄이 통째로 안 꺾여 그대로 넘친다.
// 베트남어는 공백 단어라 normal 로 두면 브라우저 기본 규칙이 잘 처리한다.
export const wordBreakFor = (lang: Lang): "keep-all" | "normal" =>
  lang === "th" || lang === "vi" || lang === "en" ? "normal" : "keep-all";
