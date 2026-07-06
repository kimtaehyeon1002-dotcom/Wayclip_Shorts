import React from "react";
import { AbsoluteFill, interpolate, useCurrentFrame, useVideoConfig } from "remotion";
import "../fonts";
import type { ThisHipHopProps } from "../props";
import { captionFont, originalFontLatin, latinFont, showOriginal, topFontInterLead } from "../lang";
import { BackgroundVideo } from "../components/BackgroundVideo";
import { CaptionTrack } from "../components/CaptionTrack";
import { TopCaption } from "../components/TopCaption";

// 디스힙합 — 힙합 트랙. 검정 배경. 상단 멘트(영상별 자유, 전체 동일 굵기) / 영상 1080×960.
// 자막: 영상 영역 세로 중앙. 위 원어(흰 이탤릭) / 아래 번역(44px/600 흰). 하단 #번호 + 영문 Artist-Track.
// 폰트: 출시본과 동일하게 라틴=San Francisco(-apple-system), 일본어 글리프=Hiragino 폴백.
const INTER = latinFont();

export const ThisHipHop: React.FC<ThisHipHopProps> = ({
  topCaption,
  originalLanguage,
  translationLanguage,
  videoSrc,
  captions,
  videoNumber,
  artistTrack,
  videoObjectPosition,
  videoFit,
  videoAspectRatio,
  bandHeight,
  topCaptionLineSizes,
  endFadeSeconds,
}) => {
  // 끝 페이드아웃(선택): 마지막 endFadeSeconds 초 동안 화면 검정 + 오디오 0 으로.
  const { fps, durationInFrames } = useVideoConfig();
  const frame = useCurrentFrame();
  const fadeFrames = endFadeSeconds ? Math.round(endFadeSeconds * fps) : 0;
  const fadeRange: [number, number] = [durationInFrames - fadeFrames, durationInFrames - 1];
  const fadeOpacity =
    fadeFrames > 0
      ? interpolate(frame, fadeRange, [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" })
      : 0;
  const videoVolume =
    fadeFrames > 0
      ? (f: number) =>
          interpolate(f, fadeRange, [1, 0], { extrapolateLeft: "clamp", extrapolateRight: "clamp" })
      : 1;
  // 상·하단 밴드 높이(기본 480). 영상 영역은 그만큼 빼고 가운데 정렬 → 항상 1920 = band+video+band.
  const VIDEO_TOP = bandHeight ?? 480;
  const VIDEO_H = 1920 - 2 * VIDEO_TOP;
  // contain 일 때 실제 영상은 밴드 안에서 가운데 정렬되고 위아래 레터박스(검정)가 생긴다.
  // 그 레터박스만큼 상·하단 밴드를 늘려 문구가 "실제 영상 가장자리"에 붙게 한다(cover 때와 동일 거리).
  const letterbox =
    videoFit === "contain" && videoAspectRatio
      ? Math.max(0, (VIDEO_H - Math.min(VIDEO_H, 1080 / videoAspectRatio)) / 2)
      : 0;
  const BAND_H = VIDEO_TOP + letterbox; // 실제 영상 위/아래 검정(밴드+레터박스)
  const VIDEO_BOX_TOP = BAND_H; // 실제 영상 박스 = 레터박스 제외, 화면 가운데
  const VIDEO_BOX_H = VIDEO_H - 2 * letterbox;
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
          height: BAND_H,
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
          lineSizes={topCaptionLineSizes}
          markup="bold"
          strongStyle={{ fontWeight: "inherit", fontStyle: "normal" }}
          lineStyle={{
            fontFamily: topFontInterLead(translationLanguage),
            fontSize: "49pt",
            fontWeight: 400,
            color: "#fff",
            lineHeight: translationLanguage === "th" ? 1.4 : 1.18,
            letterSpacing: 0,
            fontFeatureSettings: '"palt" 1',
          }}
        />
      </div>

      {/* 영상 영역 + vignette */}
      <BackgroundVideo
        src={videoSrc}
        top={VIDEO_BOX_TOP} height={VIDEO_BOX_H} background="#000" objectFit={videoFit ?? "cover"}
        volume={videoVolume}
        objectPosition={videoObjectPosition}>
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
          top: VIDEO_BOX_TOP,
          left: 60,
          right: 60,
          height: VIDEO_BOX_H,
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
                  fontFamily: originalFontLatin(),
                  fontSize: 36,
                  fontWeight: 400,
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
                fontWeight: 500,
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
          height: BAND_H,
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
              fontWeight: 300,
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
              fontWeight: 100,
              color: "rgba(255,255,255,0.65)",
              letterSpacing: "-0.015em",
              textAlign: "center",
            }}
          >
            {artistTrack}
          </div>
        ) : null}
      </div>

      {/* 끝 페이드아웃 — 화면 전체 검정 오버레이(영상 위로 덮임). 오디오는 videoVolume 으로 동시 페이드. */}
      {fadeOpacity > 0 ? (
        <AbsoluteFill
          style={{ background: "#000", opacity: fadeOpacity, pointerEvents: "none" }}
        />
      ) : null}
    </AbsoluteFill>
  );
};
