import React from "react";
import { useCurrentFrame, useVideoConfig } from "remotion";
import type { Caption } from "../props";

// 자막은 하드컷 — 페이드/ease 없음 (2026-07-29 폐지, 사용자 요청).
// 각 caption 은 [start, end) 구간에서만 그려지고 그 밖에선 아예 렌더되지 않는다.
export const CaptionTrack: React.FC<{
  captions: Caption[];
  zoneStyle: React.CSSProperties;
  groupStyle: React.CSSProperties;
  // 채널마다 원어/번역 순서·스타일이 달라서 내용 렌더는 위임.
  renderContent: (cap: Caption) => React.ReactNode;
  // (deprecated) 페이드 길이(초). ease 폐지로 무시됨 — 호출부 호환용으로만 남김.
  fadeSeconds?: number;
}> = ({ captions, zoneStyle, groupStyle, renderContent }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const t = frame / fps; // 초 — caption start/end 와 같은 단위

  return (
    <div style={zoneStyle}>
      {captions.map((cap, i) => {
        if (t < cap.start || t >= cap.end) return null;
        return (
          <div key={i} style={groupStyle}>
            {renderContent(cap)}
          </div>
        );
      })}
    </div>
  );
};
