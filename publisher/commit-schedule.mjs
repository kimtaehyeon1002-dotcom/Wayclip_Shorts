#!/usr/bin/env node
// 게시 실행 뒤 schedule.json 의 상태 변화를 main 에 커밋/푸시한다 (Actions 전용, 로컬에서도 동작).
//
// 규칙: 이번 런이 바꾼 항목의 RUN_FIELDS(status/mediaId/commentId/publishedAt/error) 만
//       원격 최신 schedule.json 위에 덮어쓴다 → 웹(Pages)에서 동시에 추가/편집한 항목이 살아남는다.
//       push 가 거부되면(그 사이 다른 커밋) 다시 fetch → 머지 → 재시도 (최대 5회).
import { execSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import { SCHEDULE_PATH, SCHEDULE_REL, REPO_ROOT } from "./lib/config.mjs";
import { diffRunUpdates, mergeStatusUpdates, stringifySchedule, scheduleId } from "@wayclip/shared/schedule.mjs";

const sh = (cmd, opts = {}) => execSync(cmd, { cwd: REPO_ROOT, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"], ...opts }).trim();
const BRANCH = process.env.SCHEDULE_BRANCH || "main";

function main() {
  const working = JSON.parse(readFileSync(SCHEDULE_PATH, "utf8"));
  const head = JSON.parse(sh(`git show HEAD:${SCHEDULE_REL}`));
  const updates = diffRunUpdates(head, working);
  if (!updates.size) { console.log("schedule.json 변화 없음 — 커밋 생략"); return; }
  const ids = [...updates.keys()];
  console.log(`갱신 항목: ${ids.join(", ")}`);

  sh(`git config user.name "wayclip-publisher[bot]"`);
  sh(`git config user.email "publisher@users.noreply.github.com"`);

  for (let attempt = 1; attempt <= 5; attempt++) {
    sh(`git fetch origin ${BRANCH}`);
    const remote = JSON.parse(sh(`git show origin/${BRANCH}:${SCHEDULE_REL}`));
    const merged = mergeStatusUpdates(remote, updates);
    // 원격에서 사라진 항목(웹에서 삭제)은 그대로 둔다 — 상태만 덮어쓰는 정책.
    const missing = ids.filter((id) => !remote.some((e) => scheduleId(e) === id));
    if (missing.length) console.warn(`⚠ 원격에 없는 항목(웹에서 삭제됨?): ${missing.join(", ")} — 상태 반영 생략`);

    sh(`git checkout -q origin/${BRANCH} -- ${SCHEDULE_REL}`);
    writeFileSync(SCHEDULE_PATH, stringifySchedule(merged));
    sh(`git add ${SCHEDULE_REL}`);
    if (!sh(`git status --porcelain ${SCHEDULE_REL}`)) { console.log("원격과 동일 — 커밋 생략"); return; }
    sh(`git commit -q -m "publish: ${ids.join(", ")}"`);
    try {
      sh(`git push origin HEAD:${BRANCH}`);
      console.log(`✓ 푸시 완료 (시도 ${attempt})`);
      return;
    } catch (e) {
      console.warn(`push 거부 (시도 ${attempt}) — 재시도: ${String(e.stderr || e.message).split("\n")[0]}`);
      sh(`git reset -q --hard origin/${BRANCH}`);
      // 재시도 루프: fetch 부터 다시. working 의 updates 는 메모리에 있으니 그대로 재적용.
    }
  }
  console.error("✗ 5회 재시도 후 실패 — 상태 변화가 커밋되지 않았다. 다음 런에서 isAlreadyPosted 가 중복을 막는다.");
  process.exit(1);
}

main();
