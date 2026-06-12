#!/usr/bin/env node
/**
 * 확실한 스크립트(가사/대사)와 STT transcript.json을 정렬해서 captions 를 생성.
 * (HyperFrames 판의 LCS 알고리즘 그대로 — 출력만 props.json 병합으로 변경)
 *
 * 알고리즘:
 *   1. transcript.json의 STT 단어들과 script의 단어들을 정규화 후 LCS로 매칭
 *   2. 매칭된 STT 단어의 타임스탬프를 script 단어에 부여
 *   3. 매칭 안 된 script 단어는 양쪽 매칭 단어 사이 균등 보간
 *   4. line(가사 한 줄) 단위로 그룹: 첫 단어 start ~ 마지막 단어 end
 *
 * 사용:
 *   node tools/align-script.mjs videos/goodvibesongs/076
 *     (기본: <dir>/transcript.json + <dir>/script.txt|json → <dir>/props.json 의 captions 갱신)
 *
 *   node tools/align-script.mjs <dir> --out path/to/captions.json   # 독립 JSON 배열로 출력
 *
 * script 입력 형식:
 *   1) .txt — 빈 줄 구분 블록, 각 블록 = [원어 줄, 번역 줄] (둘째 줄 생략 시 번역 = 원어). '#' 주석.
 *   2) .json — { "lines": [{ "original": "...", "translation": "..." }, ...] }
 */
import fs from "node:fs";
import path from "node:path";

function die(msg) {
  console.error(`✗ ${msg}`);
  process.exit(1);
}

function parseArgs(argv) {
  const opts = { dir: null, transcript: null, script: null, out: null };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--transcript") opts.transcript = argv[++i];
    else if (a === "--script") opts.script = argv[++i];
    else if (a === "--out") opts.out = argv[++i];
    else if (a.startsWith("--")) die(`Unknown flag: ${a}`);
    else if (!opts.dir) opts.dir = a;
    else die(`Unexpected positional arg: ${a}`);
  }
  if (!opts.dir) die("Usage: node tools/align-script.mjs <video-dir> [--transcript X] [--script X] [--out X]");
  return opts;
}

function resolveInputs({ dir, transcript, script, out }) {
  const t = transcript ?? path.join(dir, "transcript.json");
  if (!fs.existsSync(t)) die(`transcript not found: ${t}`);
  let s = script;
  if (!s) {
    for (const candidate of ["script.txt", "script.json"]) {
      const p = path.join(dir, candidate);
      if (fs.existsSync(p)) { s = p; break; }
    }
  }
  if (!s) die(`script not found in ${dir}/ (expected script.txt or script.json)`);
  if (!fs.existsSync(s)) die(`script not found: ${s}`);
  const o = out ?? path.join(dir, "props.json");
  return { transcriptPath: t, scriptPath: s, outPath: o };
}

function loadTranscript(p) {
  const data = JSON.parse(fs.readFileSync(p, "utf8"));
  // 평탄한 배열 [{text, start, end, ...}] 기본. OpenAI Whisper {segments:[...]} 도 흡수.
  if (Array.isArray(data)) return data;
  if (data.words && Array.isArray(data.words)) return data.words;
  if (data.segments) {
    const out = [];
    for (const seg of data.segments) {
      if (seg.words) for (const w of seg.words) out.push(w);
    }
    if (out.length) return out;
  }
  die("Unrecognized transcript shape — expected array of {text, start, end}.");
}

