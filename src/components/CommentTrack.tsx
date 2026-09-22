import React from "react";
import {
  useCurrentFrame,
  useVideoConfig,
  Img,
  staticFile,
  interpolate,
  Easing,
} from "remotion";
import type { Comment } from "../props";

// 굿바이브 하단 댓글 오버레이. 두 가지 모드가 한 배열(props.comments)에 섞일 수 있다.
//
// ① 기본(슬롯) 모드 — c.stack 없음. 항상 1개씩 연속 노출(슬롯 = 영상길이÷개수).
//    페이드 없이 하드 컷(슬롯 경계에서 즉시 교체) — prep-comments.mjs 가 슬롯을 겹치지 않게 씀.
//    폭: 댓글마다 내용 길이대로 다름(가로 긴 댓글은 넓게, 짧은 댓글은 작게) — 모든 댓글을
//    같은 배율 scale 로 표시해 글자 크기는 일정하게 유지. c.w(원본 px) × scale, maxWidth 로 캡.
//    maxWidth 는 업로드 시 양끝 잘림 방지용 안전 상한 — 넘는 댓글은 글자가 작아지더라도 캡.
//
// ② 스택 모드 — c.stack === true. 교체되지 않고 화면 아래에서부터 쌓인다. c.start 에 등장해
//    영상 끝까지 남고, 뒤이어 오는 스택 댓글이 아래에 붙으면서 먼저 온 것들을 위로 밀어올린다.
//    (마지막 장면에서 사연이 하나씩 모여 쌓이는 연출 — 111 부터.)
//    · 좌우 지그재그: align 이 없으면 스택 순서대로 left/right 를 번갈아 붙인다. 좌우로 어긋나
//      있으니 세로로 겹쳐 붙여도(overlap) 서로 글자를 가리지 않고 콜라주처럼 모인다.
//    · overlap: 새 댓글이 위 댓글을 밀어올리는 양의 비율(1 = 안 겹침, 0.7 = 30% 겹침).
//    · 등장은 riseSeconds 동안 아래에서 밀려 올라오며 페이드 — 위 댓글들도 같이 부드럽게 밀린다.
//    스택 상한(stackZoneStyle.top)을 넘긴 만큼은 위쪽부터 잘려나간다(overflow hidden).
export const CommentTrack: React.FC<{
  comments: Comment[];
  zoneStyle: React.CSSProperties;
  scale: number; // 모든 댓글 공통 표시 배율(원본 px 기준)
  maxWidth: number; // 표시 폭 상한(px)
  maxHeight: number; // 밴드 내 최대 높이(px). 넘으면 contain.
  // ── 스택 모드 (c.stack === true 인 댓글이 있을 때만 쓰임) ──
  stackZoneStyle?: React.CSSProperties;
  stackScale?: number;
  stackGap?: number;
  stackRiseSeconds?: number;
  stackOverlap?: number;
  stackSideMargin?: number;
  // ── 위쪽 스택 (anchor:"top") ──
  stackTopY?: number;
  stackTopGap?: number;
  stackTopOverlap?: number;
  stackTopHeight?: number;
}> = ({
  comments,
  zoneStyle,
  scale,
  maxWidth,
  maxHeight,
  stackZoneStyle,
  stackScale = 1,
  stackGap = 10,
  stackRiseSeconds = 0.22,
  stackOverlap = 0.7,
  stackSideMargin = 30,
  stackTopY = 450,
  stackTopGap = 10,
  stackTopOverlap = 1,
  stackTopHeight = 550,
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const t = frame / fps; // 초 — comment start/end 와 같은 단위

  const slotted = comments.filter((c) => !c.stack && !c.pin);
  // ③ 핀 모드 — x/y 에 그대로 박히는 콜라주 조각. start 에 툭 꽂혀 끝까지 남는다.
  // z 오름차순 → 배경 더미(0) 위에 실제 사연(1), 그 위에 메인(2). 같은 z 안에서는 start 순.
  const pinned = comments
    .filter((c) => c.pin && t >= c.start)
    .sort((a, b) => (a.z ?? 0) - (b.z ?? 0) || a.start - b.start);
  // 등장 순서대로 쌓이도록 start 오름차순 — 마지막에 온 것이 끝(아래 스택은 바닥, 위 스택은 꼭대기).
  // 좌우 지그재그는 **전체 스택 순서**로 정해야 재생 중 좌우가 바뀌지 않는다.
  const stackOf = (anchor: "top" | "bottom") =>
    comments
      .filter((c) => c.stack && (c.anchor ?? "bottom") === anchor)
      .sort((a, b) => a.start - b.start)
      .map((c, i) => ({
        c,
        // 위/아래 모두 좌우 지그재그가 기본 — 좌우로 어긋나야 세로로 겹쳐 붙여도
        // 서로 글자를 가리지 않고 촘촘히 채워진다. 위 스택은 아래와 엇갈리게 시작한다.
        align: c.align ?? (anchor === "top" ? (i % 2 === 0 ? "right" : "left") : i % 2 === 0 ? "left" : "right"),
      }))
      .filter((s) => t >= s.c.start);

  // 공통 — 표시 크기 + 등장 진행도.
  const measure = ({ c, align }: { c: Comment; align: string }) => {
    const width = c.w ? Math.min(c.w * stackScale, maxWidth) : undefined;
    const height = c.w && c.h && width ? (c.h * width) / c.w : undefined;
    const p =
      stackRiseSeconds > 0
        ? interpolate(t - c.start, [0, stackRiseSeconds], [0, 1], {
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
            easing: Easing.out(Easing.cubic),
          })
        : 1;
    return { c, align, width, height, p };
  };
  // 최신(배열 끝)이 붙는 쪽 끝(offset 0)에 오고, 먼저 온 것들이 그만큼 밀려난다.
  // 위/아래가 완전히 같은 계산 — 방향만 top/bottom 으로 뒤집는다.
  const offsetsOf = (arr: ReturnType<typeof measure>[], ov: number, gap: number) => {
    const o = new Array(arr.length).fill(0);
    for (let i = arr.length - 2; i >= 0; i--) {
      const nx = arr[i + 1];
      o[i] = o[i + 1] + ((nx.height ?? 0) * ov + gap) * nx.p;
    }
    return o;
  };

  const laid = stackOf("bottom").map(measure);
  const offsets = offsetsOf(laid, stackOverlap, stackGap);
  const laidTop = stackOf("top").map(measure);
  const offsetsTop = offsetsOf(laidTop, stackTopOverlap, stackTopGap);

  return (
    <>
      <div style={zoneStyle}>
        {slotted.map((c, i) => {
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
                from={-4}
              />
            </div>
          );
        })}
      </div>

      {/* ③ 핀 콜라주 — **스택 아래 레이어.** 화면을 메우는 배경 더미라, 사용자가 직접 고른
          위/아래 스택 사연이 그 위에 얹혀 끝까지 읽힌다. */}
      {pinned.length > 0 && (
        <div
          style={{
            position: "absolute",
            inset: 0,
            overflow: "hidden",
            pointerEvents: "none",
          }}
        >
          {pinned.map((c, i) => {
            const s = c.scale ?? stackScale;
            const width = c.w ? c.w * s : undefined;
            const height = c.w && c.h && width ? (c.h * width) / c.w : undefined;
            // 툭 꽂히는 짧은 팝인 — 배경 더미는 초당 20장씩 들어오므로 아주 짧게.
            // 메인(z≥2)만 조금 길게 + 위에서 살짝 커진 채로 내려앉아 "딱" 꽂히는 맛을 준다.
            const isMain = (c.z ?? 0) >= 2;
            const p = interpolate(t - c.start, [0, isMain ? 0.2 : 0.09], [0, 1], {
              extrapolateLeft: "clamp",
              extrapolateRight: "clamp",
              easing: Easing.out(Easing.cubic),
            });
            const popScale = isMain ? 1.12 - 0.12 * p : 0.92 + 0.08 * p;
            return (
              <div
                key={`pin-${c.src}-${i}`}
                style={{
                  position: "absolute",
                  left: (c.x ?? 540) - (width ?? 0) / 2,
                  top: (c.y ?? 960) - (height ?? 0) / 2,
                  width,
                  height,
                  opacity: p,
                  transform: `rotate(${c.rot ?? 0}deg) scale(${popScale})`,
                  transformOrigin: "center center",
                }}
              >
                <Img
                  src={staticFile(c.src)}
                  style={{ width: "100%", height: "100%", display: "block" }}
                  from={-4}
                />
              </div>
            );
          })}
        </div>
      )}

      {/* ②-a 아래 스택 — 화면 아래에서 위로 쌓인다(지그재그). */}
      {stackZoneStyle && laid.length > 0 && (
        <div
          style={{
            ...stackZoneStyle,
            overflow: "hidden",
            // 상한을 넘겨 잘릴 때 단면이 딱 끊기지 않도록 맨 위 40px 만 부드럽게.
            WebkitMaskImage:
              "linear-gradient(to bottom, rgba(0,0,0,0) 0px, rgba(0,0,0,1) 40px)",
            maskImage:
              "linear-gradient(to bottom, rgba(0,0,0,0) 0px, rgba(0,0,0,1) 40px)",
          }}
        >
          {laid.map(({ c, align, width, height, p }, i) => (
            <div
              key={`${c.src}-${i}`}
              style={{
                position: "absolute",
                bottom: offsets[i],
                ...(align === "center"
                  ? { left: 0, right: 0, display: "flex", justifyContent: "center" }
                  : align === "right"
                    ? { right: stackSideMargin + (c.dx ?? 0) }
                    : { left: stackSideMargin + (c.dx ?? 0) }),
                opacity: p,
                // 아래에서 밀려 올라오며 등장.
                transform: `translateY(${(1 - p) * Math.min(48, (height ?? 60) * 0.5)}px)`,
              }}
            >
              <Img
                src={staticFile(c.src)}
                style={{
                  width,
                  height: height ?? "auto",
                  maxWidth,
                  objectFit: "contain",
                  display: "block",
                }}
                from={-4}
              />
            </div>
          ))}
        </div>
      )}

      {/* ②-b 위 스택 — 거울상. 화면 위에서 아래로 쌓이고 새 것이 꼭대기에 붙는다. */}
      {laidTop.length > 0 && (
        <div
          style={{
            position: "absolute",
            top: stackTopY,
            left: 0,
            right: 0,
            height: stackTopHeight,
            overflow: "hidden",
            pointerEvents: "none",
            // 아래로 넘칠 때 단면이 딱 끊기지 않도록 맨 아래 40px 만 부드럽게.
            WebkitMaskImage:
              "linear-gradient(to top, rgba(0,0,0,0) 0px, rgba(0,0,0,1) 40px)",
            maskImage:
              "linear-gradient(to top, rgba(0,0,0,0) 0px, rgba(0,0,0,1) 40px)",
          }}
        >
          {laidTop.map(({ c, align, width, height, p }, i) => (
            <div
              key={`top-${c.src}-${i}`}
              style={{
                position: "absolute",
                top: offsetsTop[i],
                ...(align === "center"
                  ? { left: 0, right: 0, display: "flex", justifyContent: "center" }
                  : align === "right"
                    ? { right: stackSideMargin + (c.dx ?? 0) }
                    : { left: stackSideMargin + (c.dx ?? 0) }),
                opacity: p,
                // 위에서 밀려 내려오며 등장 (아래 스택의 거울).
                transform: `translateY(${-(1 - p) * Math.min(48, (height ?? 60) * 0.5)}px)`,
              }}
            >
              <Img
                src={staticFile(c.src)}
                style={{
                  width,
                  height: height ?? "auto",
                  maxWidth,
                  objectFit: "contain",
                  display: "block",
                }}
                from={-4}
              />
            </div>
          ))}
        </div>
      )}
    </>
  );
};
