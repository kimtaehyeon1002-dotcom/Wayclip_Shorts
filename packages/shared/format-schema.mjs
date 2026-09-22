// formats/<slug>.json 스키마 — 채널(포맷)의 **진실의 원천**.
// src/Root.tsx(컴포지션) · tools/channels.mjs(도구) · publisher · web 이 전부 이 파일을 읽는다.
//
// 스타일 값(StyleValue): 리터럴 | 언어 분기 | src/lang.ts 헬퍼 호출
//   "55pt"                                        → 그대로
//   { "$lang": { "th": 1.45 }, "default": 1.2 }  → translationLanguage 로 분기 (default 없고 안 맞으면 키 생략)
//   { "$fn": "scriptLineHeight", "arg": 1.18 }    → scriptLineHeight(lang, 1.18). lang 은 "translation"(기본)|"original"|"ja"…
// 리졸버(src/format/resolveStyle.ts)는 기존 lang.ts 함수를 **같은 인자로 호출**하므로 기존 채널과 픽셀이 같다.
import { z } from "zod";
import { ORIG_LANGS, TRANS_LANGS } from "./langs.mjs";

export const STYLE_FNS = [
  "captionFont", "originalFont", "originalFontJp", "originalFontLatin", "latinFont",
  "topFontJpLead", "topFontNative", "topFontInterLead",
  "letterSpacingFor", "scriptLineHeight", "paltFor", "wordBreakFor",
];
const langKey = z.enum([...new Set([...ORIG_LANGS, ...TRANS_LANGS])]);
const literal = z.union([z.string(), z.number()]);
export const styleValueSchema = z.union([
  literal,
  z.object({ $lang: z.partialRecord(langKey, literal), default: literal.optional() }).strict(),
  z.object({
    $fn: z.enum(STYLE_FNS),
    arg: z.number().optional(),
    lang: z.union([z.enum(["translation", "original"]), langKey]).optional(),
  }).strict(),
]);
/** CSS 속성 → StyleValue (camelCase React style 키) */
export const textStyleSchema = z.record(z.string(), styleValueSchema);

const bandSchema = z.object({
  padding: z.string(),
  gap: z.number(),
  justify: z.enum(["flex-start", "flex-end", "center"]).default("flex-end"),
  lineHeight: z.number().optional(),
});

export const bottomRowSchema = z.object({
  kind: z.enum(["number", "credit", "artistTrack", "cta"]),
  style: textStyleSchema,
});

export const formatSchema = z.object({
  $schema: z.string().optional(),
  slug: z.string().regex(/^[a-z][a-z0-9_]*$/),
  /** 목록 정렬 (Studio 컴포지션 순서, CHANNELS 배열 순서). */
  order: z.number().int().default(999),
  displayName: z.object({ ko: z.string(), ja: z.string().optional(), en: z.string().optional() }),
  description: z.string().optional(),
  previewPort: z.number().int().min(1024).max(65535),
  handle: z.string().regex(/^@/),

  languages: z.object({
    base: z.enum(TRANS_LANGS).default("ja"),
    targets: z.array(z.enum(TRANS_LANGS)).min(1),
    originalDefault: z.enum(ORIG_LANGS).default("en"),
    originalAllowed: z.array(z.enum(ORIG_LANGS)).default([...ORIG_LANGS]),
  }),

  layout: z.object({
    mode: z.enum(["symmetric", "contain-auto"]),
    background: z.string(),
    // symmetric: 상·하단 밴드 높이. 영상 = 1920 − 2·band.
    band: z.number().int().optional(),
    propsBandOverride: z.boolean().default(false), // props.bandHeight 허용 (thishiphop)
    letterboxAware: z.boolean().default(false),   // contain + videoAspectRatio 일 때 레터박스만큼 밴드 확장 (thishiphop)
    containAuto: z.object({ warnH: z.number(), videoBottomGap: z.number(), maxVideoH: z.number() }).optional(),
    rootStyle: textStyleSchema.default({}),
    video: z.object({
      fit: z.enum(["cover", "contain"]).default("cover"),
      overscan: z.number().default(1),
      vignette: z.boolean().default(true),
      propsFitOverride: z.boolean().default(false),      // props.videoFit
      propsObjectPosition: z.boolean().default(false),   // props.videoObjectPosition
    }),
    topBand: bandSchema,
    captionZone: z.object({
      left: z.number(), right: z.number(), gap: z.number(),
      // 있으면 항상 translateY(props.captionYOffset ?? default) 를 건다 (없으면 transform 자체를 안 건다 — 픽셀 동일성).
      yOffset: z.object({ default: z.number() }).optional(),
    }).nullable().default(null),
    bottomBand: bandSchema.extend({ rows: z.array(bottomRowSchema).default([]) }),
  }),

  typography: z.object({
    top: z.object({
      markup: z.enum(["none", "bold", "redbold"]).default("bold"),
      maxLines: z.number().int().positive().default(2),
      strong: textStyleSchema.default({}),
      red: textStyleSchema.default({}),
      style: textStyleSchema,
    }),
    original: z.object({
      hideWhenEmpty: z.boolean().default(false),
      scaleWith: z.enum(["captionScale"]).optional(),
      style: textStyleSchema,
    }).optional(),
    translation: z.object({
      scaleWith: z.enum(["captionScale"]).optional(),
      style: textStyleSchema,
    }).optional(),
  }),

  features: z.object({
    captions: z.boolean(),
    videoNumber: z.enum(["none", "n", "1000-n"]).default("none"),
    comments: z.object({
      gap: z.number(), scale: z.number(), maxWidth: z.number(), bottomMargin: z.number(),
      stackDefaults: z.record(z.string(), z.number()),
    }).optional(),
    watermark: z.object({
      default: z.object({ text: z.string(), y: z.number(), size: z.number(), opacity: z.number(), weight: z.number() }),
      style: textStyleSchema,
    }).optional(),
    warnPill: z.boolean().default(false),
    endFade: z.boolean().default(false),
  }),

  /** Remotion defaultProps (= 예전 zod schema.parse({})) — props.json 에 없는 키의 값. */
  defaultProps: z.record(z.string(), z.any()),
  /** new-video 가 props.json 에 쓰는 시드 (= 예전 channelDefaults). */
  scaffold: z.record(z.string(), z.any()),
  /** 채널 고정 문구의 언어별 번역 (derive-lang 이 자동 채움). */
  fixedStrings: z.partialRecord(z.enum(TRANS_LANGS), z.record(z.string(), z.string())).default({}),

  captionGuide: z.object({
    pinnedComment: z.partialRecord(z.enum(TRANS_LANGS), z.string()),
    rulesFile: z.string(),
    imdbRating: z.boolean().default(false),
    recommendParagraph: z.boolean().default(false),
  }),

  publisher: z.object({
    accounts: z.partialRecord(z.enum(TRANS_LANGS), z.object({ secret: z.string(), note: z.string().optional() })).default({}),
  }).default({ accounts: {} }),
});

