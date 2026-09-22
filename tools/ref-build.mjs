#!/usr/bin/env node
/**
 * 굿무비 "레퍼런스 + 원본 2개 입력" 워크플로 앞단(R-1~R-4)을 한 번에 돌린다.
 *
 *   R-1  match-cuts     레퍼런스 컷 ↔ 원본 컷 매칭 (+ A/V 어긋남 진단)
 *   R-2b match-reframe  레퍼런스가 샷마다 쓴 크롭 역산 → 채널 밴드 비율로 변환
 *   R-3  ocr-subs       레퍼런스에 박힌 자막 OCR → SRT (레퍼런스 시간축)
 *   R-2  apply-cuts     원본을 컷대로 자르고 리프레임 + 레퍼런스 오디오 + SRT 리매핑
 *   R-4  (--scaffold)   prep-media → new-video → props.captions 에 영문 채워 넣기
 *
 * **컷 리스트는 사람이 검증 시트를 보고 승인한 뒤 자르는 게 원칙**이라
 * 기본은 R-1 까지만 돌고 멈춘다. 승인 후 --go 로 나머지를 진행한다.
 *
 * 사용법:
 *   node tools/ref-build.mjs <레퍼런스> <원본> --number 104 [옵션]
 *
 * 옵션:
 *   --number <n>        영상 번호 (산출물 이름에 쓰임, 필수)
 *   --channel <slug>    채널 (default goodmovies)
 *   --band WxH          영상 밴드 크기 (default: 채널값 — 굿무비/레디액션 1080x960)
 *   --work <dir>        중간 산출물 디렉토리 (default ./_ref/<번호>)
 *   --go                검증 시트 확인 후 R-2/R-3 까지 진행
 *   --scaffold          --go 에 더해 prep-media + new-video + captions 골격까지
 *   --audio ref|orig    오디오 출처 (default ref)
 *   --audio-shift auto|<s>  레퍼런스 A/V 어긋남 보정. auto = match-cuts 가 잰 avSkew 사용
 *                       (default 0 = 레퍼런스를 그대로 재현)
 *   --slug <s>          prep-media 슬러그 (--scaffold 시 필수)
 *   --media-title-ja <s> 하단에 쓸 작품명
 *   --sub-band <n>      레퍼런스에 자막이 2줄이면 몇 번째가 원어인지 (default 0 = 맨 위)
 */
import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { spawnSync } from "node:child_process";
import path from "node:path";
import { die, parseArgs, str } from "./vidutil.mjs";

const node = (args, { quiet = false } = {}) => {
  const r = spawnSync("node", args, { stdio: quiet ? ["ignore", "pipe", "pipe"] : "inherit" });
  if (r.status !== 0) die(`실패: node ${args.join(" ")}${r.stderr ? "\n" + r.stderr : ""}`);
  return r;
};
const step = (n, t) => console.log(`\n\x1b[1m━━ ${n}  ${t}\x1b[0m`);

const BAND = { goodmovies: "1080x960", readyaction: "1080x960", thishiphop: "1080x960", goodvibesongs: "1080x1040" };

