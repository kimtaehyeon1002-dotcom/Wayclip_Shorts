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
const JP = `"Hiragino Sans", "Yu Gothic", "${FONT.jp}"`;
const LATIN = `-apple-system, BlinkMacSystemFont, "Helvetica Neue", "${FONT.inter}"`;
const KO = `"Apple SD Gothic Neo", "${FONT.pretendard}", "${FONT.kr}"`;
const TH = `"Thonburi", "${FONT.thai}", "Sarabun"`;

// ── cap-translation (모든 채널 공통 본문 자막) ──
export function captionFont(lang: Lang): string {
  switch (lang) {
    case "ko":
      return [KO, SANS].join(", ");
    case "ja":
      return [JP, SANS].join(", ");
    case "th":
      return [TH, SANS].join(", ");
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
  }
}

// ── top-caption: 라틴(SF) 우선 + 일본어 Hiragino 폴백 (디스힙합) ──
export function topFontInterLead(lang: Lang): string {
  switch (lang) {
    case "th":
      return [LATIN, TH, JP, SANS].join(", ");
    default:
      return [LATIN, JP, SANS].join(", ");
  }
}

// 태국어는 성조 부호로 line-height 가 더 필요.
export const thaiLineHeight = (lang: Lang, base: number): number =>
  lang === "th" ? Math.max(base, 1.45) : base;
