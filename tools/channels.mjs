// 채널 정의 — new-video / validate-props / check-captions 가 공유.
// src/props.ts 의 zod default 와 반드시 일치시킬 것 (props.json 을 완전하게 쓰기 위함).

export const CHANNELS = [
  "goodvibesongs",
  "goodmovies",
  "readyaction",
  "thishiphop",
  "space_lab",
];
export const ORIG_LANGS = ["en", "ko", "ja"];
// tw = 대만(번체중국어). 언어코드 = props 파일 접미사(props.tw.json) = 결재본 접미사(047-tw.mp4).
export const TRANS_LANGS = ["ko", "ja", "th", "tw", "vi"];
// 다국어 양산 채널 — props.json(=ja 베이스) + props.<lang>.json 3개.
export const MULTILANG_CHANNELS = ["goodmovies", "space_lab", "readyaction"];
export const MULTILANG_SET = ["ja", "tw", "th", "vi"];

// 채널 전체가 공유하는 **고정 문구**의 언어별 대응.
// 영상마다 바뀌는 텍스트(헤드라인·자막·작품명)가 아니라, 채널 브랜딩으로 매 영상 같은 문자열.
// derive-lang 이 변형 props 를 만들 때 자동으로 채워 넣는다 → 영상마다 손번역해서 문구가
// 갈라지는 사고를 막는다. 문구를 바꾸려면 여기만 고치고 --sync 가 아니라 재파생할 것.
export const channelFixedStrings = {
  readyaction: {
    // 시리즈 고정 카피. **…** 가 굵게(weight 100 → 400).
    ja: { topCaption: "歴代最高の**映画1000本を、**\n順不同で収集中" },
    tw: { topCaption: "史上最棒的**1000部電影，**\n不分順序收藏中" },
    th: { topCaption: "รวม **1000 หนังที่ดีที่สุด**\nตลอดกาล แบบไม่เรียงลำดับ" },
    vi: { topCaption: "Sưu tầm **1000 phim hay nhất**\nmọi thời đại, không theo thứ tự" },
  },
  space_lab: {
    // 헤드라인(topCaption)은 영상별이라 여기 없음 — bottomCTA/warnText 만 채널 고정.
    ja: {
      bottomCTA: "続きは本文で",
      warnText: "⚠️ このアカウントは、あなたの知らない科学の知識を\n1000個お届けします",
    },
    tw: {
      bottomCTA: "更多內容看貼文",
      warnText: "⚠️ 這個帳號會為你送上你不知道的科學知識\n總共**1000則**",
    },
    th: {
      bottomCTA: "อ่านต่อในแคปชัน",
      warnText: "⚠️ บัญชีนี้จะส่งต่อความรู้วิทยาศาสตร์ที่คุณไม่เคยรู้\nรวม **1000 เรื่อง**",
    },
    vi: {
      bottomCTA: "Xem tiếp ở phần mô tả",
      warnText: "⚠️ Tài khoản này sẽ mang đến cho bạn\n**1000** kiến thức khoa học bạn chưa từng biết",
    },
  },
  // 굿무비는 채널 고정 문구가 없다 (상단 멘트가 영상마다 다름).
  goodmovies: {},
};
export const FPS = 30;
export const CANVAS_W = 1080;
export const CANVAS_H = 1920;

// 채널별 기본 props (src/props.ts schema default 미러). durationInFrames/captions/layout 은 런타임 주입.
export const channelDefaults = {
  goodvibesongs: {
    title: "",
    artist: "",
    topCaption: "",
    originalLanguage: "en",
    translationLanguage: "ja",
    comments: [],
  },
  goodmovies: {
    title: "",
    artist: "",
    topCaption: "",
    originalLanguage: "en",
    translationLanguage: "ja",
    mediaKind: "映画",
    mediaTitleJa: "",
  },
  readyaction: {
    title: "",
    artist: "",
    topCaption: "歴代最高の**映画1000本を、**\n順不同で収集中",
    originalLanguage: "en",
    translationLanguage: "ja",
    videoNumber: "",
    mediaKind: "映画",
    mediaTitleJa: "",
  },
  thishiphop: {
    title: "",
    artist: "",
    topCaption: "",
    originalLanguage: "en",
    translationLanguage: "ja",
    videoNumber: "",
    artistTrack: "",
  },
  space_lab: {
    title: "Space Lab Topic",
    artist: "Source",
    topCaption: "[[NASA]]が「タコ」から学んだ驚異の[[技術]]",
    bottomCTA: "続きは本文で",
    warnText: "⚠️ このアカウントは、あなたの知らない科学の知識を\n1000個お届けします",
    videoNumber: "",
    originalLanguage: "ja",
    translationLanguage: "ja",
  },
};

// Remotion Composition id 는 언더스코어 불가 → 채널 slug → composition id 매핑.
// (slug 는 디렉토리/대화용 그대로, render/studio 의 id 만 변환)
export const compositionId = {
  goodvibesongs: "goodvibesongs",
  goodmovies: "goodmovies",
  readyaction: "readyaction",
  thishiphop: "thishiphop",
  space_lab: "space-lab",
};

