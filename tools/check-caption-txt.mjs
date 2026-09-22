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
 *
 * `scanOutput()` 은 upload-output.mjs 도 쓴다 (mp4 + 캡션 둘 다 있는 폴더만 업로드 대상).
 */
import { readdirSync, existsSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parseOutputChannelDir, CAPTION_TXT_SUFFIX } from "@wayclip/shared/output-paths.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

/**
 * output/ 을 훑어 결재본 폴더를 분류한다.
 * @param {string|null} filter 채널 slug (언어 폴더 `<slug>-xx` 포함)
 * @returns {{ ok: Entry[], missing: Entry[] }}  Entry = { chDir, channel, lang, number, dir, mp4, txt }
 */
export function scanOutput(filter = null, outputDir = path.join(ROOT, "output")) {
  const ok = [], missing = [];
  if (!existsSync(outputDir)) return { ok, missing };
  for (const chDir of readdirSync(outputDir).sort()) {
    const chPath = path.join(outputDir, chDir);
    if (!statSync(chPath).isDirectory()) continue;
    if (filter && chDir !== filter && !chDir.startsWith(filter + "-")) continue;
    const { channel, lang } = parseOutputChannelDir(chDir);
    for (const num of readdirSync(chPath).sort()) {
      const dir = path.join(chPath, num);
      if (!statSync(dir).isDirectory()) continue;
      const mp4 = path.join(dir, `${num}.mp4`);
      if (!existsSync(mp4)) continue; // 결재본이 없으면 대상 아님
      const txt = path.join(dir, `${num}${CAPTION_TXT_SUFFIX}`);
      const entry = { chDir, channel, lang, number: num, dir, mp4, txt: existsSync(txt) ? txt : null };
      (entry.txt ? ok : missing).push(entry);
    }
  }
  return { ok, missing };
}

function main() {
  const filter = process.argv[2] ?? null;
  if (!existsSync(path.join(ROOT, "output"))) { console.log("output/ 없음"); return; }
  const { ok, missing } = scanOutput(filter);
  console.log(`결재본 ${ok.length + missing.length}편 검사 — 캡션 있음 ${ok.length} / 누락 ${missing.length}`);
  if (missing.length) {
    console.log("\n캡션 누락:");
    for (const m of missing) console.log(`  ✗ output/${m.chDir}/${m.number}/${m.number}${CAPTION_TXT_SUFFIX}`);
    console.log("\n포맷·채널 규칙: /caption 스킬 (.claude/skills/caption/SKILL.md)");
    process.exit(1);
  }
  console.log("✓ 누락 없음");
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();
