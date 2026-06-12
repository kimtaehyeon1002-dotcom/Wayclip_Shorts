import { FONT } from "./fonts";
import type { Lang, OrigLang } from "./props";

// 원어 자막은 영어 음원일 때만 노출 (한/일 음원은 번역만).
// 원본 CSS: html:not([data-orig-lang="en"]) .cap-original { display:none }
export const showOriginal = (orig: OrigLang): boolean => orig === "en";

const SANS = "sans-serif";
const q = (f: string) => `"${f}"`;

// ── cap-translation (모든 채널 공통 본문 자막) ──
export function captionFont(lang: Lang): string {
  switch (lang) {
    case "ko":
      return [q(FONT.pretendard), q(FONT.kr), SANS].join(", ");
    case "ja":
      return [q(FONT.jp), SANS].join(", ");
    case "th":
      return [q(FONT.thai), SANS].join(", ");
    case "en":
      return [q(FONT.inter), SANS].join(", ");
  }
}

// ── cap-original 기본 (굿바이브/굿무비) ──
export function originalFont(lang: Lang): string {
  switch (lang) {
    case "ko":
      return [q(FONT.pretendard), q(FONT.kr), SANS].join(", ");
    case "ja":
      return [q(FONT.jp), SANS].join(", ");
    case "en":
      return [q(FONT.inter), SANS].join(", ");
    case "th":
      return [q(FONT.thai), SANS].join(", ");
  }
}

// ── cap-original (레디액션/디스힙합) — 합성 italic + thin weight 위해 NSJP 통일 ──
export function originalFontJp(): string {
  return [q(FONT.jp), SANS].join(", ");
}

// ── top-caption: NSJP 우선 (굿바이브/레디액션) ──
export function topFontJpLead(lang: Lang): string {
  switch (lang) {
    case "ja":
      return [q(FONT.jp), SANS].join(", ");
    case "ko":
      return [q(FONT.jp), q(FONT.pretendard), q(FONT.kr), SANS].join(", ");
    case "en":
      return [q(FONT.jp), q(FONT.inter), SANS].join(", ");
    case "th":
      return [q(FONT.jp), q(FONT.thai), SANS].join(", ");
  }
}

// ── top-caption: 언어 native 우선 (굿무비/스페이스랩) ──
export function topFontNative(lang: Lang): string {
  switch (lang) {
    case "ja":
      return [q(FONT.jp), SANS].join(", ");
    case "ko":
      return [q(FONT.pretendard), q(FONT.kr), q(FONT.jp), SANS].join(", ");
    case "en":
      return [q(FONT.inter), q(FONT.jp), SANS].join(", ");
    case "th":
      return [q(FONT.thai), q(FONT.jp), SANS].join(", ");
  }
}

// ── top-caption: Inter(라틴) 우선 + NSJP fallback (디스힙합) ──
export function topFontInterLead(lang: Lang): string {
  switch (lang) {
    case "th":
      return [q(FONT.inter), q(FONT.thai), q(FONT.jp), SANS].join(", ");
    default:
      return [q(FONT.inter), q(FONT.jp), SANS].join(", ");
  }
}

// 태국어는 성조 부호로 line-height 가 더 필요.
export const thaiLineHeight = (lang: Lang, base: number): number =>
  lang === "th" ? Math.max(base, 1.45) : base;
