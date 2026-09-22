import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { parseCaptionTxt, formatCaptionTxt, captionTxtProblems } from "../caption-txt.mjs";

const fx = (n) => readFileSync(new URL(`../__fixtures__/${n}`, import.meta.url), "utf8");

test("ja 굿무비 캡션: 헤더/캡션/고정댓글 분리", () => {
  const p = parseCaptionTxt(fx("goodmovies-106-ja.txt"));
  assert.equal(p.alias, "굿무비");
  assert.equal(p.number, "106");
  assert.match(p.subject, /ウォールフラワー/);
  assert.match(p.caption, /^「/);
  assert.ok(!p.caption.includes("固定コメント"));
  assert.match(p.pinnedComment, /@goodmovies_reko/);
  assert.deepEqual(captionTxtProblems(p), []);
});

test("tw 판도 같은 마커/구분선으로 파싱", () => {
  const p = parseCaptionTxt(fx("goodmovies-102-tw.txt"));
  assert.equal(p.number, "102");
  assert.ok(p.caption.length > 50);
  assert.match(p.pinnedComment, /@goodmovies_reko/);
});

test("굿바이브: 고정댓글은 채널 고정 문구", () => {
  const p = parseCaptionTxt(fx("goodvibesongs-ja.txt"));
  assert.equal(p.alias, "굿바이브");
  assert.match(p.pinnedComment, /配送/);
});

test("format → parse 왕복", () => {
  const src = { alias: "스페이스랩", number: "070", subject: "테스트", caption: "본문 1\n\n본문 2", pinnedComment: "고정댓글" };
  const p = parseCaptionTxt(formatCaptionTxt(src));
  assert.equal(p.alias, src.alias);
  assert.equal(p.number, src.number);
  assert.equal(p.subject, src.subject);
  assert.equal(p.caption, src.caption);
  assert.equal(p.pinnedComment, src.pinnedComment);
});

test("마커 없는 옛 파일: 헤더만 떼고 나머지가 캡션, 고정댓글 없음", () => {
  const p = parseCaptionTxt("[굿무비] 001 | x\n본문\n");
  assert.equal(p.caption, "본문");
  assert.equal(p.pinnedComment, "");
  assert.ok(captionTxtProblems(p).includes("고정댓글 없음"));
});
