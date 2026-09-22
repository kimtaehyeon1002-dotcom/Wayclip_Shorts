// Node 용 포맷 로더 (fs). 브라우저/Remotion 은 src/formats.generated.ts 를 쓴다.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { formatSchema } from "./format-schema.mjs";

export const FORMATS_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..", "formats");

/** @returns {Record<string, import("zod").infer<typeof formatSchema>>} slug → format (파일명 순) */
export function loadFormats(dir = FORMATS_DIR) {
  const out = {};
  for (const file of fs.readdirSync(dir).filter((f) => f.endsWith(".json")).sort()) {
    const raw = JSON.parse(fs.readFileSync(path.join(dir, file), "utf8"));
    const parsed = formatSchema.safeParse(raw);
    if (!parsed.success) {
      throw new Error(`formats/${file} 스키마 오류:\n${parsed.error.issues.map((i) => `  ${i.path.join(".")}: ${i.message}`).join("\n")}`);
    }
    if (parsed.data.slug !== path.basename(file, ".json")) throw new Error(`formats/${file}: slug(${parsed.data.slug}) 가 파일명과 다름`);
    out[parsed.data.slug] = parsed.data;
  }
  // order → slug 순으로 정렬한 객체 (Object.keys 순서가 곧 CHANNELS 순서)
  return Object.fromEntries(Object.values(out).sort((a, b) => a.order - b.order || a.slug.localeCompare(b.slug)).map((f) => [f.slug, f]));
}
