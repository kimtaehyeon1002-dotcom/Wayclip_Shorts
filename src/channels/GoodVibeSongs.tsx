import React from "react";
import { AbsoluteFill } from "remotion";
import "../fonts";
import type { GoodVibeSongsProps } from "../props";
import {
  captionFont,
  latinFont,
  originalFont,
  showOriginal,
  topFontJpLead,
} from "../lang";
import { BackgroundVideo } from "../components/BackgroundVideo";
import { CaptionTrack } from "../components/CaptionTrack";
import { CommentTrack } from "../components/CommentTrack";
import { TopCaption } from "../components/TopCaption";

// 굿바이브 — 음악 + 듀얼 자막. 검정 배경, 3-band 대칭 (상 440 / 영상 1040 / 하 440).
// 자막: 영상 영역 세로 중앙. 위 원어(작은 이탤릭, 영어 음원만) / 아래 번역(46px/600, 흰).
const VIDEO_TOP = 440;
const VIDEO_H = 1040;
// 자막을 영상 세로중앙에서 살짝 아래로 내린 양(px). 2026-07-29 사용자 요청으로 0 → 70.
const CAPTION_Y_OFFSET = 70;
// 하단 댓글 오버레이: 영상 바로 밑 작은 틈(GAP) + 내용 길이대로 폭 가변(가운데 정렬).
const COMMENT_GAP = 16; // 영상 끝 ~ 댓글 사이 틈(px)
const COMMENT_SCALE = 1.0; // 모든 댓글 공통 표시 배율(원본 px 기준). 글자 키우려면 ↑
const COMMENT_MAXW = 900; // 표시 폭 상한(px) — 업로드 시 양끝 잘림 방지(안전여백 ~90px). 넘는 댓글은 글자 작아져도 캡
const COMMENT_TOP = VIDEO_TOP + VIDEO_H + COMMENT_GAP; // = 1496
const COMMENT_ZONE_H = 1920 - COMMENT_TOP - 20; // 하단 20px 여백

export const GoodVibeSongs: React.FC<GoodVibeSongsProps> = ({
  topCaption,
  topCaptionLineSizes,
  originalLanguage,
  translationLanguage,
  videoSrc,
  captions,
  comments,
  watermark,
  captionYOffset = CAPTION_Y_OFFSET,
}) => {
  return (
    <AbsoluteFill
      style={{ background: "#000", fontFeatureSettings: '"palt"' }}
    >
      {/* 상단 검정 + 멘트 */}
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
          padding: "40px 60px 30px 60px",
          gap: 4,
          background: "#000",
        }}
      >
        <TopCaption
          text={topCaption}
          lineSizes={topCaptionLineSizes}
          markup="bold"
          strongStyle={{ fontWeight: 400, fontStyle: "normal" }}
          lineStyle={{
            fontFamily: topFontJpLead(translationLanguage),
            fontSize: "55pt",
            fontWeight: 300,
            color: "#fff",
            lineHeight: translationLanguage === "th" ? 1.4 : 1.18,
            letterSpacing: "-0.04em",
          }}
        />
      </div>

      {/* 영상 영역 + vignette */}
      <BackgroundVideo
        src={videoSrc}
        top={VIDEO_TOP}
        height={VIDEO_H}
        background="#000"
        objectFit="cover"
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

      {/* (선택) 채널 핸들 워터마크 — 영상 밴드 위, 은은하게. 자막보다 아래 레이어 */}
      {watermark && (
        <div
          style={{
            position: "absolute",
            top: VIDEO_TOP + VIDEO_H * watermark.y,
            left: 0,
            right: 0,
            transform: "translateY(-50%)",
            textAlign: "center",
            fontFamily: latinFont(),
            fontSize: watermark.size,
            fontWeight: watermark.weight,
            color: "#fff",
            opacity: watermark.opacity,
            letterSpacing: "0.02em",
            textShadow: "0 2px 12px rgba(0,0,0,0.6)",
            pointerEvents: "none",
          }}
        >
          {watermark.text}
        </div>
      )}

      {/* 자막 (영상 영역 위, 세로 중앙) */}
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
          gap: 3,
          textAlign: "center",
          transform: `translateY(${captionYOffset}px)`,
        }}
        renderContent={(cap) => (
          <>
            {showOriginal(originalLanguage) && (
              <div
                style={{
                  width: "100%",
                  fontFamily: originalFont(originalLanguage),
                  fontSize: 34,
                  fontWeight: 400,
                  fontStyle: "italic",
                  color: "rgba(255,255,255,0.82)",
                  letterSpacing: "0.01em",
                  lineHeight: 1.25,
                  textShadow:
                    "0 2px 14px rgba(0,0,0,0.95), 0 0 4px rgba(0,0,0,0.8)",
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
                fontSize: 46,
                fontWeight: 400,
                color: "#fff",
                letterSpacing: "-0.01em",
                lineHeight: translationLanguage === "th" ? 1.45 : 1.2,
                textShadow:
                  "0 3px 20px rgba(0,0,0,0.95), 0 0 6px rgba(0,0,0,0.9)",
                overflowWrap: "break-word",
                wordBreak: "keep-all",
              }}
            >
              {cap.translation}
            </div>
          </>
        )}
      />

      {/* 하단 검정 */}
      <div
        style={{
          position: "absolute",
          bottom: 0,
          left: 0,
          right: 0,
          height: 440,
          background: "#000",
        }}
      />

      {/* 하단 댓글 오버레이 (영상 바로 밑, 가운데). comments 비면 아무것도 안 그림 */}
      <CommentTrack
        comments={comments}
        scale={COMMENT_SCALE}
        maxWidth={COMMENT_MAXW}
        maxHeight={COMMENT_ZONE_H}
        zoneStyle={{
          position: "absolute",
          top: COMMENT_TOP,
          left: 0,
          right: 0,
          height: COMMENT_ZONE_H,
          pointerEvents: "none",
        }}
      />
    </AbsoluteFill>
  );
};
