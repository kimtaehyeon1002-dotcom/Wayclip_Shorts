// 밴드 geometry — symmetric(굿바이브/굿무비/레디액션/디스힙합) 과 contain-auto(스페이스랩).
import { HEIGHT, WIDTH, type FormatProps } from "../props";
import type { Format } from "./types";

export interface Geometry {
  topH: number;      // 상단 밴드 높이 (레터박스 포함)
  videoTop: number;  // 실제 영상 박스 top
  videoH: number;    // 실제 영상 박스 높이
  bottomTop: number;
  bottomH: number;
  warnTop: number;   // contain-auto 만 의미
}

export function bandGeometry(format: Format, props: FormatProps): Geometry {
  const lay = format.layout;
  if (lay.mode === "contain-auto") {
    const L = props.layout ?? (format.defaultProps.layout as FormatProps["layout"]);
    if (!L) throw new Error(`${format.slug}: props.layout 없음 (new-video 가 계산해 넣는다)`);
    return { topH: L.topH, videoTop: L.topH, videoH: L.videoH, bottomTop: L.bottomTop, bottomH: L.bottomH, warnTop: L.warnTop };
  }
  // symmetric: 상·하단 밴드(기본 band). 영상 = 1920 − 2·band, 항상 가운데.
  const band = lay.propsBandOverride ? (props.bandHeight ?? lay.band ?? 480) : (lay.band ?? 480);
  const videoH = HEIGHT - 2 * band;
  // contain 일 때 실제 영상은 밴드 안에서 가운데 정렬되고 위아래 레터박스(검정)가 생긴다.
  // 그 레터박스만큼 상·하단 밴드를 늘려 문구가 "실제 영상 가장자리"에 붙게 한다 (디스힙합).
  const fit = lay.video.propsFitOverride ? (props.videoFit ?? lay.video.fit) : lay.video.fit;
  const letterbox =
    lay.letterboxAware && fit === "contain" && props.videoAspectRatio
      ? Math.max(0, (videoH - Math.min(videoH, WIDTH / props.videoAspectRatio)) / 2)
      : 0;
  const topH = band + letterbox;
  return { topH, videoTop: topH, videoH: videoH - 2 * letterbox, bottomTop: HEIGHT - topH, bottomH: topH, warnTop: 0 };
}
