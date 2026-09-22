// 설정 — 시크릿은 환경변수(GitHub Secrets) 우선, 로컬은 .env + channels.json 폴백.
import { fileURLToPath } from "node:url";
import { dirname, resolve, join } from "node:path";
import { existsSync, readFileSync } from "node:fs";
import dotenv from "dotenv";
import { BASE_LANG } from "@wayclip/shared/langs.mjs";

const HERE = dirname(fileURLToPath(import.meta.url)); // publisher/lib
export const PUBLISHER_ROOT = resolve(HERE, "..");
export const REPO_ROOT = resolve(PUBLISHER_ROOT, "..");
export const SCHEDULE_PATH = join(PUBLISHER_ROOT, "schedule.json");
export const SCHEDULE_REL = "publisher/schedule.json";
/** 로컬 결재본 폴더 (맥에서 돌릴 때만 존재). Actions 러너엔 없다 → R2 로 간다. */
export const LOCAL_OUTPUT_DIR = process.env.OUTPUT_DIR || join(REPO_ROOT, "output");

dotenv.config({ path: join(PUBLISHER_ROOT, ".env") });

export const R2 = {
  accountId: process.env.R2_ACCOUNT_ID,
  accessKeyId: process.env.R2_ACCESS_KEY_ID,
  secretAccessKey: process.env.R2_SECRET_ACCESS_KEY,
  bucket: process.env.R2_BUCKET || "shorts-publish",
};

export function assertR2() {
  const missing = Object.entries({
    R2_ACCOUNT_ID: R2.accountId,
    R2_ACCESS_KEY_ID: R2.accessKeyId,
    R2_SECRET_ACCESS_KEY: R2.secretAccessKey,
    R2_BUCKET: R2.bucket,
  }).filter(([, v]) => !v).map(([k]) => k);
  if (missing.length) throw new Error(`R2 환경변수 누락: ${missing.join(", ")} (.env 또는 GitHub Secrets)`);
}

// ── 인스타 자격증명 ──
// 1) 환경변수 IG_<SLUG>_<LANG> (JSON)   ← GitHub Secrets. publish-due.yml 의 env 블록은
//    tools/gen-formats.mjs 가 formats/*.json 에서 자동 생성한다 (포맷 추가 → gen-formats → 커밋).
// 2) channels.json  ← 로컬 폴백. { "goodmovies": {...}, "goodmovies-tw": {...} }
const SECRETS_ENV = {};
let LOCAL_CHANNELS = {};
const CH_PATH = join(PUBLISHER_ROOT, "channels.json");
if (existsSync(CH_PATH)) {
  try { LOCAL_CHANNELS = JSON.parse(readFileSync(CH_PATH, "utf8")); }
  catch (e) { throw new Error(`channels.json 파싱 실패: ${e.message}`); }
}

/** 시크릿 이름 규칙 — formats/<slug>.json 의 publisher.accounts[lang].secret 과 같은 값. */
export function igSecretName(channel, lang = BASE_LANG) {
  return `IG_${channel.toUpperCase()}_${lang.toUpperCase()}`;
}

function parseCreds(raw, where) {
  if (!raw) return null;
  let obj = raw;
  if (typeof raw === "string") {
    try { obj = JSON.parse(raw); } catch { throw new Error(`${where}: JSON 이 아님`); }
  }
  if (!obj || !obj.igUserId || !obj.igAccessToken) return null;
  return { userId: String(obj.igUserId), accessToken: String(obj.igAccessToken) };
}

/** 채널×언어의 IG 자격증명. 없으면 안내와 함께 throw. */
export function getChannelCreds(channel, lang = BASE_LANG) {
  const name = igSecretName(channel, lang);
  const fromEnv = parseCreds(process.env[name] || SECRETS_ENV[name], name);
  if (fromEnv) return fromEnv;
  const localKey = lang === BASE_LANG ? channel : `${channel}-${lang}`;
  const fromFile = parseCreds(LOCAL_CHANNELS[localKey], `channels.json[${localKey}]`)
    || (lang === BASE_LANG ? parseCreds(LOCAL_CHANNELS[channel], `channels.json[${channel}]`) : null);
  if (fromFile) return fromFile;
  throw new Error(
    `"${channel}"(${lang}) 인스타 자격증명 없음 → GitHub Secret ${name} 추가` +
    ` (값: {"igUserId":"…","igAccessToken":"…"}). 로컬은 channels.json["${localKey}"].` +
    ` 발급: node publisher/setup-ig-token.mjs <앱ID> <시크릿> <단기토큰>`
  );
}

export function hasChannelCreds(channel, lang = BASE_LANG) {
  try { getChannelCreds(channel, lang); return true; } catch { return false; }
}
