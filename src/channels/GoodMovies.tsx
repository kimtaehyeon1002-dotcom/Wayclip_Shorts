import React from "react";
import { AbsoluteFill } from "remotion";
import "../fonts";
import type { GoodMoviesProps } from "../props";
import {
  captionFont,
  letterSpacingFor,
  originalFontJp,
  paltFor,
  scriptLineHeight,
  showOriginal,
  topFontJpLead,
  topFontNative,
  wordBreakFor,
} from "../lang";
import { mediaCredit } from "../i18n";
import { BackgroundVideo } from "../components/BackgroundVideo";
import { CaptionTrack } from "../components/CaptionTrack";
import { TopCaption } from "../components/TopCaption";

// 굿무비 — 영화 클립 + 듀얼 자막. 흰 배경 / 검정 멘트.
// 2026-07-29 개편: 레이아웃은 레디액션식(상 480 / 영상 960 / 하 480, 자막 영상 세로 중앙,
//   상단 시리즈 고정 카피, 하단 #(1000-번호) + 영화 정보), 색은 굿무비 유지
//   (흰 배경 / 검정 상단·하단 문구 / 번역 노랑 #FFEB3B / 원어 흰 + 검정 stroke).
// 자막 순서도 레디액션식: 위 원어(흰 이탤릭 36px) → 아래 번역(노랑 48px).
// 텍스트는 translationLanguage 기반 — ja/tw/th/vi 결재본을 같은 컴포지션으로 낸다.
const VIDEO_TOP = 480;
const VIDEO_H = 960;