function loadScript(p) {
  const ext = path.extname(p).toLowerCase();
  if (ext === ".json") {
    const data = JSON.parse(fs.readFileSync(p, "utf8"));
    if (!data.lines || !Array.isArray(data.lines)) die("script.json must have 'lines' array.");
    return data.lines.map((l) => ({
      original: String(l.original ?? "").trim(),
      translation: String(l.translation ?? l.original ?? "").trim(),
    })).filter((l) => l.original.length > 0);
  }
  const raw = fs.readFileSync(p, "utf8");
  const stripped = raw
    .split("\n")
    .filter((line) => !/^\s*#/.test(line))
    .join("\n");
  const blocks = stripped.split(/\n\s*\n+/).map((b) => b.trim()).filter(Boolean);
  return blocks.map((b) => {
    const lines = b.split("\n").map((l) => l.trim()).filter(Boolean);
    const original = lines[0] ?? "";
    const translation = lines[1] ?? original;
    return { original, translation };
  }).filter((l) => l.original.length > 0);
}

function normalize(s) {
  return String(s)
    .toLowerCase()
    .replace(/[^\p{L}\p{N}']/gu, "")
    .trim();
}

function tokenize(text) {
  return String(text).split(/\s+/).map(normalize).filter(Boolean);
}

function lcsMatches(a, b) {
  const n = a.length, m = b.length;
  const dp = Array.from({ length: n + 1 }, () => new Array(m + 1).fill(0));
  for (let i = 1; i <= n; i++) {
    for (let j = 1; j <= m; j++) {
      if (a[i - 1] === b[j - 1]) dp[i][j] = dp[i - 1][j - 1] + 1;
      else dp[i][j] = Math.max(dp[i - 1][j], dp[i][j - 1]);
    }
  }
  const pairs = [];
  let i = n, j = m;
  while (i > 0 && j > 0) {
    if (a[i - 1] === b[j - 1]) { pairs.push([i - 1, j - 1]); i--; j--; }
    else if (dp[i - 1][j] >= dp[i][j - 1]) i--;
    else j--;
  }
  pairs.reverse();
  return pairs;
}

function alignToTranscript(transcriptWords, scriptLines) {
  const sttNorm = transcriptWords.map((w) => normalize(w.text ?? w.word ?? ""));
  const scriptTokens = [];
  scriptLines.forEach((line, lineIdx) => {
    tokenize(line.original).forEach((tok) => scriptTokens.push({ norm: tok, lineIdx }));
  });
  const scriptNorm = scriptTokens.map((t) => t.norm);
  const pairs = lcsMatches(sttNorm, scriptNorm);

  const times = new Array(scriptTokens.length).fill(null);
  for (const [si, ci] of pairs) {
    const w = transcriptWords[si];
    times[ci] = { start: Number(w.start) || 0, end: Number(w.end ?? w.start) || 0 };
  }

  for (let i = 0; i < times.length; i++) {
    if (times[i] !== null) continue;
    let prev = i - 1; while (prev >= 0 && times[prev] === null) prev--;
    let next = i + 1; while (next < times.length && times[next] === null) next++;
    const hasPrev = prev >= 0 && times[prev] !== null;
    const hasNext = next < times.length && times[next] !== null;
    if (hasPrev && hasNext) {
      const gapStart = times[prev].end;
      const gapEnd = times[next].start;
      const segs = next - prev;
      const seg = Math.max(0, (gapEnd - gapStart) / segs);
      const localIdx = i - prev;
      times[i] = { start: gapStart + seg * (localIdx - 1), end: gapStart + seg * localIdx };
    } else if (hasPrev) {
      times[i] = { start: times[prev].end + 0.4 * (i - prev - 1), end: times[prev].end + 0.4 * (i - prev) };
    } else if (hasNext) {
      const gapEnd = times[next].start;
      const segs = next + 1;
      const seg = gapEnd / segs;
      times[i] = { start: seg * i, end: seg * (i + 1) };
    } else {
      times[i] = { start: 0, end: 0 };
    }
  }

  const captions = scriptLines.map((line, lineIdx) => {
    const lineTokenTimes = scriptTokens
      .map((t, idx) => ({ ...t, idx, time: times[idx] }))
      .filter((t) => t.lineIdx === lineIdx);
    if (lineTokenTimes.length === 0) {
      return { start: 0, end: 0.5, original: line.original, translation: line.translation };
    }
    return {
      start: Math.max(0, lineTokenTimes[0].time.start),
      end: Math.max(lineTokenTimes[0].time.start + 0.3, lineTokenTimes[lineTokenTimes.length - 1].time.end),
      original: line.original,
      translation: line.translation,
    };
  });

  for (let i = 0; i < captions.length - 1; i++) {
    const cur = captions[i], nxt = captions[i + 1];
    if (cur.end > nxt.start) cur.end = Math.max(cur.start + 0.3, nxt.start - 0.05);
  }

  return {
    captions,
    matchedTokens: pairs.length,
    totalScriptTokens: scriptTokens.length,
    totalSttTokens: sttNorm.length,
  };
}

// 소수 3자리로 반올림한 caption 배열.
function roundCaptions(captions) {
  return captions.map((c) => ({
    start: Math.round(c.start * 1000) / 1000,
    end: Math.round(c.end * 1000) / 1000,
    original: c.original,
    translation: c.translation,
  }));
}

// props.json 이면 captions 필드만 갱신(다른 필드 보존), 그 외 .json 이면 배열을 그대로 출력.
function writeCaptions(outPath, captions) {
  if (path.basename(outPath) === "props.json" && fs.existsSync(outPath)) {
    const props = JSON.parse(fs.readFileSync(outPath, "utf8"));
    props.captions = captions;
    fs.writeFileSync(outPath, JSON.stringify(props, null, 2) + "\n");
    return "props.json (captions 갱신)";
  }
  fs.writeFileSync(outPath, JSON.stringify(captions, null, 2) + "\n");
  return "captions JSON";
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const { transcriptPath, scriptPath, outPath } = resolveInputs(args);

  const transcript = loadTranscript(transcriptPath);
  const scriptLines = loadScript(scriptPath);

  if (scriptLines.length === 0) die("script has no lines.");
  if (transcript.length === 0) die("transcript has no words.");

  const result = alignToTranscript(transcript, scriptLines);
  const kind = writeCaptions(outPath, roundCaptions(result.captions));

  const matchPct = ((result.matchedTokens / result.totalScriptTokens) * 100).toFixed(1);
  console.log(`✓ wrote ${path.relative(process.cwd(), outPath)} — ${kind}`);
  console.log(`  ${result.captions.length} caption line(s)`);
  console.log(`  matched: ${result.matchedTokens} / ${result.totalScriptTokens} script tokens (${matchPct}%)`);
  console.log(`  stt tokens: ${result.totalSttTokens}`);

  if (result.matchedTokens / result.totalScriptTokens < 0.5) {
    console.warn("");
    console.warn("⚠  매칭률이 50% 미만입니다. 가능한 원인:");
    console.warn("   - 언어 불일치 (스크립트 vs STT 원어)");
    console.warn("   - 가사가 음원과 크게 다름 (라이브 버전, 즉흥 가사 등)");
    console.warn("   - Whisper 모델이 너무 작음 — --model medium 이상 시도");
    console.warn("   - 결과 captions 타이밍이 부정확할 수 있음");
  }
}

main();
