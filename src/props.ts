import { z } from "zod";
import { ORIG_LANGS, TRANS_LANGS } from "@wayclip/shared/langs.mjs";

// ── 언어 ── 단일 소스 = packages/shared/langs.mjs (도구·퍼블리셔·웹과 공유. 예전의 2중 미러 폐지)
export const origLangSchema = z.enum(ORIG_LANGS);
export const transLangSchema = z.enum(TRANS_LANGS);
export type OrigLang = z.infer<typeof origLangSchema>;
export type TransLang = z.infer<typeof transLangSchema>;
export type Lang = OrigLang | TransLang;

// ── 자막 한 cue ──
// 시나리오와 무관하게 항상 { original, translation } 두 필드. 표시 여부는 채널/언어가 분기.
export const captionSchema = z.object({
  start: z.number(), // 초
  end: z.number(), // 초
  original: z.string(),
  translation: z.string(),
});
export type Caption = z.infer<typeof captionSchema>;

// ── 댓글 오버레이 한 개 (굿바이브 하단) ──
// src 는 public 루트(=영상 디렉토리, 렌더 시 --public-dir) 기준 경로. 예: "comments/01.png".
// note 는 댓글 내용의 한국어 번역(식별용, 화면 미표시). start/end 는 초.
export const commentSchema = z.object({
  src: z.string(),
  start: z.number(), // 초
  end: z.number(), // 초
  note: z.string().default(""),
  // 블러본 원본 가로/세로 px (prep-comments 가 ffprobe 로 기록). 표시 폭 = w × scale, maxWidth 캡.
  w: z.number().optional(),
  h: z.number().optional(),
  // (선택) 스택 모드 — true 면 교체되지 않고 화면 아래에서부터 **쌓인다**. start 에 등장해
  // 영상 끝까지 남고, 뒤이어 오는 스택 댓글이 아래에 붙으면서 먼저 온 것들을 위로 밀어올린다.
  stack: z.boolean().optional(),
  // (선택) 스택이 붙는 쪽. "bottom"(기본) / "top"(거울상).
  anchor: z.enum(["top", "bottom"]).optional(),
  // (선택) 스택 댓글의 좌우 정렬. 생략하면 아래 스택은 left/right 지그재그, 위 스택은 가운데.
  align: z.enum(["left", "right", "center"]).optional(),
  // (선택) 정렬된 가장자리에서 안쪽으로 미는 px.
  dx: z.number().optional(),
  // ── 핀 모드 (pin) — 화면을 통째로 덮는 콜라주 조각. x/y 에 그대로 박고 start 부터 끝까지 남는다. ──
  pin: z.boolean().optional(),
  x: z.number().optional(),
  y: z.number().optional(),
  rot: z.number().optional(),
  scale: z.number().optional(),
  z: z.number().optional(),
});
export type Comment = z.infer<typeof commentSchema>;

// ── 텍스트 워터마크 (채널 핸들 — 영상 밴드 위에 은은하게) ──
// 표준값은 formats/goodvibesongs.json features.watermark.default 한 곳 (예전의 두 곳 미러 폐지).
export const watermarkSchema = z.object({
  text: z.string(),
  y: z.number().default(0.375), // 영상 밴드 안 세로 위치 (0 = 맨 위, 1 = 맨 아래)
  size: z.number().default(17),
  opacity: z.number().default(0.45),
  weight: z.number().default(500),
});
export type Watermark = z.infer<typeof watermarkSchema>;

// enum 값은 **일본어 안정 키** — 화면 표기는 src/i18n.ts 의 mediaLabel() 이 언어별로 매핑한다.
export const mediaKindSchema = z.enum(["映画", "ドラマ", "アニメ", "ドキュメンタリー", "短編"]);
export type MediaKind = z.infer<typeof mediaKindSchema>;

// contain-auto(space_lab 식) 밴드 geometry — new-video 가 영상 비율로 계산해 props.json 에 기록.
export const spaceLabLayoutSchema = z.object({
  topH: z.number(),
  videoH: z.number(),
  warnTop: z.number(),
  bottomTop: z.number(),
  bottomH: z.number(),
});
export type SpaceLabLayout = z.infer<typeof spaceLabLayoutSchema>;

// ── 모든 포맷이 공유하는 props 스키마 ──
// 채널별 default 는 여기 없다 — formats/<slug>.json 의 defaultProps 가 Remotion defaultProps 로 들어가고,
// 컴포넌트는 그 위에 props.json(--props, top-level shallow merge)을 얹어 받는다.
// 어떤 키가 어느 포맷에서 의미를 갖는지는 formats/*.json 의 features/layout 이 정한다.
export const formatPropsSchema = z.object({
  // 메타 (화면 미표시)
  title: z.string().default(""),
  artist: z.string().default(""),
  // 상단 멘트/헤드라인 (시청자 언어, \n 분리)
  topCaption: z.string().default(""),
  topCaptionLineSizes: z.array(z.number().nullable()).optional(), // 줄별 pt 오버라이드
  topCaptionMaxLines: z.number().int().positive().optional(),
  originalLanguage: origLangSchema.default("en"),
  translationLanguage: transLangSchema.default("ja"),
  captions: z.array(captionSchema).default([]),
  videoSrc: z.string().default("source.mp4"),
  durationInFrames: z.number().int().positive().default(900),
  // 자막 위치/크기 (features.captions)
  captionYOffset: z.number().optional(),
  captionScale: z.number().default(1),
  captionPaddingTop: z.number().optional(), // (deprecated) 굿무비 073~084 호환
  // 하단 밴드 행
  videoNumber: z.string().default(""),
  mediaKind: mediaKindSchema.optional(),
  mediaTitleJa: z.string().default(""),
  artistTrack: z.string().default(""),
  bottomCTA: z.string().default(""),
  // 영상 맞춤 (layout.video.propsFitOverride / propsObjectPosition / propsBandOverride / letterboxAware)
  videoFit: z.enum(["cover", "contain"]).optional(),
  videoObjectPosition: z.string().optional(),
  videoAspectRatio: z.number().positive().optional(),
  bandHeight: z.number().int().positive().optional(),
  endFadeSeconds: z.number().positive().optional(),
  // 댓글 오버레이 (features.comments)
  comments: z.array(commentSchema).default([]),
  commentStack: z.record(z.string(), z.number()).optional(),
  // 워터마크 (features.watermark)
  watermark: watermarkSchema.optional(),
  // 경고 박스 (features.warnPill)
  warnText: z.string().default(""),
  warnBlink: z.boolean().optional(),
  warnOpacity: z.number().positive().optional(),
  // contain-auto 밴드 geometry
  layout: spaceLabLayoutSchema.optional(),
});
export type FormatProps = z.infer<typeof formatPropsSchema>;

/** @deprecated 채널별 타입은 전부 FormatProps — 한 릴리스 동안 별칭 유지 */
export type GoodVibeSongsProps = FormatProps;
export type GoodMoviesProps = FormatProps;
export type ReadyActionProps = FormatProps;
export type ThisHipHopProps = FormatProps;
export type SpaceLabProps = FormatProps;

export const FPS = 30;
export const WIDTH = 1080;
export const HEIGHT = 1920;
