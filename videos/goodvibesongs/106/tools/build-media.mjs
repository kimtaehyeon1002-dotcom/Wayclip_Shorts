// 106 미디어 빌드: 박힌 자막을 줄별 타이트 박스로만 블러(그 줄이 떠 있는 동안만) →
//                  상150/하126 크롭 → 684x1040 축소 → 1080x1040 레터박스
import { spawnSync } from "node:child_process";

const SRC = "media/toteto-takarabe.mp4";
const OUT = "toteto-fit-raw.mp4";

// x0..x1 = analyze-tight.mjs 실측 글자 bbox, ±18 여유. y 밴드는 전 줄 공통(글자 y938..1004 +여유).
const Y = 928, H = 88;
const BOXES = [
  { x: 126, w: 832, t0: 0.0,   t1: 4.2  },
  { x: 194, w: 696, t0: 4.6,   t1: 7.96 },
  { x: 284, w: 518, t0: 9.2,   t1: 11.82 },
  { x: 352, w: 384, t0: 14.25, t1: 16.23 },
  { x: 332, w: 422, t0: 16.57, t1: 18.5 },
  { x: 180, w: 726, t0: 18.84, t1: 23.46 },
  { x: 196, w: 694, t0: 23.74, t1: 28.1 },
  { x: 234, w: 620, t0: 28.64, t1: 32.9 },
  { x: 188, w: 708, t0: 33.37, t1: 37.66 },
  { x: 238, w: 612, t0: 38.14, t1: 40.63 },
  { x: 228, w: 628, t0: 40.7,  t1: 43.2 },
];

const parts = [];
let cur = "0:v";
BOXES.forEach((b, i) => {
  const base = `base${i}`, cut = `cut${i}`, bl = `bl${i}`, next = i === BOXES.length - 1 ? "ov" : `n${i}`;
  parts.push(`[${cur}]split[${base}][${cut}]`);
  parts.push(`[${cut}]crop=${b.w}:${H}:${b.x}:${Y},gblur=sigma=26:steps=3[${bl}]`);
  parts.push(`[${base}][${bl}]overlay=${b.x}:${Y}:enable='between(t,${b.t0},${b.t1})'[${next}]`);
  cur = next;
});
parts.push(`[ov]crop=1080:1644:0:150,scale=684:1040:flags=lanczos,pad=1080:1040:198:0:black[v]`);

const fc = parts.join(";");
console.log(`박스 ${BOXES.length}개, y${Y}..${Y + H}`);
const r = spawnSync("ffmpeg", ["-v", "error", "-stats", "-i", SRC, "-filter_complex", fc,
  "-map", "[v]", "-map", "0:a", "-c:v", "libx264", "-crf", "16", "-preset", "medium",
  "-pix_fmt", "yuv420p", "-g", "30", "-c:a", "copy", "-y", OUT], { stdio: ["ignore", "inherit", "inherit"] });
process.exit(r.status ?? 1);
