// 밴드 geometry 계산 — tools(new-video) 와 src/format/geometry.ts 가 같은 함수를 쓴다.
export const CANVAS_W = 1080;
export const CANVAS_H = 1920;
export const FPS = 30;

/** contain-auto (space_lab 식): 영상 비율로 밴드를 계산한다. 위·아래 검정은 대칭. */
export const CONTAIN_AUTO_DEFAULTS = { warnH: 70, videoBottomGap: 20, maxVideoH: 1400 };

export function computeContainAutoLayout(srcW, srcH, opts = {}) {
  const { warnH, videoBottomGap, maxVideoH } = { ...CONTAIN_AUTO_DEFAULTS, ...opts };
  let videoH = Math.round((srcH * CANVAS_W) / srcW);
  if (videoH > maxVideoH) videoH = maxVideoH;
  const totalBlack = CANVAS_H - videoH - warnH - videoBottomGap;
  const topH = Math.round(totalBlack / 2);
  const bottomH = totalBlack - topH;
  const warnTop = topH + videoH + videoBottomGap;
  const bottomTop = warnTop + warnH;
  return { topH, videoH, warnTop, bottomTop, bottomH };
}

/** 예전 이름 (tools/channels.mjs 가 re-export). */
export const computeSpaceLabLayout = (w, h) => computeContainAutoLayout(w, h);
