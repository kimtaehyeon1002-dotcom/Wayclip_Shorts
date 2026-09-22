// R2 (S3 호환) — 결재본은 맥의 tools/upload-output.mjs 가 `output/<ch>[-lang]/<n>/…` 키로 올려 둔다.
// 퍼블리셔는 그 키를 HEAD 로 확인하고, Meta 가 잠깐 가져갈 presigned GET URL 만 만든다.
// (버킷은 프라이빗 유지 — public 액세스 불필요.)
import { readFile } from "node:fs/promises";
import {
  S3Client, PutObjectCommand, GetObjectCommand, HeadObjectCommand, DeleteObjectCommand,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { R2 } from "./config.mjs";

let _client;
export function client() {
  if (!_client) {
    _client = new S3Client({
      region: "auto",
      endpoint: `https://${R2.accountId}.r2.cloudflarestorage.com`,
      credentials: { accessKeyId: R2.accessKeyId, secretAccessKey: R2.secretAccessKey },
    });
  }
  return _client;
}

/** 객체 메타 (없으면 null). */
export async function head(key) {
  try {
    const r = await client().send(new HeadObjectCommand({ Bucket: R2.bucket, Key: key }));
    return { size: r.ContentLength, etag: r.ETag, md5: r.Metadata?.md5 || null, lastModified: r.LastModified };
  } catch (e) {
    if (e?.$metadata?.httpStatusCode === 404 || e.name === "NotFound") return null;
    throw e;
  }
}

export async function getText(key) {
  const r = await client().send(new GetObjectCommand({ Bucket: R2.bucket, Key: key }));
  return await r.Body.transformToString("utf8");
}

export async function presign(key, { expiresIn = 3600 } = {}) {
  return getSignedUrl(client(), new GetObjectCommand({ Bucket: R2.bucket, Key: key }), { expiresIn });
}

export async function putFile(localPath, key, { contentType, md5 } = {}) {
  const Body = await readFile(localPath);
  await client().send(new PutObjectCommand({
    Bucket: R2.bucket, Key: key, Body, ContentType: contentType,
    Metadata: md5 ? { md5 } : undefined,
  }));
}

export async function remove(key) {
  await client().send(new DeleteObjectCommand({ Bucket: R2.bucket, Key: key }));
}
