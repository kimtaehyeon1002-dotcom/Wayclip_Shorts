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

// ── 댓글 오버레이 한 개 (굿바이브 하단) ──
// src 는 public 루트(=영상 디렉토리, 렌더 시 --public-dir) 기준 경로. 예: "comments/01.png".
// note 는 댓글 내용의 한국어 번역(식별용, 화면 미표시). start/end 는 초.
export const commentSchema = z.object({
  src: z.string(),
  start: z.number(), // 초
  end: z.number(), // 초
  note: z.string().default(""),
  // 블러본 원본 가로 px (prep-comments 가 ffprobe 로 기록). 표시 폭 = w × scale, maxWidth 캡.
  w: z.number().optional(),
});
export type Comment = z.infer<typeof commentSchema>;

// ── 공통 base ──
// title/artist 는 메타(화면 미표시). topCaption 은 시청자 언어로 1~2줄(\n 분리).
const baseShape = {
  title: z.string().default(""),
  artist: z.string().default(""),
  topCaption: z.string().default(""),
  // (선택) 상단멘트 줄별 폰트 크기(pt) 오버라이드. 길이 = 줄 수, null/누락이면 채널 기본 크기.
  // 한 줄만 넘칠 때 그 줄만 줄이는 escape hatch (예: [50, null]). 없으면 기존 양산 영상과 100% 동일.
  topCaptionLineSizes: z.array(z.number().nullable()).optional(),
  originalLanguage: origLangSchema.default("en"),
  translationLanguage: transLangSchema.default("ja"),
  captions: z.array(captionSchema).default([]),
  // public 루트(렌더 시 --public-dir=영상디렉토리) 기준 미디어 경로. new-video 가 source.mp4 하드링크 생성.
  videoSrc: z.string().default("source.mp4"),
  // new-video.mjs 가 미디어 마지막 프레임 pts 기준으로 산정해 props.json 에 기록.
  durationInFrames: z.number().int().positive().default(900),
};

// ── goodvibesongs (굿바이브) — base + 하단 댓글 오버레이 ──
export const goodVibeSongsSchema = z.object({
  ...baseShape,
  comments: z.array(commentSchema).default([]),
});
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
  // 자막(번역) 윗 패딩(px). 기본 555 = 표준 위치. 원본에 자막이 박힌(크롭한) 영상에서
  // 박힌 자막에 딱 붙도록 영상별로 조정. 미지정 시 표준값 유지(다른 영상 영향 없음).
  captionPaddingTop: z.number().default(555),
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
  // (선택) 영상 cover 크롭의 세로 기준점. CSS object-position 값(예: "center 22%").
  // 누락이면 가운데(기존 양산 영상과 동일). 얼굴이 위쪽에 있어 가운데 크롭에서 잘릴 때만 위로 당김.
  videoObjectPosition: z.string().optional(),
  // (선택) 영상 맞춤. 기본 "cover"(밴드 꽉 채움, 가장자리 크롭 — 양산 표준).
  // "contain" 이면 잘림 없이 영상 전체 노출(가로 영상이면 위아래 검정 여백). 와이드 소스 전용 예외.
  videoFit: z.enum(["cover", "contain"]).default("cover"),
  // (선택) 소스 영상 가로/세로 비(width/height). contain 일 때 레터박스 높이를 계산해
  // 상·하단 문구가 "실제 영상 가장자리"에 붙도록(밴드 가장자리가 아니라) 쓴다. cover 면 무시.
  videoAspectRatio: z.number().positive().optional(),
  // (선택) 상·하단 검정 밴드 높이(px). 누락이면 480(기존 양산 표준). 작게 줄이면 영상 영역이
  // 세로로 더 커져(=1920-2*band) cover 크롭이 덜 잘림. 영상 영역은 항상 가운데 정렬 유지.
  bandHeight: z.number().int().positive().optional(),
  // (선택) 영상 끝 페이드아웃 길이(초). 주면 컴포지션 마지막 N초 동안 화면이 검정으로
  // 어두워지고 오디오도 함께 줄어든다(끝맺음 처리). 누락이면 페이드 없음(양산 표준 — hard end).
  endFadeSeconds: z.number().positive().optional(),
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
  // 헤드라인 최대 줄 수. 기본 2 (양산 표준). 영상별로 3줄이 필요하면 props 에서 3 으로 올림.
  topCaptionMaxLines: z.number().int().positive().default(2),
  bottomCTA: z.string().default("続きは本文で"),
  warnText: z
    .string()
    .default("⚠️ このアカウントは、あなたの知らない科学の知識を\n1000個お届けします"),
  // 경고박스 깜빡임 on/off (기본 true=양산 표준). false 면 fade-in 후 솔리드 유지.
  warnBlink: z.boolean().default(true),
  // 경고박스 최대 불투명도 (기본 1). <1 이면 반투명 (영상별 옵션).
  warnOpacity: z.number().positive().default(1),
  // 1000 - 영상번호 (예: 028 → #972). new-video.mjs 가 자동 주입.
  videoNumber: z.string().default(""),
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
