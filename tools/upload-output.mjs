#!/usr/bin/env node
/**
 * upload-output.mjs — 결재본(mp4 + 캡션 txt)을 R2 에 올리고 output-index.json 을 갱신한다.
 *
 * 왜: 게시(publisher)는 GitHub Actions 에서 도는데 러너엔 output/ 이 없다. 맥에서 렌더 → 캡션 txt 작성 뒤
 *     이걸 돌려야 그 영상이 게시 가능해진다. render.mjs 가 끝에서 자동 호출하고(캡션이 이미 있을 때만),
 *     캡션을 나중에 쓴 경우엔 직접 돌린다.
 *
 *   node tools/upload-output.mjs goodmovies 106            # 그 영상의 모든 언어 폴더
 *   node tools/upload-output.mjs goodmovies 106 --langs tw # 일부 언어만
 *   node tools/upload-output.mjs --all [--dry-run]         # output/ 전체 백필 (멱등 — md5 같으면 스킵)
 *   node tools/upload-output.mjs --index-only              # R2 안 건드리고 output-index.json 만 재생성
 *
 * 규칙: **캡션 txt 가 없는 폴더는 올리지 않는다** (게시 불가 상태를 R2 에 만들지 않기 위해).
 *       R2 키 = 로컬 상대경로 그대로 (`output/<ch>[-lang]/<n>/<n>.mp4`).
 * 환경: publisher/.env 의 R2_* (upload 는 맥에서만 일어난다).
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import dotenv from "dotenv";
import { S3Client, PutObjectCommand, HeadObjectCommand } from "@aws-sdk/client-s3";
import { parseCaptionTxt, captionTxtProblems } from "@wayclip/shared/caption-txt.mjs";
import { outputVideoKey, outputCaptionKey } from "@wayclip/shared/output-paths.mjs";
import { scanOutput } from "./check-caption-txt.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const INDEX_PATH = path.join(ROOT, "output-index.json");
dotenv.config({ path: path.join(ROOT, "publisher", ".env") });

function die(msg) { console.error(`✗ ${msg}`); process.exit(1); }

function parseArgs() {
  const argv = process.argv.slice(2);
  const a = { channel: null, number: null, langs: null, all: false, dryRun: false, indexOnly: false, quiet: false };
  for (let i = 0; i < argv.length; i++) {
    const t = argv[i];
    if (t === "--all") a.all = true;
    else if (t === "--dry-run") a.dryRun = true;
    else if (t === "--index-only") a.indexOnly = true;
    else if (t === "--quiet") a.quiet = true;
    else if (t === "--langs") a.langs = String(argv[++i] || "").split(",").map((s) => s.trim()).filter(Boolean);
    else if (t.startsWith("--")) die(`Unknown flag: ${t}`);
    else if (!a.channel) a.channel = t;
    else if (!a.number) a.number = t;
    else die(`Unexpected arg: ${t}`);
  }
  if (!a.all && !a.indexOnly && (!a.channel || !a.number)) {
    die("Usage: node tools/upload-output.mjs <channel> <number> [--langs tw,th] | --all [--dry-run] | --index-only");
  }
  return a;
}

const md5File = (p) => createHash("md5").update(fs.readFileSync(p)).digest("hex");

function probeDuration(mp4) {
  const r = spawnSync("ffprobe", ["-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", mp4], { encoding: "utf8" });
  const d = parseFloat(r.stdout);
  return Number.isFinite(d) ? Math.round(d * 10) / 10 : null;
}

function r2Client() {
  const { R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY } = process.env;
  if (!R2_ACCOUNT_ID || !R2_ACCESS_KEY_ID || !R2_SECRET_ACCESS_KEY) die("publisher/.env 의 R2_ACCOUNT_ID / R2_ACCESS_KEY_ID / R2_SECRET_ACCESS_KEY 필요");
  return {
    s3: new S3Client({ region: "auto", endpoint: `https://${R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
      credentials: { accessKeyId: R2_ACCESS_KEY_ID, secretAccessKey: R2_SECRET_ACCESS_KEY } }),
    bucket: process.env.R2_BUCKET || "shorts-publish",
  };
}

async function headMd5({ s3, bucket }, key) {
  try {
    const r = await s3.send(new HeadObjectCommand({ Bucket: bucket, Key: key }));
    return r.Metadata?.md5 || `etag:${r.ETag}`;
  } catch (e) {
    if (e?.$metadata?.httpStatusCode === 404 || e.name === "NotFound") return null;
    throw e;
  }
}

async function putIfChanged(r2, key, localPath, contentType, { dryRun }) {
  const md5 = md5File(localPath);
  const remote = await headMd5(r2, key);
  if (remote === md5) return { md5, action: "skip" };
  if (!dryRun) {
    await r2.s3.send(new PutObjectCommand({
      Bucket: r2.bucket, Key: key, Body: fs.readFileSync(localPath), ContentType: contentType, Metadata: { md5 },
    }));
  }
  return { md5, action: remote ? "update" : "new" };
}

function loadIndex() {
  try { return JSON.parse(fs.readFileSync(INDEX_PATH, "utf8")); } catch { return []; }
}
function saveIndex(items) {
  items.sort((a, b) => a.channel.localeCompare(b.channel) || a.lang.localeCompare(b.lang) || a.number.localeCompare(b.number));
  fs.writeFileSync(INDEX_PATH, JSON.stringify(items, null, 2) + "\n");
}
function indexEntry(e, extra = {}) {
  const parsed = parseCaptionTxt(fs.readFileSync(e.txt, "utf8"));
  return {
    channel: e.channel, lang: e.lang, number: e.number,
    key: outputVideoKey(e.channel, e.number, e.lang),
    captionKey: outputCaptionKey(e.channel, e.number, e.lang),
    size: fs.statSync(e.mp4).size,
    durationSec: probeDuration(e.mp4),
    header: parsed.header, subject: parsed.subject,
    hasPinned: !!parsed.pinnedComment,
    captionProblems: captionTxtProblems(parsed),
    ...extra,
  };
}

async function main() {
  const a = parseArgs();
  const { ok, missing } = scanOutput(a.all || a.indexOnly ? null : a.channel);
  let targets = ok;
  if (!a.all && !a.indexOnly) {
    targets = ok.filter((e) => e.number === String(a.number) && (!a.langs || a.langs.includes(e.lang)));
    const heldBack = missing.filter((e) => e.number === String(a.number) && (!a.langs || a.langs.includes(e.lang)));
    for (const h of heldBack) console.log(`⏸ ${h.chDir}/${h.number}: 캡션 txt 없음 — 작성 후 다시: node tools/upload-output.mjs ${a.channel} ${a.number}`);
    if (!targets.length && !heldBack.length) die(`output/ 에 ${a.channel}/${a.number} 결재본 없음`);
  }

  const index = loadIndex();
  const byKey = new Map(index.map((x) => [x.key, x]));

  if (a.indexOnly) {
    for (const e of targets) byKey.set(outputVideoKey(e.channel, e.number, e.lang), { ...byKey.get(outputVideoKey(e.channel, e.number, e.lang)), ...indexEntry(e) });
    saveIndex([...byKey.values()]);
    console.log(`✓ output-index.json 재생성 (${targets.length}편)`);
    return;
  }

  const r2 = r2Client();
  let n = { new: 0, update: 0, skip: 0 };
  for (const e of targets) {
    const vKey = outputVideoKey(e.channel, e.number, e.lang);
    const cKey = outputCaptionKey(e.channel, e.number, e.lang);
    const v = await putIfChanged(r2, vKey, e.mp4, "video/mp4", a);
    const c = await putIfChanged(r2, cKey, e.txt, "text/plain; charset=utf-8", a);
    const action = v.action !== "skip" || c.action !== "skip" ? (v.action === "new" ? "new" : "update") : "skip";
    n[action]++;
    const prev = byKey.get(vKey);
    byKey.set(vKey, indexEntry(e, {
      md5: v.md5, captionMd5: c.md5,
      uploadedAt: action === "skip" && prev?.uploadedAt ? prev.uploadedAt : new Date().toISOString(),
    }));
    if (!a.quiet || action !== "skip") {
      console.log(`${a.dryRun ? "[dry-run] " : ""}${action === "skip" ? "·" : "↑"} ${e.chDir}/${e.number}  mp4:${v.action} txt:${c.action}`);
    }
  }
  if (!a.dryRun) saveIndex([...byKey.values()]);
  console.log(`\n${a.dryRun ? "(dry-run) " : ""}업로드 ${n.new} 신규 / ${n.update} 갱신 / ${n.skip} 동일  → output-index.json ${a.dryRun ? "미변경" : "갱신"}`);
  if (a.all && missing.length) {
    console.log(`\n⏸ 캡션 txt 없어 보류된 결재본 ${missing.length}편: ${missing.map((m) => `${m.chDir}/${m.number}`).join(", ")}`);
  }
}

main().catch((e) => die(e.message));
