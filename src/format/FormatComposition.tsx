// 포맷 JSON 으로 구동되는 단일 컴포지션. 렌더 순서는 고정:
//   상단 밴드(TopCaption) → 영상(+vignette) → 워터마크? → 자막? → 경고박스? → 하단 밴드(행들) → 댓글? → 끝 페이드?
// 예전 src/channels/*.tsx 5개가 이 하나로 합쳐졌다 — tools/parity-check.mjs 가 픽셀 동일성을 검증한다.
import React from "react";
import { AbsoluteFill, interpolate, useCurrentFrame, useVideoConfig } from "remotion";
import "../fonts";
import type { FormatProps } from "../props";
import { HEIGHT } from "../props";
import { showOriginal } from "../lang";
import { mediaCredit } from "../i18n";
import { BackgroundVideo } from "../components/BackgroundVideo";
import { CaptionTrack } from "../components/CaptionTrack";
import { CommentTrack } from "../components/CommentTrack";
import { TopCaption } from "../components/TopCaption";
import { WarnPill } from "../components/WarnPill";
import { bandGeometry } from "./geometry";
import { resolveStyle } from "./resolveStyle";
import type { Format } from "./types";

const VIGNETTE = "radial-gradient(ellipse at center, rgba(0,0,0,0) 30%, rgba(0,0,0,0.35) 100%)";

