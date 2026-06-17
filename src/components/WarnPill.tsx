import React from "react";
import { interpolate, useCurrentFrame, useVideoConfig } from "remotion";
import { FONT } from "../fonts";

// 빨간 경고 박스(space_lab) — 영상 처음부터 fade-in → [솔리드 → 3번 깜빡 → 솔리드 → …] 끝까지 반복.
// 원본 GSAP 타임라인을 키프레임 배열로 재구성 후 프레임에서 보간 (결정적).
const APPEAR_FADE = 0.6;
const APPEAR_HOLD = 0.8;
const BLINK_OFF = 0.2;
const BLINK_ON = 0.2;
const BLINK_DIM = 0.2;
const BLINKS_PER_BURST = 3;
const BURST_LEN = (BLINK_OFF + BLINK_ON) * BLINKS_PER_BURST; // 0.6 (원본 변수명 그대로 — 루프 가드용)
const BURST_GAP = 1.36;

function buildKeyframes(dur: number): { times: number[]; values: number[] } {
  const times: number[] = [];
  const values: number[] = [];
  const push = (time: number, value: number) => {
    if (times.length && time <= times[times.length - 1]) {
      // 같은 시각 중복이면 마지막 값만 갱신 (interpolate 는 strictly increasing 필요)
      values[values.length - 1] = value;
      return;
    }
    times.push(time);
    values.push(value);
  };

  push(0, 0);
  const warnStart = 0; // 영상 처음부터 등장
  push(warnStart, 0);
  push(warnStart + APPEAR_FADE, 1);

  let cursor = warnStart + APPEAR_FADE + APPEAR_HOLD;
  while (cursor + BURST_LEN < dur) {
    for (let i = 0; i < BLINKS_PER_BURST; i++) {
      push(cursor, 1);
      push(cursor + BLINK_OFF, BLINK_DIM);
      push(cursor + BLINK_OFF + BLINK_ON, 1);
      cursor += BLINK_OFF + BLINK_ON;
    }
    cursor += BURST_GAP;
  }
  push(dur, values[values.length - 1]);
  return { times, values };
}

// warnText 안의 "1000個" 만 한 단계 굵게 (나머지 400 → 강조 500).
const WARN_EMPH = "1000個";
function renderWarnText(text: string): React.ReactNode {
  const idx = text.indexOf(WARN_EMPH);
  if (idx < 0) return text;
  return [
    text.slice(0, idx),
    <span key="emph" style={{ fontWeight: 500 }}>
      {WARN_EMPH}
    </span>,
    text.slice(idx + WARN_EMPH.length),
  ];
}

export const WarnPill: React.FC<{ warnText: string; topPx: number }> = ({
  warnText,
  topPx,
}) => {
  const frame = useCurrentFrame();
  const { fps, durationInFrames } = useVideoConfig();
  const t = frame / fps;
  const dur = durationInFrames / fps;

  const { times, values } = React.useMemo(() => buildKeyframes(dur), [dur]);
  const opacity = interpolate(t, times, values, {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  if (opacity <= 0) return null;

  return (
    <div
      style={{
        position: "absolute",
        top: topPx,
        left: 0,
        right: 0,
        height: 70,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 5, // 2줄 오버플로가 아래 검정 하단 박스에 가려 잘리지 않도록
      }}
    >
      <span
        style={{
          display: "inline-block",
          background: "transparent", // 빨간 배경 일시 off (사용자 요청 — 다시 켜라 할 때까지). 복원: "#FC0200"
          color: "#FFE401", // 채널 노랑 토큰
          fontFamily: [`"${FONT.jp}"`, "sans-serif"].join(", "),
          fontSize: 38,
          fontWeight: 400,
          letterSpacing: "-0.01em",
          fontFeatureSettings: '"palt" 1',
          whiteSpace: "pre-line", // warnText 의 \n 으로 줄바꿈
          textAlign: "center",
          lineHeight: 1.1,
          padding: "0 14px",
          opacity,
        }}
      >
        {renderWarnText(warnText)}
      </span>
    </div>
  );
};
