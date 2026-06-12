import React from "react";
import { AbsoluteFill } from "remotion";
import "../fonts";
import type { GoodMoviesProps } from "../props";
import { captionFont, originalFont, showOriginal, topFontNative } from "../lang";
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
}) => {
  return (
    <AbsoluteFill
      style={{ background: "#fff", fontFeatureSettings: '"palt"' }}
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
          strongStyle={{ fontWeight: 800, fontStyle: "normal" }}
          lineStyle={{
            fontFamily: topFontNative(translationLanguage),
            fontSize: "48pt",
            fontWeight: 600,
            color: "#000",
            lineHeight: 1.22,
            letterSpacing: "-0.02em",
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
          justifyContent: "flex-end",
          paddingBottom: 70,
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
                fontWeight: 600,
                color: "#FFEB3B",
                letterSpacing: "-0.01em",
                lineHeight: translationLanguage === "th" ? 1.45 : 1.22,
                WebkitTextStroke: "1.5px #000",
                paintOrder: "stroke fill",
                textShadow: "0 3px 12px rgba(0,0,0,0.85)",
                overflowWrap: "break-word",
                wordBreak: "keep-all",
              }}
            >
              {cap.translation}
            </div>
            {/* 아래: 원어 (흰, 굵게) — 영어 음원만 */}
            {showOriginal(originalLanguage) && (
              <div
                style={{
                  width: "100%",
                  fontFamily: originalFont(originalLanguage),
                  fontSize: 52,
                  fontWeight: 800,
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
              fontFamily: '"Noto Sans JP", sans-serif',
              fontSize: 36,
              fontWeight: 300,
              color: "rgba(0,0,0,0.62)",
              letterSpacing: "0.02em",
            }}
          >
            {`${mediaKind || "映画"}『${mediaTitleJa}』`}
          </div>
        ) : null}
      </div>
    </AbsoluteFill>
  );
};
