import React from "react";
import { OffthreadVideo, staticFile } from "remotion";

// 영상 영역 — source.mp4 심볼링크(렌더/스튜디오 시 --public-dir 가 해당 영상 디렉토리를 가리킴).
// 원본은 muted <video>(track0) + 별도 <audio>(track1) 였으나, Remotion 의 OffthreadVideo 는
// 오디오를 함께 렌더하므로 단일 태그로 A/V 를 모두 처리한다 (이중 디코드 방지).
export const BackgroundVideo: React.FC<{
  src: string; // public/ 기준 경로 (staticFile 로 해석)
  top: number;
  height: number;
  background: string;
  objectFit: "cover" | "contain";
  volume?: number;
  children?: React.ReactNode; // vignette 등 오버레이
}> = ({ src, top, height, background, objectFit, volume = 1, children }) => {
  return (
    <div
      style={{
        position: "absolute",
        top,
        left: 0,
        right: 0,
        height,
        background,
        overflow: "hidden",
      }}
    >
      <OffthreadVideo
        src={staticFile(src)}
        volume={volume}
        style={{
          width: "100%",
          height: "100%",
          objectFit,
          display: "block",
        }}
      />
      {children}
    </div>
  );
};
