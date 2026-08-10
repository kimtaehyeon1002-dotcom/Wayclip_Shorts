import React from "react";
import { useCurrentFrame, useVideoConfig, Img, staticFile } from "remotion";
import type { Comment } from "../props";

// 굿바이브 하단 댓글 오버레이. 항상 1개씩 연속 노출(슬롯 = 영상길이÷개수).
// 페이드 없이 하드 컷(슬롯 경계에서 즉시 교체) — prep-comments.mjs 가 슬롯을 겹치지 않게 씀.
//
// 폭: 댓글마다 내용 길이대로 다름(가로 긴 댓글은 넓게, 짧은 댓글은 작게) — 모든 댓글을
// 같은 배율 scale 로 표시해 글자 크기는 일정하게 유지. c.w(원본 px) × scale, maxWidth 로 캡.
// maxWidth 는 업로드 시 양끝 잘림 방지용 안전 상한 — 넘는 댓글은 글자가 작아지더라도 캡.
export const CommentTrack: React.FC<{
  comments: Comment[];
  zoneStyle: React.CSSProperties;
  scale: number; // 모든 댓글 공통 표시 배율(원본 px 기준)
  maxWidth: number; // 표시 폭 상한(px)
  maxHeight: number; // 밴드 내 최대 높이(px). 넘으면 contain.
}> = ({ comments, zoneStyle, scale, maxWidth, maxHeight }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const t = frame / fps; // 초 — comment start/end 와 같은 단위

  return (
    <div style={zoneStyle}>
      {comments.map((c, i) => {
        if (t < c.start || t >= c.end) return null; // 하드 컷(페이드 없음)
        const width = c.w ? Math.min(c.w * scale, maxWidth) : undefined;
        return (
          <div
            key={i}
            style={{
              position: "absolute",
              inset: 0,
              display: "flex",
              justifyContent: "center",
              alignItems: "flex-start",
            }}
          >
            <Img
              src={staticFile(c.src)}
              style={{
                width,
                height: "auto",
                maxWidth,
                maxHeight,
                objectFit: "contain",
              }}
              from={-4} />
          </div>
        );
      })}
    </div>
  );
};
