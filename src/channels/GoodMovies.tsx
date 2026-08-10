import React from "react";
import { AbsoluteFill } from "remotion";
import "../fonts";
import type { GoodMoviesProps } from "../props";
import {
  captionFont,
  letterSpacingFor,
  originalFont,
  paltFor,
  scriptLineHeight,
  showOriginal,
  topFontNative,
  wordBreakFor,
} from "../lang";
import { mediaCredit } from "../i18n";
import { BackgroundVideo } from "../components/BackgroundVideo";
import { CaptionTrack } from "../components/CaptionTrack";
import { TopCaption } from "../components/TopCaption";

// 굿무비 — 영화 클립 + 듀얼 자막. 흰 배경 / 검정 멘트.
// 자막: 영상 영역 하단. 위 번역(노란 40px/600) / 아래 원어(흰 52px/800, 영어 음원만). 하단 영화 정보.
const VIDEO_TOP = 440;
const VIDEO_H = 1040;

export const GoodMovies: React.FC<GoodMoviesProps> = ({
  topCaption,
  originalLanguage,
  translationLanguage,
  videoSrc,
  captions,
  mediaKind,
  mediaTitleJa,
  captionPaddingTop,
}) => {
  return (
    <AbsoluteFill
      style={{
        background: "#fff",
        fontFeatureSettings: paltFor(translationLanguage),
      }}
    >
      {/* 상단 흰색 + 멘트 (Bold) */}
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
          strongStyle={{ fontWeight: 600, fontStyle: "normal" }}
          lineStyle={{
            fontFamily: topFontNative(translationLanguage),
            fontSize: "48pt",
            fontWeight: 400,
            color: "#000",
            lineHeight: scriptLineHeight(translationLanguage, 1.22),
            letterSpacing: letterSpacingFor(translationLanguage, -0.02),
          }}
        />
      </div>

      {/* 영상 영역 + 하단 그라데이션 */}
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
              "linear-gradient(to top, rgba(0,0,0,0.55) 0%, rgba(0,0,0,0.20) 22%, rgba(0,0,0,0) 45%)",
            pointerEvents: "none",
          }}
        />
      </BackgroundVideo>

      {/* 자막 (영상 영역 안 하단 정렬) */}
      <CaptionTrack
        captions={captions}
        fadeSeconds={0.05}
        zoneStyle={{
          position: "absolute",
          top: VIDEO_TOP,
          left: 50,
          right: 50,
          height: VIDEO_H,
          pointerEvents: "none",
        }}
        groupStyle={{
          position: "absolute",
          inset: 0,
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          // 원본에 영문 자막이 박혀 있으면 그 바로 위/아래에 번역을 "타이트하게 붙여서" 둔다
          // (captionPaddingTop 으로 위치 조정. 떨어뜨리지 말 것 — 첫 추정부터 붙게 잡기. CLAUDE.md 자막 파이프라인 규칙 참조)
          justifyContent: "flex-start",
          paddingTop: captionPaddingTop,
          gap: 6,
          textAlign: "center",
        }}
        renderContent={(cap) => (
          <>
            {/* 위: 번역 (노란) */}
            <div
              style={{
                width: "100%",
                fontFamily: captionFont(translationLanguage),
                fontSize: 40,
                fontWeight: 400,
                color: "#FFEB3B",
                letterSpacing: letterSpacingFor(translationLanguage, -0.01),
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
            {/* 아래: 원어 (흰, 굵게) — 영어 음원만. 원본에 자막이 박힌 영상은 original 을 비워 번역만 표시 */}
            {showOriginal(originalLanguage) && cap.original && (
              <div
                style={{
                  width: "100%",
                  fontFamily: originalFont(originalLanguage),
                  fontSize: 52,
                  fontWeight: 600,
                  color: "#fff",
                  letterSpacing: "-0.01em",
                  lineHeight: 1.18,
                  WebkitTextStroke: "2px #000",
                  paintOrder: "stroke fill",
                  textShadow: "0 4px 14px rgba(0,0,0,0.85)",
                  overflowWrap: "break-word",
                  wordBreak: "keep-all",
                }}
              >
                {cap.original}
              </div>
            )}
          </>
        )}
      />

      {/* 하단 흰색 + 영화/드라마 정보 */}
      <div
        style={{
          position: "absolute",
          bottom: 0,
          left: 0,
          right: 0,
          height: 440,
          background: "#fff",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "flex-start",
          paddingTop: 60,
        }}
      >
        {mediaTitleJa ? (
          <div
            style={{
              fontFamily: topFontNative(translationLanguage),
              fontSize: 36,
              fontWeight: 300,
              color: "rgba(0,0,0,0.62)",
              letterSpacing: "0.02em",
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
