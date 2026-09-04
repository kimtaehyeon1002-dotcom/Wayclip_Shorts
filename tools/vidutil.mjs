/**
 * 영상/오디오 저수준 공용 유틸 (match-cuts / match-reframe / apply-cuts / ocr-subs 공유).
 *
 * 여기 모아둔 이유 = 굿무비 "레퍼런스 + 원본" 워크플로에서 같은 함정을 세 번 밟았기 때문:
 *   · ffmpeg `crop` 은 **짝수**여야 한다. 홀수를 주면 조용히 내림해서 rawvideo 프레임 크기가
 *     어긋나고, 그 결과 모든 타임스탬프가 비율로 드리프트한다(104에서 4% 드리프트).
 *   · `-ss <초>` 는 요청 시각 **이상**의 첫 프레임을 준다. 초를 반올림해서 넘기면 한 프레임 밀린다.
 *     프레임을 정확히 집을 땐 초가 아니라 **프레임 번호**(select=between(n,..)) 를 쓸 것.
 *   · 장면 검출은 `select='gt(scene,..)'` 보다 **프레임 차분의 임계 상승 시작점**이 정확하다.
 *     scene 필터는 전환이 2프레임에 걸치면 뒤 프레임을 집는 경우가 있다.
 */
import { spawnSync } from "node:child_process";

export const die = (m) => { console.error(`✗ ${m}`); process.exit(1); };
export const even = (n) => n - (n % 2);

export function ff(args, { allowFail = false } = {}) {
  const r = spawnSync("ffmpeg", args, { maxBuffer: 1 << 30 });
  if (r.status !== 0 && !allowFail) die(`ffmpeg 실패:\n${r.stderr}`);
  return r;
}

export function parseArgs(argv) {
  const pos = [], opt = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a.startsWith("--")) { const n = a.slice(2); opt[n] = (argv[i + 1] && !argv[i + 1].startsWith("--")) ? argv[++i] : true; }
    else pos.push(a);
  }
  return { pos, opt };
}
export const str = (v) => (typeof v === "string" ? v : null);

/** 비디오 메타 + 프레임번호↔시각 변환기 */
export function probe(file) {
  const r = spawnSync("ffprobe", ["-v", "error", "-select_streams", "v:0",
    "-show_entries", "stream=width,height,r_frame_rate,start_time",
    "-show_entries", "format=duration", "-of", "default=noprint_wrappers=1:nokey=0", file]);
  if (r.status !== 0) die(`ffprobe 실패: ${file}`);
  const o = Object.fromEntries(r.stdout.toString().trim().split("\n").map(l => l.split("=")));
  const [num, den] = String(o.r_frame_rate).split("/").map(Number);
  const fps = num / den;
  const start = Number.isFinite(+o.start_time) ? +o.start_time : 0;
  return {
    W: +o.width, H: +o.height, fps, start, dur: +o.duration,
    /** 디코드 순서 n번째(0-based) 프레임의 시각 */
    tOf: (n) => start + n / fps,
  };
}

/** 오디오 → 모노 PCM Float32 (기본 16kHz) */
export function pcm(file, { sr = 16000, ss = null, t = null } = {}) {
  const a = ["-v", "error"];
  if (ss != null) a.push("-ss", String(ss));
  if (t != null) a.push("-t", String(t));
  a.push("-i", file, "-vn", "-ac", "1", "-ar", String(sr), "-f", "f32le", "-");
  const b = ff(a).stdout;
  return new Float32Array(b.buffer, b.byteOffset, Math.floor(b.length / 4));
}

/** 10ms 프레임 로그에너지 엔벨로프 (거친 정렬용) */
export function envelope(file, { sr = 16000, hop = 160 } = {}) {
  const a = pcm(file, { sr });
  const n = Math.floor(a.length / hop), env = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    let s = 0; const o = i * hop;
    for (let j = 0; j < hop; j++) { const v = a[o + j]; s += v * v; }
    env[i] = Math.log1p(s * 1e4);
  }
  return { env, fps: sr / hop };
}

