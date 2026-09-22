// props.json 필드 레지스트리 — 어떤 필드가 "구조"(언어 무관, 베이스를 따라감)이고 어떤 필드가 "텍스트"(언어별 번역)인지.
// derive-lang --sync 가 STRUCTURAL_KEYS 만 베이스에서 덮어쓴다. 새 props 필드를 추가하면 여기도 분류할 것.
export const PROPS_FIELDS = {
  // 구조 — 레이아웃·타이밍·미디어. 4개 언어가 반드시 같아야 한다.
  durationInFrames: "structural",
  videoSrc: "structural",
  layout: "structural",
  videoNumber: "structural",
  captionPaddingTop: "structural",
  topCaptionMaxLines: "structural",
  originalLanguage: "structural",
  mediaKind: "structural",
  captionYOffset: "structural",
  watermark: "structural",
  warnBlink: "structural",
  warnOpacity: "structural",
  videoFit: "structural",
  videoAspectRatio: "structural",
  videoObjectPosition: "structural",
  bandHeight: "structural",
  endFadeSeconds: "structural",
  comments: "structural",
  // captions 는 특수: 타임스탬프만 동기화, original/translation 은 언어별.
  captions: "captions",
  // 텍스트 — 언어별로 다르다.
  title: "text",
  artist: "text",
  topCaption: "text",
  topCaptionLineSizes: "text", // 줄 길이가 언어마다 달라 줄별 축소도 언어별
  translationLanguage: "text",
  mediaTitleJa: "text", // = 그 언어권 개봉 제목
  artistTrack: "text",
  bottomCTA: "text",
  warnText: "text",
  captionScale: "text", // 언어별 글자 폭이 달라 배율도 언어별
  commentStack: "structural",
};
export const STRUCTURAL_KEYS = Object.entries(PROPS_FIELDS).filter(([, v]) => v === "structural").map(([k]) => k);
export const TEXT_KEYS = Object.entries(PROPS_FIELDS).filter(([, v]) => v === "text").map(([k]) => k);