export function makeFormatComponent(format: Format): React.FC<FormatProps> {
  const lay = format.layout;
  const typ = format.typography;
  const feat = format.features;
  const bg = lay.background;

  const Comp: React.FC<FormatProps> = (props) => {
    const { translationLanguage, originalLanguage, captionScale = 1 } = props;
    const ctx = { translationLanguage, originalLanguage };
    const geo = bandGeometry(format, props);

    // 끝 페이드아웃(선택, features.endFade): 마지막 endFadeSeconds 초 동안 화면 검정 + 오디오 0.
    const { fps, durationInFrames } = useVideoConfig();
    const frame = useCurrentFrame();
    const fadeFrames = feat.endFade && props.endFadeSeconds ? Math.round(props.endFadeSeconds * fps) : 0;
    const fadeRange: [number, number] = [durationInFrames - fadeFrames, durationInFrames - 1];
    const fadeOpacity =
      fadeFrames > 0
        ? interpolate(frame, fadeRange, [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" })
        : 0;
    const videoVolume =
      fadeFrames > 0
        ? (f: number) => interpolate(f, fadeRange, [1, 0], { extrapolateLeft: "clamp", extrapolateRight: "clamp" })
        : 1;

    const numText = props.videoNumber
      ? String(props.videoNumber).startsWith("#") ? props.videoNumber : `#${props.videoNumber}`
      : "";
    const objectFit = lay.video.propsFitOverride ? (props.videoFit ?? lay.video.fit) : lay.video.fit;
    const cz = lay.captionZone;
    const wm = feat.watermark && props.watermark ? props.watermark : null;
    const stackCfg = feat.comments ? { ...feat.comments.stackDefaults, ...(props.commentStack ?? {}) } : null;
    const commentTop = feat.comments ? geo.videoTop + geo.videoH + feat.comments.gap : 0;
    const commentZoneH = feat.comments ? HEIGHT - commentTop - feat.comments.bottomMargin : 0;

    return (
      <AbsoluteFill style={{ background: bg, ...resolveStyle(lay.rootStyle, ctx) }}>
        {/* 상단 밴드 + 멘트/헤드라인 */}
        <div
          style={{
            position: "absolute", top: 0, left: 0, right: 0, height: geo.topH,
            display: "flex", flexDirection: "column", alignItems: "center", justifyContent: lay.topBand.justify,
            textAlign: "center", padding: lay.topBand.padding, gap: lay.topBand.gap, background: bg,
          }}
        >
          <TopCaption
            text={props.topCaption}
            lineSizes={props.topCaptionLineSizes}
            maxLines={props.topCaptionMaxLines ?? typ.top.maxLines}
            markup={typ.top.markup}
            strongStyle={resolveStyle(typ.top.strong, ctx)}
            redStyle={resolveStyle(typ.top.red, ctx)}
            lineStyle={resolveStyle(typ.top.style, ctx)}
          />
        </div>

        {/* 영상 영역 (+ vignette) */}
        <BackgroundVideo
          src={props.videoSrc}
          top={geo.videoTop}
          height={geo.videoH}
          background={bg}
          objectFit={objectFit}
          objectPosition={lay.video.propsObjectPosition ? props.videoObjectPosition : undefined}
          volume={videoVolume}
          overscan={lay.video.overscan}
        >
          {lay.video.vignette ? (
            <div style={{ position: "absolute", inset: 0, background: VIGNETTE, pointerEvents: "none" }} />
          ) : null}
        </BackgroundVideo>

        {/* (선택) 채널 핸들 워터마크 — 영상 밴드 위, 자막보다 아래 레이어 */}
        {wm && feat.watermark ? (
          <div
            style={{
              position: "absolute", top: geo.videoTop + geo.videoH * wm.y, left: 0, right: 0,
              transform: "translateY(-50%)", textAlign: "center",
              ...resolveStyle(feat.watermark.style, ctx),
              fontSize: wm.size, fontWeight: wm.weight, opacity: wm.opacity, pointerEvents: "none",
            }}
          >
            {wm.text}
          </div>
        ) : null}

        {/* 자막 (영상 영역 세로 중앙) */}
        {feat.captions && cz && typ.translation ? (
          <CaptionTrack
            captions={props.captions}
            zoneStyle={{ position: "absolute", top: geo.videoTop, left: cz.left, right: cz.right, height: geo.videoH, pointerEvents: "none" }}
            groupStyle={{
              position: "absolute", inset: 0, display: "flex", flexDirection: "column", alignItems: "center",
              justifyContent: "center", gap: cz.gap, textAlign: "center",
              ...(cz.yOffset ? { transform: `translateY(${props.captionYOffset ?? cz.yOffset.default}px)` } : {}),
            }}
            renderContent={(cap) => (
              <>
                {typ.original && showOriginal(originalLanguage) && (!typ.original.hideWhenEmpty || cap.original) ? (
                  <div style={{ width: "100%", ...resolveStyle(typ.original.style, ctx, typ.original.scaleWith ? captionScale : undefined) }}>
                    {cap.original}
                  </div>
                ) : null}
                <div style={{ width: "100%", ...resolveStyle(typ.translation!.style, ctx, typ.translation!.scaleWith ? captionScale : undefined) }}>
                  {cap.translation}
                </div>
              </>
            )}
          />
        ) : null}

        {/* 빨간 깜빡 경고 (영상 아래) */}
        {feat.warnPill ? (
          <WarnPill warnText={props.warnText} topPx={geo.warnTop} blink={props.warnBlink} maxOpacity={props.warnOpacity} lang={translationLanguage} />
        ) : null}

        {/* 하단 밴드 */}
        {lay.bottomBand.rows.length === 0 ? (
          <div style={{ position: "absolute", bottom: 0, left: 0, right: 0, height: geo.bottomH, background: bg }} />
        ) : (
          <div
            style={{
              position: "absolute",
              ...(lay.mode === "contain-auto" ? { top: geo.bottomTop } : { bottom: 0 }),
              left: 0, right: 0, height: geo.bottomH, background: bg,
              display: "flex", flexDirection: "column", alignItems: "center", justifyContent: lay.bottomBand.justify,
              padding: lay.bottomBand.padding, gap: lay.bottomBand.gap,
              ...(lay.bottomBand.lineHeight !== undefined ? { lineHeight: lay.bottomBand.lineHeight } : {}),
            }}
          >
            {lay.bottomBand.rows.map((row, i) => {
              const style = resolveStyle(row.style, ctx);
              switch (row.kind) {
                case "number":
                  return numText ? <div key={i} style={style}>{numText}</div> : null;
                case "credit":
                  return props.mediaTitleJa ? (
                    <div key={i} style={style}>{mediaCredit(props.mediaKind ?? "映画", props.mediaTitleJa, translationLanguage)}</div>
                  ) : null;
                case "artistTrack":
                  return props.artistTrack ? <div key={i} style={style}>{props.artistTrack}</div> : null;
                case "cta":
                  return <div key={i} style={style}>{props.bottomCTA}</div>;
                default:
                  return null;
              }
            })}
          </div>
        )}

        {/* 하단 댓글 오버레이 (features.comments) */}
        {feat.comments && stackCfg ? (
          <CommentTrack
            comments={props.comments}
            scale={feat.comments.scale}
            maxWidth={feat.comments.maxWidth}
            maxHeight={commentZoneH}
            zoneStyle={{ position: "absolute", top: commentTop, left: 0, right: 0, height: commentZoneH, pointerEvents: "none" }}
            stackScale={stackCfg.scale}
            stackGap={stackCfg.gap}
            stackRiseSeconds={stackCfg.riseSeconds}
            stackOverlap={stackCfg.overlap}
            stackSideMargin={stackCfg.sideMargin}
            stackTopY={stackCfg.topY}
            stackTopGap={stackCfg.topGap}
            stackTopOverlap={stackCfg.topOverlap}
            stackTopHeight={stackCfg.topHeight}
            stackZoneStyle={{ position: "absolute", top: stackCfg.top, left: 0, right: 0, bottom: stackCfg.bottom, pointerEvents: "none" }}
          />
        ) : null}

        {/* 끝 페이드아웃 — 화면 전체 검정 오버레이 */}
        {fadeOpacity > 0 ? <AbsoluteFill style={{ background: "#000", opacity: fadeOpacity, pointerEvents: "none" }} /> : null}
      </AbsoluteFill>
    );
  };
  Comp.displayName = `Format(${format.slug})`;
  return Comp;
}
