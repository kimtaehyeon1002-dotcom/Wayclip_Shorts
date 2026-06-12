import React from "react";
import { AbsoluteFill } from "remotion";
import "../fonts";
import type { ReadyActionProps } from "../props";
import { captionFont, originalFontJp, showOriginal, topFontJpLead } from "../lang";
import { FONT } from "../fonts";
import { BackgroundVideo } from "../components/BackgroundVideo";
import { CaptionTrack } from "../components/CaptionTrack";
import { TopCaption } from "../components/TopCaption";

// 레디액션 — 영화 클립. 검정 배경. 상단 시리즈 고정 카피(**…**만 굵게) / 영상 1080×960 거의 정사각.
// 자막: 영상 영역 세로 중앙. 위 원어(흰 이탤릭) / 아래 번역(48px/400 흰). 하단 #번호 + 영화 정보.
const VIDEO_TOP = 480;
const VIDEO_H = 960;
const NSJP = [`"${FONT.jp}"`, "sans-serif"].join(", ");

export const ReadyAction: React.FC<ReadyActionProps> = ({
  topCaption,
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
    <AbsoluteFill style={{ background: "#000", fontFeatureSettings: '"palt"' }}>
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
          strongStyle={{ fontWeight: 500, fontStyle: "normal" }}
          lineStyle={{
            fontFamily: topFontJpLead(translationLanguage),
            fontSize: "50pt",
            fontWeight: 200,
            color: "#fff",
            lineHeight: 1.18,
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
                fontSize: 48,
                fontWeight: 400,
                color: "#fff",
                letterSpacing: "-0.04em",
                lineHeight: translationLanguage === "th" ? 1.45 : 1.22,
                WebkitTextStroke: "1.5px rgba(0,0,0,0.7)",
                paintOrder: "stroke fill",
                textShadow: "0 3px 14px rgba(0,0,0,0.65), 0 0 5px rgba(0,0,0,0.55)",
                overflowWrap: "break-word",
                wordBreak: "keep-all",
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
              fontFamily: NSJP,
              fontSize: 40,
              fontWeight: 500,
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
              fontFamily: NSJP,
              fontSize: 38,
              fontWeight: 200,
              color: "rgba(255,255,255,0.92)",
              letterSpacing: "0.02em",
              textAlign: "center",
            }}
          >
            {`${mediaKind || "映画"}『${mediaTitleJa}』`}
          </div>
        ) : null}
      </div>
    </AbsoluteFill>
  );
};