/** 회색 축소 프레임 전체를 한 번에 디코드. crop 은 짝수로 강제된다. */
export function grayFrames(file, { crop = null, w = 96, h = 71, fps = null } = {}) {
  if (crop) {
    const p = crop.split(":").map(Number);
    if (p.some(x => !Number.isFinite(x))) die(`crop 형식 오류: ${crop}`);
    if (p[0] % 2 || p[1] % 2) die(`crop 은 짝수여야 한다 (받은 값 ${p[0]}x${p[1]}) — ffmpeg 가 내림해 프레임이 어긋난다`);
  }
  const vf = [crop ? `crop=${crop}` : null, fps ? `fps=${fps}` : null, `scale=${even(w)}:${even(h)}`].filter(Boolean).join(",");
  // ⚠️ -fps_mode passthrough 필수. start_time 이 0 이 아닌 파일(예: 첫 프레임 pts=1001)에서
  //    기본 CFR 출력은 t=0 을 메우려고 **맨 앞 프레임을 복제**해 넣는다. 그러면 디코드 인덱스가
  //    통째로 +1 밀려 컷 프레임 번호가 한 칸씩 어긋난다(104에서 실제로 겪음).
  const d = ff(["-v", "error", "-i", file, "-vf", vf, "-fps_mode", "passthrough",
    "-f", "rawvideo", "-pix_fmt", "gray", "-"]).stdout;
  const N = even(w) * even(h);
  if (d.length % N) die(`프레임 바이트 정렬 실패 (${d.length} % ${N} ≠ 0)`);
  return { data: d, F: d.length / N, N, w: even(w), h: even(h) };
}

/**
 * 프레임 단위 컷 검출.
 * 반환 [{ n, t, diff }] — n 은 **새 샷의 첫 프레임**(디코드 순서 0-based).
 * 전환이 2프레임에 걸쳐도 되도록 "임계를 넘는 구간의 **시작**" 을 취한다
 * (argmax 를 쓰면 뒤 프레임을 집어 1프레임 밀린다 — 104에서 실제로 겪음).
 */
export function frameCuts(file, { crop = null, thresh = 18, w = 96, h = 71 } = {}) {
  const g = grayFrames(file, { crop, w, h });
  const meta = probe(file);
  const diff = new Float64Array(Math.max(0, g.F - 1));
  for (let f = 1; f < g.F; f++) {
    let s = 0; const a = f * g.N, b = (f - 1) * g.N;
    for (let i = 0; i < g.N; i++) s += Math.abs(g.data[a + i] - g.data[b + i]);
    diff[f - 1] = s / g.N;
  }
  const cuts = [];
  for (let i = 0; i < diff.length; i++) {
    if (diff[i] <= thresh) continue;
    let j = i, peak = diff[i];
    while (j + 1 < diff.length && diff[j + 1] > thresh) { j++; peak = Math.max(peak, diff[j]); }
    const n = i + 1;                       // diff[i] = |frame(i+1) - frame(i)|
    if (n > 1) cuts.push({ n, t: meta.tOf(n), diff: +peak.toFixed(1) });
    i = j;
  }
  return cuts;
}

/** 파형 교차상관으로 샘플 단위 오프셋. 반환 { offset, corr } (origTime = refTime + offset) */
export function waveOffset(refFile, origFile, { refAt, len = 5, guess, search = 0.4, sr = 48000 } = {}) {
  const a = pcm(refFile, { sr, ss: refAt, t: len });
  const b = pcm(origFile, { sr, ss: refAt + guess - search, t: len + 2 * search });
  const span = Math.round(2 * search * sr);
  const W = Math.min(a.length, b.length - span);
  if (W < sr / 2) return null;
  let am = 0; for (let i = 0; i < W; i++) am += a[i]; am /= W;
  let av = 0; for (let i = 0; i < W; i++) { const d = a[i] - am; av += d * d; }
  const asd = Math.sqrt(av); if (asd < 1e-9) return null;
  const score = (o, step) => {
    let m = 0, c = 0;
    for (let i = 0; i < W; i += step) { m += b[o + i]; c++; }
    m /= c;
    let dot = 0, vv = 0;
    for (let i = 0; i < W; i += step) { const x = a[i] - am, y = b[o + i] - m; dot += x * y; vv += y * y; }
    return vv > 0 ? dot / Math.sqrt(vv) : -2;
  };
  let best = -2, at = 0;
  for (let o = 0; o <= span; o++) { const c = score(o, 8); if (c > best) { best = c; at = o; } }
  let b2 = -2, o2 = at;
  for (let o = Math.max(0, at - 500); o <= Math.min(span, at + 500); o++) {
    const c = score(o, 1) / asd;
    if (c > b2) { b2 = c; o2 = o; }
  }
  return { offset: guess - search + o2 / sr, corr: b2 };
}
