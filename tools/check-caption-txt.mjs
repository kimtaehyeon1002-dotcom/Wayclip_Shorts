#!/usr/bin/env node
/**
 * 결재본은 나왔는데 `<번호>캡션.txt` 가 빠진 폴더를 찾는다.
 *
 * 캡션 txt 는 결재본이 렌더되면 **항상 같이** 만들어야 하는데(사용자가 따로 요청하지 않아도),
 * 여러 편을 연속으로 뽑다 보면 조용히 빠진다. 렌더 뒤 이걸 돌려 **목록이 비어야 완료**다.
 *
 * 사용법:
 *   node tools/check-caption-txt.mjs            # output/ 전체
 *   node tools/check-caption-txt.mjs goodmovies # 그 채널만 (언어 폴더 포함)
 */
import { readdirSync, existsSync, statSync } from "node:fs";
import path from "node:path";

const ROOT = "output";
const filter = process.argv[2] ?? null;

if (!existsSync(ROOT)) { console.log("output/ 없음"); process.exit(0); }

const missing = [], ok = [];
for (const chDir of readdirSync(ROOT)) {
  const chPath = path.join(ROOT, chDir);
  if (!statSync(chPath).isDirectory()) continue;
  if (filter && chDir !== filter && !chDir.startsWith(filter + "-")) continue;
  for (const num of readdirSync(chPath)) {
    const dir = path.join(chPath, num);
    if (!statSync(dir).isDirectory()) continue;
    const mp4 = path.join(dir, `${num}.mp4`);
    if (!existsSync(mp4)) continue;                    // 결재본이 없으면 대상 아님
    const txt = path.join(dir, `${num}캡션.txt`);
    (existsSync(txt) ? ok : missing).push(`${chDir}/${num}`);
  }
}

console.log(`결재본 ${ok.length + missing.length}편 검사 — 캡션 있음 ${ok.length} / 누락 ${missing.length}`);
if (missing.length) {
  console.log("\n캡션 누락:");
  for (const m of missing) console.log(`  ✗ output/${m}/${m.split("/")[1]}캡션.txt`);
  console.log("\n포맷·채널 규칙: tools/jp-caption-writer.md");
  process.exit(1);
}
console.log("✓ 누락 없음");
