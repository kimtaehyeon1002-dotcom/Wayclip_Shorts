#!/usr/bin/env node
/**
 * gen-formats.mjs — formats/*.json → src/formats.generated.ts (Remotion/webpack 이 import 하는 정적 목록)
 *                  + packages/shared/format.schema.json (JSON Schema — 에디터 자동완성·웹 폼).
 * npm run dev / render / typecheck 전에 자동 실행(pre 스크립트). CI 는 --check 로 최신성만 검사.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { z } from "zod";
import { loadFormats } from "@wayclip/shared/formats-node.mjs";
import { formatSchema, validateFormats } from "@wayclip/shared/format-schema.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const check = process.argv.includes("--check");

const formats = loadFormats(path.join(ROOT, "formats"));
const errs = validateFormats(Object.values(formats));
if (errs.length) { console.error("✗ formats 검증 실패:\n  " + errs.join("\n  ")); process.exit(1); }

const slugs = Object.keys(formats);
const ts = `// 자동 생성 — 손대지 말 것. 원본: formats/*.json. 재생성: node tools/gen-formats.mjs
// (Remotion 번들러가 JSON 을 정적으로 import 하도록 목록을 코드로 고정한다.)
${slugs.map((s, i) => `import f${i} from "../formats/${s}.json";`).join("\n")}

export const FORMAT_JSON = [${slugs.map((_, i) => `f${i}`).join(", ")}] as const;
export const FORMAT_SLUGS = [${slugs.map((s) => JSON.stringify(s)).join(", ")}] as const;
`;
const jsonSchema = JSON.stringify(z.toJSONSchema(formatSchema, { io: "input", unrepresentable: "any" }), null, 2) + "\n";

// publish-due.yml 의 IG 시크릿 env 블록 — 포맷×타깃 언어마다 한 줄. (toJSON(secrets) 는 GitHub 이 차단)
const wfPath = path.join(ROOT, ".github", "workflows", "publish-due.yml");
const secretNames = [...new Set(Object.values(formats).flatMap((f) => f.languages.targets.map((l) => f.publisher.accounts[l]?.secret).filter(Boolean)))].sort();
const wfBlock = secretNames.map((n) => `      ${n}: \${{ secrets.${n} }}`).join("\n");
const wfCur = fs.existsSync(wfPath) ? fs.readFileSync(wfPath, "utf8") : null;
const wfNext = wfCur
  ? wfCur.replace(/(# --- IG secrets \(gen-formats\) ---\n)[\s\S]*?(      # --- end IG secrets ---)/, `$1${wfBlock}\n$2`)
  : null;

const outputs = [
  [path.join(ROOT, "src", "formats.generated.ts"), ts],
  [path.join(ROOT, "packages", "shared", "format.schema.json"), jsonSchema],
  ...(wfNext ? [[wfPath, wfNext]] : []),
];
let stale = false;
for (const [file, content] of outputs) {
  const cur = fs.existsSync(file) ? fs.readFileSync(file, "utf8") : null;
  if (cur === content) continue;
  stale = true;
  if (check) console.error(`✗ 최신 아님: ${path.relative(ROOT, file)} — node tools/gen-formats.mjs 실행 후 커밋`);
  else { fs.writeFileSync(file, content); console.log(`✓ ${path.relative(ROOT, file)}`); }
}
if (check) { if (stale) process.exit(1); console.log("✓ 생성 파일 최신"); }
else if (!stale) console.log("· 변경 없음");