function main() {
  const { pos, opt } = parseArgs(process.argv.slice(2));
  if (pos.length < 2) die("사용법: node tools/ref-build.mjs <레퍼런스> <원본> --number 104 [--go] [--scaffold]");
  const [ref, orig] = pos;
  const num = str(opt.number) ?? die("--number 필요");
  const ch = str(opt.channel) ?? "goodmovies";
  const band = str(opt.band) ?? BAND[ch] ?? "1080x960";
  const work = str(opt.work) ?? `_ref/${num}`;
  mkdirSync(work, { recursive: true });

  const cuts = path.join(work, `${num}.cuts.json`);
  const sheet = path.join(work, `${num}-컷검증.png`);
  const reframe = path.join(work, `${num}.reframe.json`);
  const srtRef = path.join(work, `${num}자막-레퍼런스시간축.srt`);
  const clip = path.join(work, `${num}컷편집.mp4`);
  const srtOut = `${num}자막.srt`;

  step("R-1", "컷 매칭 (레퍼런스 ↔ 원본)");
  node(["tools/match-cuts.mjs", ref, orig, "--auto-crop", "--auto-orig-crop", "--out", cuts, "--verify", sheet]);
  const cfg = JSON.parse(readFileSync(cuts, "utf8"));

  if (!opt.go && !opt.scaffold) {
    console.log(`\n\x1b[1m멈춤 — 검증 시트를 보고 컷 리스트를 승인할 것:\x1b[0m ${sheet}`);
    console.log(`승인되면:  node tools/ref-build.mjs "${ref}" "${orig}" --number ${num} --go${opt.slug ? ` --slug ${opt.slug}` : ""}`);
    return;
  }

  const shiftOpt = str(opt["audio-shift"]) ?? "0";
  const audioShift = shiftOpt === "auto" ? (cfg.avSkew ?? 0) : Number(shiftOpt);
  const audio = (opt.audio === "orig") ? "orig" : "ref";

  step("R-2b", `샷별 리프레임 역산 (밴드 ${band})`);
  node(["tools/match-reframe.mjs", cuts, "--band", band, "--out", reframe]);

  step("R-3", "레퍼런스에 박힌 자막 OCR → SRT");
  node(["tools/ocr-subs.mjs", ref, "--band", String(opt["sub-band"] ?? 0), "--out", srtRef]);

  step("R-2", `컷 적용 + 리프레임 + 오디오(${audio}${audioShift ? ` ${audioShift > 0 ? "+" : ""}${audioShift}s 보정` : ""})`);
  node(["tools/apply-cuts.mjs", cuts, "--out", clip, "--reframe", reframe,
    "--audio", audio, "--audio-shift", String(audioShift), "--srt", srtRef, "--srt-out", srtOut]);

  if (!opt.scaffold) {
    console.log(`\n\x1b[1m다음:\x1b[0m`);
    console.log(`  node tools/prep-media.mjs ${clip} <slug> --kind movie --lang en`);
    console.log(`  node tools/new-video.mjs ${ch} ${num} --media <slug> --media-kind 映画 --media-title-ja "…" --orig-lang en --trans-lang ja`);
    console.log(`  → ${srtOut} 의 cue 를 1:1 로 props.captions 에 옮기고 번역`);
    return;
  }

  const slug = str(opt.slug) ?? die("--scaffold 에는 --slug 필요");
  step("R-4a", "공유 미디어 임포트");
  node(["tools/prep-media.mjs", clip, slug, "--kind", "movie", "--lang", "en", "--overwrite"]);

  step("R-4b", "영상 스캐폴드");
  const nv = ["tools/new-video.mjs", ch, num, "--media", slug, "--orig-lang", "en", "--trans-lang", "ja"];
  if (BAND[ch] === "1080x960") nv.push("--media-kind", "映画");
  if (str(opt["media-title-ja"])) nv.push("--media-title-ja", str(opt["media-title-ja"]));
  node(nv);

  step("R-4c", "SRT cue → props.captions (영문만, 번역은 비움)");
  const dir = `videos/${ch}/${num}`;
  const props = JSON.parse(readFileSync(path.join(dir, "props.json"), "utf8"));
  const t = (s) => { const [h, mi, rest] = s.split(":"); const [sec, ms] = rest.replace(".", ",").split(","); return +h * 3600 + +mi * 60 + +sec + (+ms || 0) / 1000; };
  props.captions = readFileSync(srtOut, "utf8").trim().split(/\n\s*\n/).map(b => {
    const L = b.split("\n"), m = L[1]?.match(/([\d:,.]+)\s*-->\s*([\d:,.]+)/);
    return m ? { start: +t(m[1]).toFixed(3), end: +t(m[2]).toFixed(3), original: L.slice(2).join(" ").trim(), translation: "" } : null;
  }).filter(Boolean);
  writeFileSync(path.join(dir, "props.json"), JSON.stringify(props, null, 2) + "\n");
  console.log(`  ${props.captions.length}개 cue → ${dir}/props.json  (translation 은 비어 있음 — 채워 넣을 것)`);

  console.log(`\n\x1b[1m남은 일:\x1b[0m`);
  console.log(`  1) props.json 의 captions[].translation 을 현지어로 채운다 (직역 금지)`);
  console.log(`  2) node tools/check-captions.mjs ${dir} && node tools/validate-props.mjs ${dir}`);
  console.log(`  3) node tools/preview.mjs ${ch} ${num}   → 로컬에서 승인`);
}

main();