// 동기 자막(captions) 워크플로 있는 채널.
export const hasCaptions = {
  goodvibesongs: true,
  goodmovies: true,
  readyaction: true,
  thishiphop: true,
  space_lab: false,
};

// 템플릿이 #번호를 자동 주입하는 채널 (videoNumber 변수 보유).
export const hasVideoNumber = {
  readyaction: true,
  thishiphop: true,
  space_lab: true, // 단, #번호 = 1000 - 영상번호 (new-video.mjs 가 분기)
};

// 오버플로 추정용 레이아웃 상수 (check-captions.mjs 가 사용). src/channels/*.tsx 의 수치 미러.
// fontPx: pt 는 px 환산(1pt=1.3333px). caption.fontPx 는 main(가장 큰) 자막 기준.
export const captionLayouts = {
  goodvibesongs: {
    top: { padL: 60, padR: 60, fontPx: 73.33, maxLines: 2 },
    caption: { zoneL: 60, zoneR: 60, fontPx: 46 },
  },
  goodmovies: {
    top: { padL: 60, padR: 60, fontPx: 64, maxLines: 2 },
    caption: { zoneL: 50, zoneR: 50, fontPx: 52 },
  },
  readyaction: {
    top: { padL: 60, padR: 60, fontPx: 66.67, maxLines: 2 },
    caption: { zoneL: 60, zoneR: 60, fontPx: 48 },
  },
  thishiphop: {
    top: { padL: 60, padR: 60, fontPx: 65.33, maxLines: 2 },
    caption: { zoneL: 60, zoneR: 60, fontPx: 44 },
  },
  space_lab: {
    top: { padL: 50, padR: 50, fontPx: 60, maxLines: 2 },
    caption: null,
    // 영상 아래 빨간 깜빡 경고 박스 (WarnPill.tsx: fontSize 38 / padding 0 14px / height 70 = 2줄).
    // 일본어 기준으로 짜인 문구라 태국어·베트남어에서 실제로 넘친다 → 사전 검사 대상.
    warn: { padL: 14, padR: 14, fontPx: 38, maxLines: 2 },
  },
};

// space_lab 영상별 밴드 layout 계산 — 원본 CLAUDE.md "영상별 layout 패치" 자동화.
// 영상은 가로폭 1080 에 맞춰 contain, 세로 영상은 height cap, 위·아래 검정 영역은 대칭.
export function computeSpaceLabLayout(srcW, srcH) {
  const WARN_H = 70;
  const VIDEO_BOTTOM_GAP = 20;
  const MAX_VIDEO_H = 1400;
  let videoH = Math.round((srcH * CANVAS_W) / srcW);
  if (videoH > MAX_VIDEO_H) videoH = MAX_VIDEO_H;
  const totalBlack = CANVAS_H - videoH - WARN_H - VIDEO_BOTTOM_GAP;
  const topH = Math.round(totalBlack / 2);
  const bottomH = totalBlack - topH;
  const warnTop = topH + videoH + VIDEO_BOTTOM_GAP;
  const bottomTop = warnTop + WARN_H;
  return { topH, videoH, warnTop, bottomTop, bottomH };
}

// ── 다국어 props 파일 규칙 ─────────────────────────────────────────────
// props.json          = 베이스(굿무비·스페이스랩은 일본어)
// props.<lang>.json   = 변형 (props.tw.json / props.th.json / props.vi.json)
// 언어코드 = 파일 접미사 = 결재본 접미사로 통일.

/** 변형 props 파일명. 베이스 언어면 props.json. */
export function propsFileName(lang, baseLang = "ja") {
  return !lang || lang === baseLang ? "props.json" : `props.${lang}.json`;
}

/**
 * 결재본 출력 폴더 — **언어별로 최상위 폴더를 분리**한다.
 *   베이스(일본어)  output/readyaction/952/952.mp4      (기존 그대로)
 *   변형            output/readyaction-tw/952/952.mp4
 * 폴더가 언어를 나타내므로 **파일명엔 접미사를 붙이지 않는다** —
 * 각 언어 폴더가 일본어 폴더와 똑같은 모양이라 나라별로 통째로 넘기기 쉽다.
 */
export function outputChannelDir(channel, lang, baseLang = "ja") {
  return !lang || lang === baseLang ? channel : `${channel}-${lang}`;
}

/**
 * `--lang X` → 실제 읽을 props 경로.
 * props.X.json 이 있으면 그것, 없고 props.json 의 translationLanguage 가 X 면 props.json.
 * 둘 다 아니면 null (호출부가 에러 처리).
 */
export function resolvePropsPath(fs, path, dirAbs, lang) {
  const base = path.join(dirAbs, "props.json");
  if (!lang) return fs.existsSync(base) ? base : null;
  const variant = path.join(dirAbs, `props.${lang}.json`);
  if (fs.existsSync(variant)) return variant;
  if (!fs.existsSync(base)) return null;
  try {
    const p = JSON.parse(fs.readFileSync(base, "utf8"));
    if (p.translationLanguage === lang) return base;
  } catch {
    /* 파싱 실패는 호출부의 기존 에러 경로가 잡는다 */
  }
  return null;
}
