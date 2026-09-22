import test from "node:test";
import assert from "node:assert/strict";
import { scheduleId, isDue, mergeStatusUpdates, diffRunUpdates, stringifySchedule } from "../schedule.mjs";

test("id: 기존 항목 형식 불변, lang 은 ja 가 아닐 때만 접미사", () => {
  assert.equal(scheduleId({ project: "remotion", channel: "goodmovies", number: "106" }), "remotion-goodmovies-106");
  assert.equal(scheduleId({ channel: "goodmovies", number: "106", lang: "ja" }), "remotion-goodmovies-106");
  assert.equal(scheduleId({ channel: "goodmovies", number: "106", lang: "tw" }), "remotion-goodmovies-106-tw");
  assert.equal(scheduleId({ id: "custom", channel: "x", number: "1" }), "custom");
});

test("isDue", () => {
  const now = Date.parse("2026-09-22T12:00:00+09:00");
  assert.equal(isDue({ publishAt: "2026-09-22T11:59:00+09:00" }, now), true);
  assert.equal(isDue({ publishAt: "2026-09-22T12:01:00+09:00" }, now), false);
  assert.equal(isDue({}, now), true);
});

test("merge: 원격의 새 항목/편집은 보존, 이번 런의 상태만 덮어씀", () => {
  const head = [
    { project: "remotion", channel: "goodmovies", number: "106", publishAt: "t", status: "pending" },
    { project: "remotion", channel: "space_lab", number: "062", publishAt: "t", status: "pending" },
  ];
  const local = [
    { ...head[0], status: "published", mediaId: "m1", publishedAt: "p" },
    head[1],
  ];
  const remote = [
    { ...head[0], publishAt: "t2", note: "웹에서 시각 변경" },     // 동시 편집
    { ...head[1], status: "pending" },
    { project: "remotion", channel: "goodmovies", number: "108", status: "pending" }, // 웹에서 추가
  ];
  const updates = diffRunUpdates(head, local);
  assert.deepEqual([...updates.keys()], ["remotion-goodmovies-106"]);
  const merged = mergeStatusUpdates(remote, updates);
  assert.equal(merged.length, 3);
  assert.equal(merged[0].status, "published");
  assert.equal(merged[0].mediaId, "m1");
  assert.equal(merged[0].publishAt, "t2");
  assert.equal(merged[0].note, "웹에서 시각 변경");
  assert.equal(merged[2].number, "108");
});

test("stringify 는 2칸 들여쓰기 + 끝 개행", () => {
  assert.equal(stringifySchedule([{ a: 1 }]), '[\n  {\n    "a": 1\n  }\n]\n');
});
