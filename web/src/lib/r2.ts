// R2 presigned GET (AWS SigV4 query 서명) — 브라우저에서 SDK 없이. 결재본 미리보기 전용, 키는 localStorage.
import { getSettings } from "./store";

const enc = new TextEncoder();
const hex = (b: ArrayBuffer) => [...new Uint8Array(b)].map((x) => x.toString(16).padStart(2, "0")).join("");
const sha256 = async (s: string) => hex(await crypto.subtle.digest("SHA-256", enc.encode(s)));
async function hmac(key: ArrayBuffer | string, msg: string): Promise<ArrayBuffer> {
  const k = await crypto.subtle.importKey("raw", typeof key === "string" ? enc.encode(key) : key, { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return crypto.subtle.sign("HMAC", k, enc.encode(msg));
}
const encodeKey = (key: string) => key.split("/").map((s) => encodeURIComponent(s).replace(/[!'()*]/g, (c) => "%" + c.charCodeAt(0).toString(16).toUpperCase())).join("/");

export function r2Configured(): boolean {
  const s = getSettings();
  return !!(s.r2AccountId && s.r2AccessKeyId && s.r2SecretAccessKey && s.r2Bucket);
}

/** `output/<ch>/<n>/<n>.mp4` 키 → 1시간짜리 presigned URL. */
export async function presignGet(key: string, expires = 3600): Promise<string> {
  const s = getSettings();
  if (!r2Configured()) throw new Error("R2 키가 설정되지 않음 (Settings)");
  const host = `${s.r2AccountId}.r2.cloudflarestorage.com`;
  const now = new Date();
  const amzDate = now.toISOString().replace(/[:-]|\.\d{3}/g, "");
  const date = amzDate.slice(0, 8);
  const scope = `${date}/auto/s3/aws4_request`;
  const canonicalUri = `/${s.r2Bucket}/${encodeKey(key)}`;
  const params: [string, string][] = [
    ["X-Amz-Algorithm", "AWS4-HMAC-SHA256"],
    ["X-Amz-Credential", `${s.r2AccessKeyId}/${scope}`],
    ["X-Amz-Date", amzDate],
    ["X-Amz-Expires", String(expires)],
    ["X-Amz-SignedHeaders", "host"],
  ];
  const qs = params.map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`).sort().join("&");
  const canonical = ["GET", canonicalUri, qs, `host:${host}\n`, "host", "UNSIGNED-PAYLOAD"].join("\n");
  const toSign = ["AWS4-HMAC-SHA256", amzDate, scope, await sha256(canonical)].join("\n");
  const kDate = await hmac(`AWS4${s.r2SecretAccessKey}`, date);
  const kRegion = await hmac(kDate, "auto");
  const kService = await hmac(kRegion, "s3");
  const kSigning = await hmac(kService, "aws4_request");
  const sig = hex(await hmac(kSigning, toSign));
  return `https://${host}${canonicalUri}?${qs}&X-Amz-Signature=${sig}`;
}
