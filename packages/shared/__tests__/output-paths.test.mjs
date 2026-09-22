import test from "node:test";
import assert from "node:assert/strict";
import { outputChannelDir, parseOutputChannelDir, outputVideoKey, outputCaptionKey, propsFileName } from "../output-paths.mjs";

test("output paths", () => {
  assert.equal(outputChannelDir("goodmovies", "ja"), "goodmovies");
  assert.equal(outputChannelDir("goodmovies", "tw"), "goodmovies-tw");
  assert.deepEqual(parseOutputChannelDir("space_lab-th"), { channel: "space_lab", lang: "th" });
  assert.deepEqual(parseOutputChannelDir("space_lab"), { channel: "space_lab", lang: "ja" });
  assert.equal(outputVideoKey("goodmovies", "106", "ja"), "output/goodmovies/106/106.mp4");
  assert.equal(outputCaptionKey("goodmovies", "102", "tw"), "output/goodmovies-tw/102/102캡션.txt");
  assert.equal(propsFileName("vi"), "props.vi.json");
  assert.equal(propsFileName("ja"), "props.json");
});
