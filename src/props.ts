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
  // 블러본 원본 세로 px (prep-comments 가 기록). 스택 모드의 밀어올림 애니메이션에 필요.
  h: z.number().optional(),
  // (선택) 스택 모드 — true 면 교체되지 않고 화면 아래에서부터 **쌓인다**. start 에 등장해
  // 영상 끝까지 남고, 뒤이어 오는 스택 댓글이 아래에 붙으면서 먼저 온 것들을 위로 밀어올린다.
  // 마지막 장면에서 사연이 하나씩 모여 쌓이는 연출용 (111 부터).
  stack: z.boolean().optional(),
  // (선택) 스택이 붙는 쪽. "bottom"(기본) = 화면 아래에서 위로 쌓이고 새 댓글이 아래에 붙는다.
  // "top" = 그 거울상 — 화면 위에서 아래로 쌓이고 새 댓글이 위에 붙으며 먼저 온 것들을 내린다.
  // 위/아래가 같은 배율·같은 밀려붙는 모션이라 형식이 맞는다.
  anchor: z.enum(["top", "bottom"]).optional(),
  // (선택) 스택 댓글의 좌우 정렬. 생략하면 아래 스택은 left/right 를 번갈아(지그재그),
  // 위 스택은 가운데 정렬. 좌우로 어긋나야 세로로 겹쳐 붙여도 서로 글자를 안 가린다.
  align: z.enum(["left", "right", "center"]).optional(),
  // (선택) 스택 댓글을 정렬된 가장자리에서 안쪽(중앙쪽)으로 미는 px.
  dx: z.number().optional(),

  // ── 핀 모드 (pin) — 화면을 통째로 덮는 콜라주 조각 ──
  // 마지막 1초에 사연이 하나씩 빠르게 꽂히며 여백 없이 화면을 채우는 연출용.
  // stack 과 달리 레이아웃 계산 없이 x/y 에 그대로 박고, start 부터 영상 끝까지 남는다.
  pin: z.boolean().optional(),
  x: z.number().optional(), // 화면 좌표(px) — 조각의 중심
  y: z.number().optional(),
  rot: z.number().optional(), // 회전(도). 좌/우로 살짝 틀어 쌓인 느낌을 낸다
  scale: z.number().optional(), // 이 조각만의 배율 (없으면 commentStack.scale)
  // 레이어. 큰 값이 위. 0 = 화면을 메우는 배경 더미, 1 = 그 위에 얹는 실제 사연,
  // 2 = 맨 마지막에 정중앙으로 꽂히는 메인. 같은 z 안에서는 start 순서(나중이 위).
  z: z.number().optional(),
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
  // (선택) 스택 모드(comments[].stack) 튜닝. 누락이면 아래 default — 스택 댓글이 없으면
  // 아무 영향 없으므로 기존 양산 영상과 100% 동일.
  commentStack: z
    .object({
      // 스택이 차오를 수 있는 상한 y(px). 넘긴 만큼 오래된 댓글부터 위로 잘려나간다.
      // 1075 = 자막 블록(영상 세로중앙+70 ≈ y 1000~1060) 바로 아래 — 가수 얼굴·자막을 안 가린다.
      top: z.number().default(1075),
      bottom: z.number().default(20), // 화면 맨 아래 여백(px)
      gap: z.number().default(10), // 쌓인 댓글 사이 세로 간격(px)
      scale: z.number().default(0.85), // 스택 댓글 표시 배율(원본 px 기준)
      // 한 장이 등장하며 위를 밀어올리는 데 걸리는 시간(초). 0 이면 즉시(하드컷).
      riseSeconds: z.number().default(0.22),
      // 새 댓글이 위 댓글을 얼마나 덜 밀어올리는지 (1 = 안 겹침, 0.7 = 30% 겹쳐 붙음).
      // 좌우 지그재그(align)와 같이 쓰면 글자를 안 가리면서 촘촘하게 모인다.
      overlap: z.number().default(1),
      sideMargin: z.number().default(30), // 좌/우 정렬 시 화면 가장자리 여백(px)
      // ── 위쪽 스택(anchor:"top") ── 큐레이션한 사연을 화면 상단 가운데에 세워두는 자리.
      topY: z.number().default(450), // 위 스택이 시작하는 y (영상 밴드 상단 440 바로 아래)
      topGap: z.number().default(10),
      // 위 스택은 가운데 정렬이라 좌우로 안 어긋난다 → 겹치면 글자를 가리므로 기본 1(안 겹침).
      topOverlap: z.number().default(1),
      topHeight: z.number().default(550), // 위 스택이 쓸 수 있는 세로 범위(px). 자막 위까지.
    })
    .optional(),
  // (선택) 채널 핸들 워터마크. 누락이면 아무것도 안 그림(기존 양산 영상과 100% 동일).
  watermark: watermarkSchema.optional(),
  // (선택) 자막을 영상 세로중앙에서 아래로 내리는 양(px). 기본 70 = 채널 표준.
  // 화면분할(상/하 2단) 영상처럼 중앙 정렬이 필요할 때만 0 으로 덮어쓴다.
  captionYOffset: z.number().default(70),
  // (선택) 자막 글자 배율. 기본 1 = 채널 표준(원어 34 / 번역 46px).
  // 가사 한 줄이 길어 두 줄로 넘칠 때만 영상별로 낮춘다 (굿무비 captionScale 과 같은 역할).
  captionScale: z.number().default(1),
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
  // 자막 글자 크기 배율 (원어 36px / 번역 48px 에 곱함). default 1 = 채널 표준이라
  // 기존 영상엔 영향 없음. 클로즈업이라 자막이 커 보일 때 영상별로 줄인다.
  captionScale: z.number().default(1),
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
