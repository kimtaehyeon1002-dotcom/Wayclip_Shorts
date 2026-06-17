import React from "react";
import { interpolate, useCurrentFrame, useVideoConfig } from "remotion";
import type { Caption } from "../props";

const FADE = 0.18; // 초 — 원본 GSAP FADE 상수와 동일

// GSAP 일시정지 타임라인 대신, 각 caption 의 opacity 를 현재 프레임의 순수 함수로 계산.
// 4점 ramp + 양끝 clamp 로 원본의 "fade-in → hold → fade-out → end 에서 hard-kill" 재현.
export const CaptionTrack: React.FC<{
  captions: Caption[];
  zoneStyle: React.CSSProperties;
  groupStyle: React.CSSProperties;
  // 채널마다 원어/번역 순서·스타일이 달라서 내용 렌더는 위임.
  renderContent: (cap: Caption) => React.ReactNode;
}> = ({ captions, zoneStyle, groupStyle, renderContent }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const t = frame / fps; // 초 — caption start/end 와 같은 단위

  return (
    <div style={zoneStyle}>
      {captions.map((cap, i) => {
        // cue 가 2*FADE 보다 짧으면 4점 ramp 가 비단조가 되어 interpolate 가 깨진다.
        // 그땐 fade 를 dur/2 로 줄이고, 그래도 hold 구간이 안 남으면 삼각(fade-in→out)으로.
        const dur = cap.end - cap.start;
        const fade = Math.min(FADE, dur / 2);
        const fadeInEnd = cap.start + fade;
        const fadeOutStart = cap.end - fade;
        const opacity =
          fadeOutStart > fadeInEnd
            ? interpolate(
                t,
                [cap.start, fadeInEnd, fadeOutStart, cap.end],
                [0, 1, 1, 0],
                { extrapolateLeft: "clamp", extrapolateRight: "clamp" }
              )
            : interpolate(
                t,
                [cap.start, cap.start + dur / 2, cap.end],
                [0, 1, 0],
                { extrapolateLeft: "clamp", extrapolateRight: "clamp" }
              );
        // 표시 구간 밖이면 아예 렌더 안 함 (visibility:hidden hard-kill 동등).
        if (opacity <= 0) return null;
        return (
          <div key={i} style={{ ...groupStyle, opacity }}>
            {renderContent(cap)}
          </div>
        );
      })}
    </div>
  );
};
