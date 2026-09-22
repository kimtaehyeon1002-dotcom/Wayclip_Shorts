// schedule.json 규칙 — 퍼블리셔(Actions)와 웹(Pages)이 같은 파일을 편집하므로 여기서만 정의.
import { BASE_LANG } from "./langs.mjs";

export const STATUSES = ["pending", "publishing", "published", "error", "skipped"];

/** 항목 id. 예전 항목(lang 없음)은 `remotion-goodmovies-106` 그대로 유지. */
export function scheduleId(e) {
  if (e.id) return e.id;
  const project = e.project || "remotion";
  const lang = e.lang && e.lang !== BASE_LANG ? `-${e.lang}` : "";
  return `${project}-${e.channel}-${e.number}${lang}`;
}

export function isDue(e, nowMs = Date.now()) {
  if (!e.publishAt) return true; // 시각 없으면 즉시 대상
  return new Date(e.publishAt).getTime() <= nowMs;
}

/** 저장 포맷 — 퍼블리셔와 웹이 바이트 단위로 같은 결과를 내야 git 충돌이 안 난다. */
export function stringifySchedule(items) {
  return JSON.stringify(items, null, 2) + "\n";
}

/** 게시 결과로 갱신되는 필드 — 이 필드만 원격 버전 위에 덮어쓴다(웹의 동시 편집 보존). */
export const RUN_FIELDS = ["status", "mediaId", "commentId", "publishedAt", "error"];

/**
 * 원격(최신) 스케줄 위에 이번 실행이 만든 상태 변화만 덮어쓴다.
 * @param {object[]} remote  origin/main 의 schedule.json
 * @param {Map<string, object>} updatesById  id → 변경된 항목(로컬 결과)
 */
export function mergeStatusUpdates(remote, updatesById) {
  return remote.map((e) => {
    const u = updatesById.get(scheduleId(e));
    if (!u) return e;
    const out = { ...e };
    for (const k of RUN_FIELDS) {
      if (k in u) out[k] = u[k];
      else delete out[k];
    }
    return out;
  });
}

/** HEAD 버전과 작업본을 비교해 RUN_FIELDS 가 바뀐 항목만 추린다. */
export function diffRunUpdates(before, after) {
  const prev = new Map(before.map((e) => [scheduleId(e), e]));
  const updates = new Map();
  for (const e of after) {
    const id = scheduleId(e);
    const p = prev.get(id);
    if (!p) continue;
    const changed = RUN_FIELDS.some((k) => (p[k] ?? null) !== (e[k] ?? null));
    if (changed) updates.set(id, e);
  }
  return updates;
}

export function validateEntry(e, { channels, langsOf } = {}) {
  const errs = [];
  if (!e.channel) errs.push("channel 없음");
  else if (channels && !channels.includes(e.channel)) errs.push(`알 수 없는 채널 ${e.channel}`);
  if (!e.number || !/^\d+$/.test(String(e.number))) errs.push("number 는 숫자 문자열");
  if (e.lang && langsOf && !langsOf(e.channel).includes(e.lang)) errs.push(`${e.channel} 에 없는 언어 ${e.lang}`);
  if (e.publishAt && Number.isNaN(new Date(e.publishAt).getTime())) errs.push("publishAt 이 ISO 시각이 아님");
  if (e.status && !STATUSES.includes(e.status)) errs.push(`status 값 오류 ${e.status}`);
  return errs;
}