export const GoodMovies: React.FC<GoodMoviesProps> = ({
  topCaption,
  topCaptionLineSizes,
  originalLanguage,
  translationLanguage,
  videoSrc,
  captions,
  videoNumber,
  mediaKind,
  mediaTitleJa,
  captionYOffset = 0,
}) => {
  const numText = videoNumber
    ? String(videoNumber).startsWith("#")
      ? videoNumber
      : `#${videoNumber}`
    : "";
  return (
    <AbsoluteFill
      style={{
        background: "#fff",
        fontFeatureSettings: paltFor(translationLanguage),
      }}
    >
      {/* 상단 흰색 + 시리즈 고정 카피 (**…** 만 굵게) */}
      <div
        style={{
          position: "absolute",
          top: 0,
          left: 0,
          right: 0,
          height: VIDEO_TOP,
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "flex-end",
          textAlign: "center",
          padding: "40px 60px 60px 60px",
          gap: 6,
          background: "#fff",
        }}
      >
        <TopCaption
          text={topCaption}
          markup="bold"
          // 줄별 pt 오버라이드 — check-captions 는 예전부터 이 값을 반영했는데 렌더엔
          // 연결돼 있지 않았다(검사는 통과하는데 화면은 넘치는 함정). 개편으로 상단이
          // 48pt→50pt 가 되면서 개편 전 영상(075/084)이 실제로 걸려 배선.
          lineSizes={topCaptionLineSizes}
          strongStyle={{ fontWeight: 500, fontStyle: "normal" }}
          lineStyle={{
            fontFamily: topFontJpLead(translationLanguage),
            fontSize: "50pt",
            fontWeight: 200,
            color: "#000",
            // 개편 후 값(1.18 / 트래킹 0)을 유지하되 줄높이만 언어별 헬퍼로.
            // letterSpacing 은 원래 0 이라 언어 분기할 게 없다.
            lineHeight: scriptLineHeight(translationLanguage, 1.18),
            letterSpacing: 0,
          }}
        />
      </div>

      {/* 영상 영역 + vignette */}
      <BackgroundVideo
        src={videoSrc}
        top={VIDEO_TOP}
        height={VIDEO_H}
        background="#fff"
        objectFit="cover"
        overscan={1.015}
      >
        <div
          style={{
            position: "absolute",
            inset: 0,
            background:
              "radial-gradient(ellipse at center, rgba(0,0,0,0) 30%, rgba(0,0,0,0.35) 100%)",
            pointerEvents: "none",
          }}
        />
      </BackgroundVideo>

      {/* 자막 (영상 영역 세로 중앙) */}
      <CaptionTrack
        captions={captions}
        fadeSeconds={0.05}
        zoneStyle={{
          position: "absolute",
          top: VIDEO_TOP,
          left: 60,
          right: 60,
          height: VIDEO_H,
          pointerEvents: "none",
        }}
        groupStyle={{
          position: "absolute",
          inset: 0,
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          gap: 0,
          textAlign: "center",
          transform: `translateY(${captionYOffset}px)`,
        }}
        renderContent={(cap) => (
          <>
            {/* 위: 원어 (흰 이탤릭) — 영어 음원만. 원본에 자막이 박힌 영상은 original 을 비워 번역만 표시 */}
            {showOriginal(originalLanguage) && cap.original && (
              <div
                style={{
                  width: "100%",
                  fontFamily: originalFontJp(),
                  fontSize: 36,
                  fontWeight: 300,
                  fontStyle: "italic",
                  fontSynthesis: "style",
                  color: "#fff",
                  letterSpacing: "0.01em",
                  lineHeight: 1.25,
                  WebkitTextStroke: "1.2px #000",
                  paintOrder: "stroke fill",
                  textShadow: "0 2px 10px rgba(0,0,0,0.7), 0 0 3px rgba(0,0,0,0.5)",
                  overflowWrap: "break-word",
                  wordBreak: "keep-all",
                }}
              >
                {cap.original}
              </div>
            )}
            {/* 아래: 번역 (노랑) */}
            <div
              style={{
                width: "100%",
                fontFamily: captionFont(translationLanguage),
                fontSize: 48,
                fontWeight: 400,
                color: "#FFEB3B",
                // 개편 후 트래킹(-0.02em)을 유지하되 CJK 전용이므로 언어별 분기.
                letterSpacing: letterSpacingFor(translationLanguage, -0.02),
                lineHeight: scriptLineHeight(translationLanguage, 1.22),
                WebkitTextStroke: "1.5px #000",
                paintOrder: "stroke fill",
                textShadow: "0 3px 12px rgba(0,0,0,0.85)",
                overflowWrap: "break-word",
                wordBreak: wordBreakFor(translationLanguage),
              }}
            >
              {cap.translation}
            </div>
          </>
        )}
      />

      {/* 하단 흰색 + #(1000-번호) + 영화/드라마 정보 */}
      <div
        style={{
          position: "absolute",
          bottom: 0,
          left: 0,
          right: 0,
          height: VIDEO_TOP,
          background: "#fff",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "flex-start",
          padding: "90px 40px 0 40px",
          gap: 4,
          lineHeight: 1.05,
        }}
      >
        {numText ? (
          <div
            style={{
              // #번호는 라틴 숫자뿐 — 어느 언어든 자형이 같으므로 일본어 스택 고정.
              fontFamily: topFontNative("ja"),
              fontSize: 40,
              fontWeight: 400,
              fontStyle: "italic",
              color: "#000",
              letterSpacing: "0.04em",
            }}
          >
            {numText}
          </div>
        ) : null}
        {mediaTitleJa ? (
          <div
            style={{
              // 개편 후 타이포(38/200/0.72)를 유지하되 폰트만 언어별로.
              fontFamily: topFontNative(translationLanguage),
              fontSize: 38,
              fontWeight: 200,
              color: "rgba(0,0,0,0.72)",
              letterSpacing: "0.02em",
              textAlign: "center",
            }}
          >
            {/* mediaTitleJa = "표시용 제목" — 변형 props 엔 그 언어권 개봉 제목을 넣는다 */}
            {mediaCredit(mediaKind, mediaTitleJa, translationLanguage)}
          </div>
        ) : null}
      </div>
    </AbsoluteFill>
  );
};
