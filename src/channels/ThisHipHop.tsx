import React from "react";
import { AbsoluteFill } from "remotion";
import "../fonts";
import type { ThisHipHopProps } from "../props";
import { captionFont, originalFontJp, showOriginal, topFontInterLead } from "../lang";
import { FONT } from "../fonts";
import { BackgroundVideo } from "../components/BackgroundVideo";
import { CaptionTrack } from "../components/CaptionTrack";
import { TopCaption } from "../components/TopCaption";

// 디스힙합 — 힙합 트랙. 검정 배경. 상단 멘트(영상별 자유, 전체 동일 굵기) / 영상 1080×960.
// 자막: 영상 영역 세로 중앙. 위 원어(흰 이탤릭) / 아래 번역(44px/600 흰). 하단 #번호 + 영문 Artist-Track.
// 폰트: 라틴은 Inter, 일본어 글리프는 NSJP fallback (원본 system-native 선호는 Chromium 렌더에서 NSJP/Inter 로 귀결).
const VIDEO_TOP = 480;
const VIDEO_H = 960;
const INTER = [`"${FONT.inter}"`, "sans-serif"].join(", ");

export const ThisHipHop: React.FC<ThisHipHopProps> = ({
  topCaption,
  originalLanguage,
  translationLanguage,
  videoSrc,
  captions,
  videoNumber,
  artistTrack,
}) => {
  const numText = videoNumber
    ? String(videoNumber).startsWith("#")
      ? videoNumber
      : `#${videoNumber}`
    : "";
  return (
    <AbsoluteFill style={{ background: "#000", fontFeatureSettings: '"palt"' }}>
      {/* 상단 검정 + 멘트 (전체 동일 굵기) */}
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
          strongStyle={{ fontWeight: "inherit", fontStyle: "normal" }}
          lineStyle={{
            fontFamily: topFontInterLead(translationLanguage),
            fontSize: "49pt",
            fontWeight: 500,
            color: "#fff",
            lineHeight: 1.18,
            letterSpacing: 0,
            fontFeatureSettings: '"palt" 1',
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
                  fontWeight: 500,
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
                fontSize: 44,
                fontWeight: 600,
                color: "#fff",
                letterSpacing: "-0.04em",
                lineHeight: translationLanguage === "th" ? 1.45 : 1.22,
                WebkitTextStroke: "1.5px rgba(0,0,0,0.7)",
                paintOrder: "stroke fill",
                textShadow: "0 3px 14px rgba(0,0,0,0.65), 0 0 5px rgba(0,0,0,0.55)",
                overflowWrap: "break-word",
                wordBreak: "keep-all",
                ...(translationLanguage === "ja"
                  ? { fontFeatureSettings: '"palt" 1' }
                  : {}),
              }}
            >
              {cap.translation}
            </div>
          </>
        )}
      />

      {/* 하단 검정 + #번호 + Artist-Track */}
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
              fontFamily: INTER,
              fontSize: 46,
              fontWeight: 400,
              fontStyle: "italic",
              color: "#fff",
              letterSpacing: "-0.015em",
            }}
          >
            {numText}
          </div>
        ) : null}
        {artistTrack ? (
          <div
            style={{
              fontFamily: INTER,
              fontSize: 44,
              fontWeight: 150,
              color: "rgba(255,255,255,0.92)",
              letterSpacing: "-0.015em",
              textAlign: "center",
            }}
          >
            {artistTrack}
          </div>
        ) : null}
      </div>
    </AbsoluteFill>
  );
};
