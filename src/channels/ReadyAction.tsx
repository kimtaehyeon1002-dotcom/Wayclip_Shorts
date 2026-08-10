import React from "react";
import { AbsoluteFill } from "remotion";
import "../fonts";
import type { ReadyActionProps } from "../props";
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

// 레디액션 — 영화 클립. 검정 배경. 상단 시리즈 고정 카피(**…**만 굵게) / 영상 1080×960 거의 정사각.
// 자막: 영상 영역 세로 중앙. 위 원어(흰 이탤릭) / 아래 번역(48px/400 흰). 하단 #번호 + 영화 정보.
// 텍스트는 translationLanguage 기반 — ja/tw/th/vi 결재본을 같은 컴포지션으로 낸다.
const VIDEO_TOP = 480;
const VIDEO_H = 960;

export const ReadyAction: React.FC<ReadyActionProps> = ({
  topCaption,
  topCaptionLineSizes,
  originalLanguage,
  translationLanguage,
  videoSrc,
  captions,
  videoNumber,
  mediaKind,
  mediaTitleJa,
}) => {
  const numText = videoNumber
    ? String(videoNumber).startsWith("#")
      ? videoNumber
      : `#${videoNumber}`
    : "";
  return (
    <AbsoluteFill
      style={{
        background: "#000",
        fontFeatureSettings: paltFor(translationLanguage),
      }}
    >
      {/* 상단 검정 + 시리즈 고정 멘트 */}
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
          background: "#000",
        }}
      >
        <TopCaption
          text={topCaption}
          markup="bold"
          // 굿무비와 같은 이유로 배선 (check-captions 는 반영하는데 렌더는 무시하던 상태).
          lineSizes={topCaptionLineSizes}
          strongStyle={{ fontWeight: 400, fontStyle: "normal" }}
          lineStyle={{
            fontFamily: topFontJpLead(translationLanguage),
            fontSize: "50pt",
            fontWeight: 100,
            color: "#fff",
            lineHeight: scriptLineHeight(translationLanguage, 1.18),
            letterSpacing: 0,
          }}
        />
      </div>

      {/* 영상 영역 + vignette */}
      <BackgroundVideo
        src={videoSrc}
        top={VIDEO_TOP} height={VIDEO_H} background="#000" objectFit="cover">
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

      {/* 자막 (세로 중앙) */}
      <CaptionTrack
        captions={captions}
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
        }}
        renderContent={(cap) => (
          <>
            {showOriginal(originalLanguage) && (
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
                  textShadow: "0 2px 10px rgba(0,0,0,0.6), 0 0 3px rgba(0,0,0,0.5)",
                  overflowWrap: "break-word",
                  wordBreak: "keep-all",
                }}
              >
                {cap.original}
              </div>
            )}
            <div
              style={{
                width: "100%",
                fontFamily: captionFont(translationLanguage),
                fontSize: 48,
                fontWeight: 300,
                color: "#fff",
                letterSpacing: letterSpacingFor(translationLanguage, -0.04),
                lineHeight: scriptLineHeight(translationLanguage, 1.22),
                WebkitTextStroke: "1.5px rgba(0,0,0,0.7)",
                paintOrder: "stroke fill",
                textShadow: "0 3px 14px rgba(0,0,0,0.65), 0 0 5px rgba(0,0,0,0.55)",
                overflowWrap: "break-word",
                wordBreak: wordBreakFor(translationLanguage),
              }}
            >
              {cap.translation}
            </div>
          </>
        )}
      />

      {/* 하단 검정 + #번호 + 영화 정보 */}
      <div
        style={{
          position: "absolute",
          bottom: 0,
          left: 0,
          right: 0,
          height: VIDEO_TOP,
          background: "#000",
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
              // #번호는 라틴 숫자뿐 — 어느 언어든 자형이 같으므로 일본어 스택 고정(합성 italic 유지).
              fontFamily: topFontNative("ja"),
              fontSize: 40,
              fontWeight: 400,
              fontStyle: "italic",
              color: "#fff",
              letterSpacing: "0.04em",
            }}
          >
            {numText}
          </div>
        ) : null}
        {mediaTitleJa ? (
          <div
            style={{
              fontFamily: topFontNative(translationLanguage),
              fontSize: 38,
              fontWeight: 100,
              color: "rgba(255,255,255,0.92)",
              letterSpacing: "0.02em",
              textAlign: "center",
            }}
          >
            {/* mediaTitleJa = "표시용 제목" — 변형 props 엔 그 언어권 개봉 제목 */}
            {mediaCredit(mediaKind, mediaTitleJa, translationLanguage)}
          </div>
        ) : null}
      </div>
    </AbsoluteFill>
  );
};
