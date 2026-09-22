#!/usr/bin/env node
// 스케줄 기반 인스타 릴스 게시기 (GitHub Actions cron / 로컬 겸용).
//
//   node publisher/publish-reel.mjs --due [--dry-run]     publishAt 지난 pending 항목 게시
//   node publisher/publish-reel.mjs --id <id> [--dry-run]  특정 항목만 (id = remotion-<channel>-<number>[-lang])
//   node publisher/publish-reel.mjs --list                 현황
//   옵션: --expires <초> presigned URL 유효시간(기본 3600)
//
// 동시성: 예전의 mkdir 락은 없음 — Actions 워크플로의 `concurrency: publish` 가 한 번에 하나만 돌린다.
// 로컬에서 동시에 돌리지 말 것. 중복 게시 2차 방어는 isAlreadyPosted(캡션 앞 30자 대조).
import { readFile, writeFile } from "node:fs/promises";
import { appendFileSync } from "node:fs";
import { SCHEDULE_PATH, assertR2, getChannelCreds } from "./lib/config.mjs";
import { resolveSource, videoUrlFor, entryLabel } from "./lib/source.mjs";
import { createReelContainer, waitForContainer, publishContainer, postComment, isAlreadyPosted } from "./lib/instagram.mjs";
import { sendMail } from "./lib/notify.mjs";
import { scheduleId, isDue, stringifySchedule } from "@wayclip/shared/schedule.mjs";
import { BASE_LANG } from "@wayclip/shared/langs.mjs";

function parseArgs(argv) {
  const a = { mode: "help", expires: 3600, dryRun: false };
  for (let i = 0; i < argv.length; i++) {
    const t = argv[i];
    if (t === "--due") a.mode = "due";
    else if (t === "--list") a.mode = "list";
    else if (t === "--id") { a.mode = "one"; a.id = argv[++i]; }
    else if (t === "--dry-run") a.dryRun = true;
    else if (t === "--expires") a.expires = Number(argv[++i]);
    else if (t === "--help" || t === "-h") a.mode = "help";
  }
  return a;
}

const loadSchedule = async () => JSON.parse(await readFile(SCHEDULE_PATH, "utf8"));
const saveSchedule = (items) => writeFile(SCHEDULE_PATH, stringifySchedule(items));

function printList(items) {
  if (!items.length) return console.log("(스케줄 비어있음)");
  for (const e of items) {
    const st = (e.status || "pending").padEnd(10);
    console.log(`  ${st} ${entryLabel(e).padEnd(24)} @ ${e.publishAt || "(즉시)"}${e.error ? "  ⚠ " + e.error : ""}${e.mediaId ? "  → " + e.mediaId : ""}`);
  }
}

// 한 항목 게시: 소스 확보 → (중복 검사) → 컨테이너 → 폴링 → 게시 → 첫 댓글
async function publishOne(entry, src, { expires }) {
  const label = entryLabel(entry);
  const creds = getChannelCreds(entry.channel, entry.lang || BASE_LANG);

  const firstLine = src.caption.split("\n")[0];
  if (await isAlreadyPosted(creds, firstLine)) {
    throw new Error("이미 게시된 캡션 감지 — 중복 게시 방지로 건너뜀(스케줄 확인 필요)");
  }

  console.log(`  [${label}] 영상 URL 확보 (${src.video.where})…`);
  const videoUrl = await videoUrlFor(src, { expiresIn: expires });

  console.log(`  [${label}] 컨테이너 생성${entry.trial ? " (체험판 릴스)" : ""}…`);
  const containerId = await createReelContainer(creds, {
    videoUrl, caption: src.caption, trial: entry.trial, shareToFeed: entry.shareToFeed,
  });
  console.log(`  [${label}] 인코딩 대기 (container=${containerId})…`);
  await waitForContainer(creds, containerId, { onTick: (s) => process.stdout.write(`    상태=${s}\r`) });
  console.log(`\n  [${label}] 게시 중…`);
  const mediaId = await publishContainer(creds, containerId);
  console.log(`  [${label}] ✅ 게시 완료 media=${mediaId}`);

  let commentId;
  if (src.firstComment) {
    try {
      commentId = await postComment(creds, mediaId, src.firstComment);
      console.log(`  [${label}] 💬 첫 댓글 완료 comment=${commentId}`);
    } catch (e) {
      console.warn(`  [${label}] ⚠ 첫 댓글 실패(게시는 성공): ${e.message}`);
    }
  }
  return { mediaId, commentId };
}

