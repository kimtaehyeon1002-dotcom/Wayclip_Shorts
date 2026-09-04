import { z } from "zod";

// ── 언어 ──
// 원어(음원): en | ko | ja  /  번역(시청자): ko | ja | th | tw | vi
//   tw = 대만(번체중국어) — 언어코드 = props 파일 접미사 = 결재본 접미사로 통일(tw/th/vi).
//   굿무비·스페이스랩은 한 영상당 ja/tw/th/vi 4개 결재본을 낸다 (props.<lang>.json 형제 파일).
export const origLangSchema = z.enum(["en", "ko", "ja"]);
export const transLangSchema = z.enum(["ko", "ja", "th", "tw", "vi"]);
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

// ── 텍스트 워터마크 (채널 핸들 — 영상 밴드 위에 은은하게) ──
// 굿바이브 표준(101 확정본, 2026-07-29): { text: "@goodvibesongs.mp3", y: 0.375, size: 17,
// opacity: 0.45, weight: 500 } — 아래 default 와 동일. 영상별로 바꾸지 말 것(양산 일관성).
// 표준값은 tools/channels.mjs 의 GOODVIBE_WATERMARK 와 미러. 한쪽만 고치지 말 것.
export const watermarkSchema = z.object({
  text: z.string(),
  // 영상 밴드 안 세로 위치 (0 = 밴드 맨 위, 0.5 = 정중앙, 1 = 밴드 맨 아래).
  // 0.375 → 화면 y 830px. 자막(세로 중앙 +70px)보다 위라 겹치지 않음.
  y: z.number().default(0.375),
  size: z.number().default(17), // px
  opacity: z.number().default(0.45),
  weight: z.number().default(500),
});
export type Watermark = z.infer<typeof watermarkSchema>;

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

// ── goodvibesongs (굿바이브) — base + 하단 댓글 오버레이 + (선택) 텍스트 워터마크 ──
export const goodVibeSongsSchema = z.object({
  ...baseShape,
  comments: z.array(commentSchema).default([]),
  // (선택) 채널 핸들 워터마크. 누락이면 아무것도 안 그림(기존 양산 영상과 100% 동일).
  watermark: watermarkSchema.optional(),
  // (선택) 자막을 영상 세로중앙에서 아래로 내리는 양(px). 기본 70 = 채널 표준.
  // 화면분할(상/하 2단) 영상처럼 중앙 정렬이 필요할 때만 0 으로 덮어쓴다.
  captionYOffset: z.number().default(70),
});
export type GoodVibeSongsProps = z.infer<typeof goodVibeSongsSchema>;

// ── goodmovies (굿무비) — + 하단 영화 정보 ──
// enum 값은 **일본어 안정 키** — 화면 표기는 src/i18n.ts 의 mediaLabel() 이 언어별로 매핑한다.
// (readyaction/950 이 "短編" 을 쓰고 있어 enum 에 추가. 새 종류를 쓸 땐 i18n.ts 표에도 같이 넣을 것.)
export const mediaKindSchema = z
  .enum(["映画", "ドラマ", "アニメ", "ドキュメンタリー", "短編"])
  .default("映画");
export const goodMoviesSchema = z.object({
  ...baseShape,
  // 2026-07-29 개편: 레디액션식 시리즈 고정 카피 (영상별 멘트 → 시리즈 카피).
  topCaption: z.string().default("死ぬまでに観たい**名作映画**\n**1000本を、**順不同で紹介中"),
  translationLanguage: transLangSchema.default("ja"),
  // 하단 #번호 = 1000 - 영상번호 (예: 090 → #910). new-video.mjs 가 자동 주입.
  videoNumber: z.string().default(""),
  mediaKind: mediaKindSchema,
  mediaTitleJa: z.string().default(""),
  // (deprecated) 자막이 영상 하단 정렬이던 시절의 윗 패딩(px). 자막이 세로 중앙으로 바뀌어
  // 더는 쓰이지 않음. 기존 영상(073~084) props.json 호환을 위해 스키마에만 남겨둠.
  captionPaddingTop: z.number().default(555),
  // 자막 블록을 영상 세로중앙에서 아래(+)/위(-)로 미는 px. 클로즈업이라 자막이 얼굴을
  // 가릴 때 영상별로 내린다. default 0 = 기존대로 세로 중앙 (다른 영상 영향 없음).
  captionYOffset: z.number().default(0),
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
