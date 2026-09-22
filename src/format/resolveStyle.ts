// StyleValue DSL → React.CSSProperties. `$fn` 은 src/lang.ts 의 헬퍼를 **같은 인자로** 호출한다
// (재구현 없음 → 예전 채널 컴포넌트와 같은 CSS 값 = 같은 픽셀).
import type React from "react";
import * as L from "../lang";
import type { Lang, OrigLang, TransLang } from "../props";
import type { StyleValue, TextStyle } from "./types";

export interface StyleCtx {
  translationLanguage: TransLang;
  originalLanguage: OrigLang;
}

type Fn = (lang: Lang, arg?: number) => string | number;
const FNS: Record<string, Fn> = {
  captionFont: (l) => L.captionFont(l),
  originalFont: (l) => L.originalFont(l),
  originalFontJp: () => L.originalFontJp(),
  originalFontLatin: () => L.originalFontLatin(),
  latinFont: () => L.latinFont(),
  topFontJpLead: (l) => L.topFontJpLead(l),
  topFontNative: (l) => L.topFontNative(l),
  topFontInterLead: (l) => L.topFontInterLead(l),
  letterSpacingFor: (l, a) => (a === undefined ? L.letterSpacingFor(l) : L.letterSpacingFor(l, a)),
  scriptLineHeight: (l, a) => L.scriptLineHeight(l, a ?? 1.2),
  paltFor: (l) => L.paltFor(l),
  wordBreakFor: (l) => L.wordBreakFor(l),
};

function langFor(sel: string | undefined, ctx: StyleCtx): Lang {
  if (!sel || sel === "translation") return ctx.translationLanguage;
  if (sel === "original") return ctx.originalLanguage;
  return sel as Lang;
}

export function resolveValue(v: StyleValue, ctx: StyleCtx): string | number | undefined {
  if (typeof v === "string" || typeof v === "number") return v;
  if ("$fn" in v) {
    const fn = FNS[v.$fn];
    if (!fn) throw new Error(`알 수 없는 스타일 함수: ${v.$fn}`);
    return fn(langFor(v.lang, ctx), v.arg);
  }
  const hit = v.$lang[ctx.translationLanguage];
  return hit !== undefined ? hit : v.default;
}

/**
 * @param scale fontSize 에 곱할 배율(captionScale). 숫자 fontSize 에만 적용 (예전 `36 * captionScale`).
 */
export function resolveStyle(spec: TextStyle | undefined, ctx: StyleCtx, scale?: number): React.CSSProperties {
  const out: Record<string, string | number> = {};
  if (!spec) return out;
  for (const [k, v] of Object.entries(spec)) {
    const r = resolveValue(v, ctx);
    if (r === undefined) continue; // $lang 미매치 + default 없음 → 키 자체를 안 건다
    out[k] = k === "fontSize" && scale !== undefined && typeof r === "number" ? r * scale : r;
  }
  return out as React.CSSProperties;
}
