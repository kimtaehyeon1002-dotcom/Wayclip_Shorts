// 포맷 레지스트리(formats/*.json → tools/channels.mjs) 가 리팩터 전 손수 쓴 표와 **정확히 같은 값**을 내는지.
// channels.snapshot.json / defaultProps.snapshot.json 은 리팩터 직전 옛 channels.mjs / src/props.ts 에서 캡처했다.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import * as ch from "../channels.mjs";

const snap = JSON.parse(readFileSync(new URL("./channels.snapshot.json", import.meta.url), "utf8"));
const dp = JSON.parse(readFileSync(new URL("./defaultProps.snapshot.json", import.meta.url), "utf8"));

for (const key of ["CHANNELS", "ORIG_LANGS", "TRANS_LANGS", "MULTILANG_CHANNELS", "MULTILANG_SET", "channelFixedStrings",
  "FPS", "CANVAS_W", "CANVAS_H", "GOODVIBE_WATERMARK", "channelDefaults", "compositionId", "hasCaptions",
  "hasVideoNumber", "numberFrom1000", "captionLayouts"]) {
  test(`channels.mjs ${key} == 스냅샷`, () => {
    let got = JSON.parse(JSON.stringify(ch[key]));
    let want = snap[key];
    if (key === "MULTILANG_CHANNELS") { got = [...got].sort(); want = [...want].sort(); } // 집합 의미
    if (key === "channelFixedStrings") { // 옛 표는 고정 문구 없는 채널 키 자체가 없었다 ({} 와 동치)
      got = Object.fromEntries(Object.entries(got).filter(([, v]) => Object.keys(v).length));
      want = Object.fromEntries(Object.entries(want).filter(([, v]) => Object.keys(v).length));
    }
    assert.deepEqual(got, want);
  });
}

test("computeSpaceLabLayout == 스냅샷", () => {
  for (const [k, v] of Object.entries(snap.computeSpaceLabLayout_samples)) {
    const [w, h] = k.split("x").map(Number);
    assert.deepEqual(ch.computeSpaceLabLayout(w, h), v);
  }
});

test("formats[].defaultProps == 옛 zod schema.parse({})", () => {
  for (const [slug, f] of Object.entries(ch.FORMATS)) assert.deepEqual(f.defaultProps, dp[slug], slug);
});

test("STRUCTURAL_KEYS 는 옛 derive-lang 목록 그대로", () => {
  assert.deepEqual(ch.STRUCTURAL_KEYS, ["durationInFrames", "videoSrc", "layout", "videoNumber", "captionPaddingTop",
    "topCaptionMaxLines", "originalLanguage", "mediaKind", "captionYOffset", "watermark", "warnBlink", "warnOpacity",
    "videoFit", "videoAspectRatio", "videoObjectPosition", "bandHeight", "endFadeSeconds", "comments", "commentStack"]);
});