/** Remotion Composition id — 언더스코어 불가. slug 는 디렉토리·대화용 그대로. */
export const compositionIdOf = (slug) => slug.replace(/_/g, "-");

/** 상단 밴드 padding 문자열 → { padL, padR } (check-captions 용). */
export function parsePaddingLR(padding) {
  const parts = String(padding).trim().split(/\s+/).map((s) => parseFloat(s));
  if (parts.length === 1) return { padL: parts[0], padR: parts[0] };
  if (parts.length === 2 || parts.length === 3) return { padL: parts[1], padR: parts[1] };
  return { padL: parts[3], padR: parts[1] };
}
/** fontSize 리터럴 → px. "55pt" → 73.33 (예전 captionLayouts 표와 같은 소수 2자리). */
export function fontSizePx(v) {
  if (typeof v === "number") return v;
  const m = /^([\d.]+)(pt|px)?$/.exec(String(v).trim());
  if (!m) return NaN;
  const n = parseFloat(m[1]);
  return m[2] === "pt" ? Math.round((n * 4) / 3 * 100) / 100 : n;
}
export const WARN_PILL_METRICS = { padL: 14, padR: 14, fontPx: 38, maxLines: 2 };

/** check-captions 가 쓰는 오버플로 추정 레이아웃 — 포맷 JSON 에서 파생. */
export function deriveCaptionLayout(f) {
  const { padL, padR } = parsePaddingLR(f.layout.topBand.padding);
  const top = { padL, padR, fontPx: fontSizePx(f.typography.top.style.fontSize), maxLines: f.typography.top.maxLines };
  const cz = f.layout.captionZone;
  const caption = f.features.captions && cz && f.typography.translation
    ? { zoneL: cz.left, zoneR: cz.right, fontPx: fontSizePx(f.typography.translation.style.fontSize) }
    : null;
  const out = { top, caption };
  if (f.features.warnPill) out.warn = { ...WARN_PILL_METRICS };
  return out;
}

/** 포맷 집합의 교차 검증 (CI: tools/validate-formats.mjs). */
export function validateFormats(formats) {
  const errs = [];
  const seen = (name) => { const s = new Map(); return (v, slug) => { if (s.has(v)) errs.push(`${name} 중복: ${v} (${s.get(v)} / ${slug})`); s.set(v, slug); }; };
  const slugs = seen("slug"), ports = seen("previewPort"), comps = seen("compositionId");
  for (const f of formats) {
    slugs(f.slug, f.slug); ports(f.previewPort, f.slug); comps(compositionIdOf(f.slug), f.slug);
    if (!f.languages.targets.includes(f.languages.base)) errs.push(`${f.slug}: languages.targets 에 base(${f.languages.base}) 가 없음`);
    for (const l of f.languages.targets) {
      if (!f.captionGuide.pinnedComment[l]) errs.push(`${f.slug}: captionGuide.pinnedComment.${l} 없음`);
      if (!f.publisher.accounts[l]) errs.push(`${f.slug}: publisher.accounts.${l} 슬롯 없음 (시크릿 이름 지정)`);
    }
    if (f.layout.mode === "symmetric" && !f.layout.band) errs.push(`${f.slug}: symmetric 인데 layout.band 없음`);
    if (f.layout.mode === "contain-auto" && !f.layout.containAuto) errs.push(`${f.slug}: contain-auto 인데 layout.containAuto 없음`);
    if (f.features.captions && (!f.layout.captionZone || !f.typography.translation)) errs.push(`${f.slug}: captions=true 인데 captionZone/typography.translation 없음`);
    if (!f.features.captions && f.layout.captionZone) errs.push(`${f.slug}: captions=false 인데 captionZone 있음`);
    if (f.features.warnPill && f.layout.mode !== "contain-auto") errs.push(`${f.slug}: warnPill 은 contain-auto 레이아웃에서만`);
  }
  return errs;
}
