// 결정적 폰트 로딩 — preview·render 양쪽이 동일 폰트로 렌더되도록 모듈 최상단에서 로드.
// loadFont() 는 내부적으로 delayRender 를 걸어 첫 프레임 전 폰트 준비를 보장 → 직접 delayRender 불필요.
//
// 채널별로 실제 쓰는 weight 만 열거 (번들/네트워크 요청 최소화). subsets 도 언어별로 한정.
// (일본어 subset 은 글리프가 많아 요청 수가 본질적으로 큼 — ignoreTooManyRequestsWarning 로 경고만 끔.)
import { loadFont as loadJP } from "@remotion/google-fonts/NotoSansJP";
import { loadFont as loadKR } from "@remotion/google-fonts/NotoSansKR";
import { loadFont as loadThai } from "@remotion/google-fonts/NotoSansThai";
import { loadFont as loadTC } from "@remotion/google-fonts/NotoSansTC";
import { loadFont as loadInter } from "@remotion/google-fonts/Inter";
import { loadFont as loadLocalFont } from "@remotion/fonts";

const jp = loadJP("normal", {
  weights: ["100", "200", "300", "400", "500", "600", "700", "800"],
  subsets: ["japanese", "latin"],
  ignoreTooManyRequestsWarning: true,
});
const kr = loadKR("normal", {
  weights: ["400", "500", "600"],
  subsets: ["korean", "latin"],
  ignoreTooManyRequestsWarning: true,
});
// 태국어: 스페이스랩 헤드라인이 500, **굵게** 가 700 이라 400/600 만으론 합성 굵기가 나온다 → 실제 쓰는 weight 전부.
const thai = loadThai("normal", {
  weights: ["400", "500", "600", "700"],
  subsets: ["thai", "latin"],
});
// 번체중국어(대만) — 일본어와 같은 이유로 글리프가 많아 요청 수가 큼(경고만 끔).
const tc = loadTC("normal", {
  weights: ["400", "500", "600", "700"],
  subsets: ["chinese-traditional", "latin"],
  ignoreTooManyRequestsWarning: true,
});
// vietnamese subset 이 없으면 베트남어 성조부호(U+1EXX)가 폴백 폰트로 새어 룩이 깨진다.
const inter = loadInter("normal", {
  weights: ["100", "200", "400", "500", "600", "800"],
  subsets: ["latin", "vietnamese"],
});
const interItalic = loadInter("italic", {
  weights: ["300", "400"],
  subsets: ["latin", "vietnamese"],
});

// Pretendard 는 Google Fonts 에 없음 → CDN(jsDelivr)에서 가변 woff2 로드.
// (google-fonts 가 이미 원격 페치하므로 렌더는 네트워크 필요 — Pretendard 도 동일 경로. public/ 의존 없음.)
// loadFont() 가 render-blocking 을 내부 처리하므로 await 불필요. 실패 시 fallback 체인(Noto Sans KR)이 받음.
loadLocalFont({
  family: "Pretendard",
  url: "https://cdn.jsdelivr.net/gh/orioncactus/pretendard@v1.3.9/packages/pretendard/dist/web/variable/woff2/PretendardVariable.woff2",
  weight: "45 920",
  display: "block",
}).catch(() => {});

export const FONT = {
  jp: jp.fontFamily, // "Noto Sans JP"
  kr: kr.fontFamily, // "Noto Sans KR"
  thai: thai.fontFamily, // "Noto Sans Thai"
  tc: tc.fontFamily, // "Noto Sans TC" (번체중국어/대만)
  inter: inter.fontFamily, // "Inter"
  interItalic: interItalic.fontFamily,
  pretendard: "Pretendard",
} as const;
