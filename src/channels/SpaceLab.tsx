import React from "react";
import { AbsoluteFill } from "remotion";
import "../fonts";
import type { SpaceLabProps } from "../props";
import {
  letterSpacingFor,
  paltFor,
  scriptLineHeight,
  topFontNative,
} from "../lang";
import { BackgroundVideo } from "../components/BackgroundVideo";
import { TopCaption } from "../components/TopCaption";
import { WarnPill } from "../components/WarnPill";

// 스페이스랩 — 정보 쇼츠. 자막 없음. 상단 헤드라인([[빨강]] + **굵게**) / 영상 contain(잘림 X) /
// 영상 아래 빨간 깜빡 경고 / 하단 고정 CTA. 밴드 geometry 는 영상 비율에 맞춰 new-video 가 계산(layout prop).
// 텍스트는 전부 translationLanguage 기반 — ja/tw/th/vi 4개 결재본을 같은 컴포지션으로 낸다.

export const SpaceLab: React.FC<SpaceLabProps> = ({
  topCaption,
  topCaptionMaxLines,
  bottomCTA,
  warnText,
  warnBlink,
  warnOpacity,
  videoNumber,
  translationLanguage,
  videoSrc,
  layout,
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
      {/* 상단 헤드라인 */}
      <div
        style={{
          position: "absolute",
          top: 0,
          left: 0,
          right: 0,
          height: layout.topH,
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "flex-end",
          textAlign: "center",
          padding: "40px 50px 30px 50px",
          gap: 6,
          background: "#000",
        }}
      >
        <TopCaption
          text={topCaption}
          maxLines={topCaptionMaxLines}
          markup="redbold"
          strongStyle={{ fontWeight: 700, fontStyle: "normal" }}
          redStyle={{ color: "#FC0200" }}
          lineStyle={{
            fontFamily: topFontNative(translationLanguage),
            fontSize: 60,
            fontWeight: 500,
            color: "#fff",
            lineHeight: scriptLineHeight(translationLanguage, 1.18),
            letterSpacing: letterSpacingFor(translationLanguage, -0.04),
            fontFeatureSettings: paltFor(translationLanguage),
          }}
        />
      </div>

      {/* 영상 영역 — contain (잘림 X) */}
      <BackgroundVideo
        src={videoSrc}
        top={layout.topH}
        height={layout.videoH}
        background="#000"
        objectFit="contain"
      />

      {/* 빨간 깜빡 경고 (영상 아래) */}
      <WarnPill
        warnText={warnText}
        topPx={layout.warnTop}
        blink={warnBlink}
        maxOpacity={warnOpacity}
        lang={translationLanguage}
      />

      {/* 하단 고정 CTA */}
      <div
        style={{
          position: "absolute",
          top: layout.bottomTop,
          left: 0,
          right: 0,
          height: layout.bottomH,
          background: "#000",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "flex-start",
          padding: "105px 60px 0 60px",
          gap: 2,
        }}
      >
        {numText ? (
          <div
            style={{
              // #번호는 라틴 숫자뿐이라 어느 언어든 자형 차이가 없다 — 일본어 스택 그대로(합성 italic 유지).
              fontFamily: topFontNative("ja"),
              fontSize: 33,
              fontWeight: 400,
              fontStyle: "italic",
              fontSynthesis: "style",
              color: "#fff",
              letterSpacing: "-0.01em",
              fontFeatureSettings: '"palt" 1',
              textAlign: "center",
            }}
          >
            {numText}
          </div>
        ) : null}
        <div
          style={{
            fontFamily: topFontNative(translationLanguage),
            fontSize: 60,
            fontWeight: 400,
            color: "#fff",
            letterSpacing: letterSpacingFor(translationLanguage, -0.04),
            lineHeight: scriptLineHeight(translationLanguage, 1.18),
            fontFeatureSettings: paltFor(translationLanguage),
            textAlign: "center",
          }}
        >
          {bottomCTA}
        </div>
      </div>
    </AbsoluteFill>
  );
};
