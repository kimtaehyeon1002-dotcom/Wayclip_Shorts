import { z } from "zod";

// ── 언어 ──
// 원어(음원): en | ko | ja  /  번역(시청자): ko | ja | th
export const origLangSchema = z.enum(["en", "ko", "ja"]);
export const transLangSchema = z.enum(["ko", "ja", "th"]);
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

// ── 공통 base ──
// title/artist 는 메타(화면 미표시). topCaption 은 시청자 언어로 1~2줄(\n 분리).
const baseShape = {
  title: z.string().default(""),
  artist: z.string().default(""),
  topCaption: z.string().default(""),
  originalLanguage: origLangSchema.default("en"),
  translationLanguage: transLangSchema.default("ko"),
  captions: z.array(captionSchema).default([]),
  // public 루트(렌더 시 --public-dir=영상디렉토리) 기준 미디어 경로. new-video 가 source.mp4 하드링크 생성.
  videoSrc: z.string().default("source.mp4"),
  // new-video.mjs 가 미디어 마지막 프레임 pts 기준으로 산정해 props.json 에 기록.
  durationInFrames: z.number().int().positive().default(900),
};

// ── goodvibesongs (굿바이브) — base 그대로 ──
export const goodVibeSongsSchema = z.object({ ...baseShape });
export type GoodVibeSongsProps = z.infer<typeof goodVibeSongsSchema>;

// ── goodmovies (굿무비) — + 하단 영화 정보 ──
export const mediaKindSchema = z
  .enum(["映画", "ドラマ", "アニメ", "ドキュメンタリー"])
  .default("映画");
export const goodMoviesSchema = z.object({
  ...baseShape,
  translationLanguage: transLangSchema.default("ja"),
  mediaKind: mediaKindSchema,
  mediaTitleJa: z.string().default(""),
});
export type GoodMoviesProps = z.infer<typeof goodMoviesSchema>;

// ── readyaction (레디액션) — + #번호 + 영화 정보, 시리즈 고정 카피 ──
export const readyActionSchema = z.object({
  ...baseShape,
  topCaption: z.string().default("歴代最高の**映画1000本を、**\n順不同で収集中"),
  translationLanguage: transLangSchema.default("ja"),
  videoNumber: z.string().default(""),
  mediaKind: mediaKindSchema,
  mediaTitleJa: z.string().default(""),
});
export type ReadyActionProps = z.infer<typeof readyActionSchema>;

// ── thishiphop (디스힙합) — + #번호 + 영문 Artist - Track ──
export const thisHipHopSchema = z.object({
  ...baseShape,
  translationLanguage: transLangSchema.default("ja"),
  videoNumber: z.string().default(""),
  artistTrack: z.string().default(""),
});
export type ThisHipHopProps = z.infer<typeof thisHipHopSchema>;

// ── space_lab (스페이스랩) — 자막 없음. 헤드라인 + 빨간 경고 + 하단 CTA + 영상별 layout ──
export const spaceLabLayoutSchema = z.object({
  topH: z.number(),
  videoH: z.number(),
  warnTop: z.number(),
  bottomTop: z.number(),
  bottomH: z.number(),
});
export type SpaceLabLayout = z.infer<typeof spaceLabLayoutSchema>;

export const spaceLabSchema = z.object({
  title: z.string().default("Space Lab Topic"),
  artist: z.string().default("Source"),
  topCaption: z
    .string()
    .default("[[NASA]]が「タコ」から学んだ驚異の[[技術]]"),
  bottomCTA: z.string().default("続きは本文で"),
  warnText: z
    .string()
    .default("⚠️今フォローしておかないと、見逃すかもしれません"),
  originalLanguage: origLangSchema.default("ja"),
  translationLanguage: transLangSchema.default("ja"),
  videoSrc: z.string().default("source.mp4"),
  durationInFrames: z.number().int().positive().default(900),
  // new-video.mjs 가 ffprobe 로 영상 비율을 재서 자동 계산해 기록 (원본은 수동 패치였음).
  layout: spaceLabLayoutSchema.default({
    topH: 420,
    videoH: 1080,
    warnTop: 1520,
    bottomTop: 1590,
    bottomH: 330,
  }),
});
export type SpaceLabProps = z.infer<typeof spaceLabSchema>;

export const FPS = 30;
export const WIDTH = 1080;
export const HEIGHT = 1920;
