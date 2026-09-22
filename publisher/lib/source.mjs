// 게시 소스 결정 — 영상 URL + 캡션/고정댓글.
//   로컬(맥)  : output/<ch>[-lang]/<n>/ 가 있으면 그 파일을 R2 정규 키로 올린 뒤(멱등) presign.
//   원격(Actions): R2 에 이미 있는 정규 키를 presign. 없으면 보류(사용자가 upload-output 을 돌려야 함).
// 캡션은 schedule 항목의 caption/firstComment 가 있으면 그게 우선(수동 오버라이드).
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { createHash } from "node:crypto";
import { BASE_LANG } from "@wayclip/shared/langs.mjs";
import { outputVideoKey, outputCaptionKey } from "@wayclip/shared/output-paths.mjs";
import { parseCaptionTxt } from "@wayclip/shared/caption-txt.mjs";
import { LOCAL_OUTPUT_DIR, REPO_ROOT } from "./config.mjs";
import * as r2 from "./r2.mjs";

export function entryLabel(e) {
  const lang = e.lang && e.lang !== BASE_LANG ? `/${e.lang}` : "";
  return `${e.channel}/${e.number}${lang}`;
}

export function keysOf(e) {
  const lang = e.lang || BASE_LANG;
  return {
    video: outputVideoKey(e.channel, e.number, lang),
    caption: outputCaptionKey(e.channel, e.number, lang),
  };
}

function localPath(key) {
  // key 는 "output/…" 로 시작 — LOCAL_OUTPUT_DIR 이 output/ 자체를 가리킨다.
  const rel = key.replace(/^output\//, "");
  const p = join(LOCAL_OUTPUT_DIR, rel);
  return existsSync(p) ? p : null;
}

function md5File(p) {
  return createHash("md5").update(readFileSync(p)).digest("hex");
}

/**
 * 게시 전 점검. 네트워크(R2 HEAD)를 쓰므로 async.
 * @returns {{ ok: true, video: {key, where}, caption: string, firstComment: string, source: string } | { ok: false, reason: string }}
 */
export async function resolveSource(entry, { r2Enabled = true } = {}) {
  const k = keysOf(entry);

  // 1) 캡션
  let caption = "", firstComment = "", source = null;
  if (entry.caption && String(entry.caption).trim()) {
    caption = entry.caption; firstComment = entry.firstComment || ""; source = "schedule";
  } else {
    const lp = localPath(k.caption);
    if (lp) {
      const p = parseCaptionTxt(readFileSync(lp, "utf8"));
      caption = p.caption; firstComment = entry.firstComment || p.pinnedComment; source = "local-txt";
    } else if (r2Enabled && (await r2.head(k.caption))) {
      const p = parseCaptionTxt(await r2.getText(k.caption));
      caption = p.caption; firstComment = entry.firstComment || p.pinnedComment; source = "r2-txt";
    }
  }
  if (!caption.trim()) {
    return { ok: false, reason: `캡션 없음 (${k.caption} 이 로컬에도 R2 에도 없음 — 캡션 txt 작성 후 upload-output)` };
  }

  // 2) 영상
  const lv = localPath(k.video);
  if (lv) return { ok: true, video: { key: k.video, where: "local", path: lv }, caption, firstComment, source };
  if (r2Enabled && (await r2.head(k.video))) {
    return { ok: true, video: { key: k.video, where: "r2" }, caption, firstComment, source };
  }
  return { ok: false, reason: `영상 없음 (${k.video} — 맥에서 node tools/upload-output.mjs ${entry.channel} ${entry.number})` };
}

/** 영상 URL 확보: 로컬이면 정규 키로 올린 뒤(md5 같으면 스킵) presign. */
export async function videoUrlFor(src, { expiresIn = 3600 } = {}) {
  if (src.video.where === "local") {
    const md5 = md5File(src.video.path);
    const h = await r2.head(src.video.key);
    if (!h || h.md5 !== md5) {
      await r2.putFile(src.video.path, src.video.key, { contentType: "video/mp4", md5 });
    }
  }
  return r2.presign(src.video.key, { expiresIn });
}

export { REPO_ROOT };