async function runBatch(items, selector, opts) {
  let r2Enabled = true;
  try { assertR2(); } catch (e) {
    if (!opts.dryRun) throw e;
    r2Enabled = false; // dry-run 은 R2 없이도 로컬 파일만으로 점검
    console.log(`(dry-run: ${e.message} — 로컬 output/ 만 점검)`);
  }
  const results = [];
  let done = 0, failed = 0, skipped = 0;
  for (const entry of items) {
    if ((entry.status || "pending") !== "pending") continue;
    if (!selector(entry)) continue;
    const label = entryLabel(entry);

    // 게시 전 점검 — 자격증명 / 캡션 / 영상 셋 다 있어야 한다. 하나라도 없으면 pending 유지(보류).
    let reason = null;
    try { getChannelCreds(entry.channel, entry.lang || BASE_LANG); }
    catch (e) { reason = e.message.split("\n")[0]; }
    const src = reason ? null : await resolveSource(entry, { r2Enabled });
    if (!reason && !src.ok) reason = src.reason;

    if (opts.dryRun) {
      if (reason) console.log(`  [dry-run] ${label} → ⏭  보류 — ${reason}`);
      else console.log(`  [dry-run] ${label} → ✅ 게시 가능 (영상:${src.video.where}, 캡션:${src.source}, 첫댓글:${src.firstComment ? "있음" : "없음"}) "${src.caption.split("\n")[0].slice(0, 36)}…"`);
      continue;
    }
    if (reason) {
      console.log(`  ⏭  보류 ${label} — ${reason}`);
      skipped++; results.push({ label, status: "held", reason });
      continue;
    }

    entry.status = "publishing";
    await saveSchedule(items);
    try {
      const { mediaId, commentId } = await publishOne(entry, src, opts);
      entry.status = "published";
      entry.mediaId = mediaId;
      if (commentId) entry.commentId = commentId; else delete entry.commentId;
      entry.publishedAt = new Date().toISOString();
      delete entry.error;
      done++; results.push({ label, status: "published", mediaId });
    } catch (e) {
      entry.status = "error";
      entry.error = e.message;
      failed++; results.push({ label, status: "error", reason: e.message });
      console.error(`  [${label}] ❌ ${e.message}`);
    }
    await saveSchedule(items);
  }
  if (!opts.dryRun) {
    const summary = `완료: ${done} 게시, ${failed} 실패, ${skipped} 보류.`;
    console.log(`\n${summary}`);
    if (process.env.GITHUB_STEP_SUMMARY) {
      const rows = results.map((r) => `| ${r.label} | ${r.status} | ${r.mediaId || r.reason || ""} |`).join("\n");
      appendFileSync(process.env.GITHUB_STEP_SUMMARY, `### 게시 결과\n${summary}\n\n| 항목 | 상태 | 비고 |\n|---|---|---|\n${rows}\n`);
    }
    if (done || failed) {
      await sendMail(`[shorts] ${summary}`, results.map((r) => `${r.label}: ${r.status} ${r.mediaId || r.reason || ""}`).join("\n"));
    }
  }
}

function help() {
  console.log(`shorts publisher — 스케줄 기반 인스타 릴스 게시기

사용법:
  node publisher/publish-reel.mjs --due [--dry-run]      publishAt 지난 pending 항목 게시 (Actions cron 이 부름)
  node publisher/publish-reel.mjs --id <id> [--dry-run]  특정 항목만 (id = remotion-<channel>-<number>[-<lang>])
  node publisher/publish-reel.mjs --list                 스케줄 현황
  옵션: --expires <초>  presigned URL 유효시간 (기본 3600)

publisher/schedule.json 항목:
  { "project": "remotion", "channel": "goodmovies", "number": "106", "lang": "(선택, 기본 ja) tw|th|vi",
    "publishAt": "2026-06-16T19:00:00+09:00",
    "caption": "(선택) 수동 캡션 — 없으면 R2/로컬의 <번호>캡션.txt",
    "firstComment": "(선택) 첫 댓글 — 없으면 캡션 txt 의 고정댓글",
    "trial": "(선택) true | MANUAL | SS_PERFORMANCE", "shareToFeed": "(선택) true|false",
    "status": "pending" }
`);
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.mode === "help") return help();
  const items = await loadSchedule();
  if (args.mode === "list") return printList(items);
  const now = Date.now();
  const selector = args.mode === "due" ? (e) => isDue(e, now) : (e) => scheduleId(e) === args.id;
  await runBatch(items, selector, { dryRun: args.dryRun, expires: args.expires });
}

main().catch((e) => { console.error("치명적 오류:", e.message); process.exit(1); });
