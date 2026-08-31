#!/usr/bin/env node
/**
 * 수집한 유튜브 댓글을 유튜브 다크테마 스크린샷 모양의 PNG 로 그린다.
 *
 * 표준 워크플로의 3단계다 (2026-08-31 확정). 항상 `--scale 1 --soft2x` 로 뽑는다.
 * ⚠️ **실제로 수집된 댓글만 그린다.** 없는 댓글을 지어내 그리는 용도가 아니다.
 *    입력은 fetch-comments.mjs 가 유튜브에서 받아온 원문·좋아요·핸들 그대로다.
 *
 * 규격은 눈대중이 아니라 기존 채택 스샷에서 실측해 맞췄다
 * (output/goodvibesongs/113/… 을 blur-comments --debug 로 잰 값):
 *   프사 ø64 / textLeft 90 / lineH 26  →  유튜브 데스크톱 CSS × 배율 1.6 과 일치.
 * 그래서 CSS 는 유튜브 데스크톱 실제 값(프사 40px, 본문 14px/20px, 핸들 13px)을 쓰고
 * --force-device-scale-factor 로 1.6 을 곱한다.
 *
 * 결과물은 기존 파이프라인에 그대로 얹힌다 — 프사·닉네임 비식별화는 지금처럼
 * tools/blur-comments.mjs 에 통과시키면 된다 (이 도구는 블러를 하지 않는다).
 *
 * 사용법:
 *   node tools/render-comment.mjs --from <fetched.json> --index 7 --out out.png
 *   node tools/render-comment.mjs --text "サビのハモリで鳥肌立った" --handle "@mikan_0407" \
 *        --likes 268 --when "4 か月前" --out out.png
 *   node tools/render-comment.mjs --from <fetched.json> --all --outdir ./렌더
 *     --scale N     배율 (기본 1.6 = 레퍼런스 스샷과 같은 크기)
 *     --wrap N      본문 줄바꿈 폭 CSS px (기본 330)
 *     --keep-html   중간 HTML 을 남긴다 (레이아웃 디버깅용)
 */
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const CHROME = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";

function die(msg) {
  console.error(`✗ ${msg}`);
  process.exit(1);
}

const argv = process.argv.slice(2);
const flag = (n, d) => {
  const i = argv.indexOf(`--${n}`);
  return i === -1 ? d : argv[i + 1];
};
const has = (n) => argv.includes(`--${n}`);

const SCALE = Number(flag("scale", 1.6));
const SOFT2X = has("soft2x");
const THREAD_LINE = !has("no-thread-line"); // 기본 켬 (코퍼스 72/92) // 1x 렌더 → lanczos 2x (사용자 스샷과 같은 질감)
// 레퍼런스 스샷(113)이 전각 14자에서 줄을 바꾼다 → 16px × 14자 ≈ 224px
const WRAP = Number(flag("wrap", 228));

// ── 실측 규격 (사용자 실제 스샷에서 잰 값, 1x 데스크톱 기준) ──────────
// 근거: 2026-08-31 사용자가 같은 댓글(@ういもか)을 직접 찍어 준 스샷 401×86 을
// 픽셀로 측정. 이전 값(배경 #0f0f0f, 핸들 15px, 본문 16px)은 전부 실제보다 컸다.
const BG = flag("bg", "#111111"); // 유튜브 CSS 명세는 #0f0f0f 지만 실제 맥 스샷은 #111111
const AV = Number(flag("avatar", 36)); // 프사 지름
const GAP = 16; // 프사 ↔ 텍스트 칼럼 (코퍼스 textLeft/lineH=4.48 에 맞춘 값)
const PAD_L = 6;
const PAD_T = 5;
const F_HANDLE = 12.5, LH_HANDLE = 16;
const F_WHEN = 12;
const F_BODY = 14, LH_BODY = 20;
const F_ACTS = 12, F_ICON = 20;
const GAP_HEAD_BODY = 5;  // 핸들줄 박스 → 본문 박스
const GAP_BODY_ACTS = 11; // 본문 박스 → 액션줄 박스
// 액션행 내부 간격은 **균등하지 않다** (실측: 좋아요수→싫어요 18px, 싫어요→返信 29px).
// 균등하게 주면 총 폭은 맞는데 싫어요 아이콘만 8px 밀린다 — 겹쳐 보면 바로 드러난다.
const GAP_N_ICON = 17;     // 좋아요 수 ↔ 싫어요 아이콘 (실측: 108 → 126)
const GAP_ICON_REPLY = 28; // 싫어요 아이콘 ↔ 返信 (실측: 141 → 169)
const ACTS_SHIFT = -1;
// 보조 텍스트(날짜 · 좋아요 수) 색. ⚠️ 좋아요 **수는 흰색이 아니라 회색**이다 —
// 흰색으로 찍으면 숫자만 유독 진해서 바로 티가 난다(실측 최대밝기 실제 160 vs 흰색 241).
// #aaa(170)도 아직 밝아서 실측에 맞춘 #a0a0a0 을 쓴다.
const SECONDARY = "#a0a0a0";     // 아이콘 잉크가 textLeft 보다 2px 왼쪽에서 시작한다 (실측)

if (!fs.existsSync(CHROME)) die(`헤드리스 렌더에 쓸 크롬을 못 찾음: ${CHROME}`);

// ── 유튜브 다크테마 CSS (데스크톱 실측값) ─────────────────────────────
const esc = (s) =>
  String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

/** 핸들에서 결정적으로 프사 색을 고른다 (Math.random 금지 — 이 레포 규칙). */
const AVATAR_COLORS = [
  "#e53935", "#8e24aa", "#3949ab", "#00897b", "#f4511e",
  "#6d4c41", "#1e88e5", "#c0ca33", "#d81b60", "#00acc1",
];
function avatarColor(handle) {
  let h = 0;
  for (const ch of handle) h = (h * 31 + ch.codePointAt(0)) >>> 0;
  return AVATAR_COLORS[h % AVATAR_COLORS.length];
}
function avatarLetter(handle) {
  const s = handle.replace(/^@/, "");
  return (s[0] ?? "?").toUpperCase();
}

// 실제 스샷에서 오려낸 아이콘을 data URI 로 읽는다.
const ASSETS = path.join(path.dirname(fileURLToPath(import.meta.url)), "assets");
const asDataUri = (f) => `data:image/png;base64,${fs.readFileSync(path.join(ASSETS, f)).toString("base64")}`;
const ICON_UP = asDataUri("yt-thumb-up.png");
const ICON_DOWN = asDataUri("yt-thumb-down.png");

function buildHtml({ text, handle, likes, when, avatarDataUri }) {
  // 유튜브 엄지 아이콘 — **그리지 않는다. 실제 스샷에서 오려낸 픽셀을 그대로 쓴다.**
  //   그려서 흉내 내면 아무리 맞춰도 티가 난다(사용자 지적 2026-08-31). 머티리얼 3종은
  //   소매가 분리돼 있어 아예 다르고, 직접 트레이스한 패스도 곡률·기울기가 미묘하게 어긋난다.
  //   유튜브 아이콘은 어느 댓글이든 동일하므로 한 번 오려 두면 영원히 정확하다.
  //   원본: tools/assets/yt-thumb-{up,down}.png (1x 스샷에서 잉크 bbox 15×16 크롭).
  //   ⚠️ 1x 비트맵이라 --scale 1 + --soft2x 로 뽑을 것 (네이티브 2x 로 그리면 아이콘만 뭉갠다).
  const icon = (down) =>
    `<img class="ic" src="${down ? ICON_DOWN : ICON_UP}" width="15" height="16">`;

  const avatarEl = avatarDataUri
    ? `<img class="avatar" src="${avatarDataUri}">`
    : `<div class="avatar fallback" style="background:${avatarColor(handle)}">${esc(avatarLetter(handle))}</div>`;

  return `<meta charset="utf-8">
<style>
  html,body{margin:0;padding:0;background:transparent}
  /* 유튜브는 Roboto. 일본어는 맥 시스템 폴백(Hiragino Sans)이 그대로 잡힌다. */
  .card{
    position:relative; display:inline-block; background:${BG};
    padding:${PAD_T}px 12px 6px ${PAD_L}px;
    font-family:Roboto,"Helvetica Neue",Arial,"Hiragino Sans","Hiragino Kaku Gothic ProN",sans-serif;
    /* ⚠️ -webkit-font-smoothing:antialiased 를 켜지 말 것 — 글자가 가늘어져
       실제 스샷보다 잉크가 20%% 적고 흐리게 나온다 (2026-08-31 실측). 맥 크롬 기본값(auto)이 맞다. */
  }
  .row{display:flex; align-items:flex-start}
  /* 답글이 달린 댓글에 유튜브가 그리는 스레드 연결선. 프사 중심 x, 1px, #373737.
     채택본 92장 중 72장에 있다 — 없으면 오히려 합성 티가 난다. */
  .thread{position:absolute;left:${PAD_L + Math.round(AV / 2)}px;top:${PAD_T + AV + 6}px;
          bottom:0;width:1px;background:#373737}
  .avatar{
    width:${AV}px;height:${AV}px;border-radius:50%;flex:0 0 ${AV}px;margin-right:${GAP}px;
    object-fit:cover;display:block;
  }
  .avatar.fallback{
    display:flex;align-items:center;justify-content:center;
    color:#fff;font-size:${Math.round(AV * 0.48)}px;font-weight:400;line-height:1;user-select:none;
  }
  .col{min-width:0}
  .head{font-size:${F_HANDLE}px;line-height:${LH_HANDLE}px;white-space:nowrap}
  .handle{color:#f1f1f1;font-weight:400}
  .when{color:${SECONDARY};font-weight:400;margin-left:4px;font-size:${F_WHEN}px}
  .body{
    color:#f1f1f1;font-size:${F_BODY}px;line-height:${LH_BODY}px;white-space:pre-wrap;
    max-width:${WRAP}px;width:max-content;word-break:break-word;
    margin-top:${GAP_HEAD_BODY}px;
  }
  .acts{
    display:flex;align-items:center;color:${SECONDARY};font-size:${F_ACTS}px;
    margin-top:${GAP_BODY_ACTS}px;line-height:1;margin-left:${ACTS_SHIFT}px;
  }
  .ic{display:block;flex:0 0 auto;image-rendering:pixelated}
  .acts .n{margin:0 ${GAP_N_ICON}px 0 10px;color:${SECONDARY}}
  .acts .reply{margin-left:${GAP_ICON_REPLY}px;font-weight:400;color:#f1f1f1}
</style>
<div class="card">${THREAD_LINE ? '<div class="thread"></div>' : ""}<div class="row">
  ${avatarEl}
  <div class="col">
    <div class="head"><span class="handle">${esc(handle)}</span><span class="when">${esc(when)}</span></div>
    <div class="body">${esc(text)}</div>
    <div class="acts">${icon(false)}<span class="n">${esc(likes)}</span>${icon(true)}<span class="reply">返信</span></div>
  </div>
</div></div>
<!-- 지오메트리 자가보고. display:none 이라 스크린샷엔 안 나오고 --dump-dom 으로만 읽는다.
     blur-comments 의 자동 측정은 합성 렌더에서 오작동하므로(프사 경계가 배경과 붙는다)
     그릴 때 아는 좌표를 그대로 내보내 정확한 마스크를 쓰게 한다. -->
<div id="geo" style="display:none"></div>
<script>
  const card = document.querySelector('.card').getBoundingClientRect();
  const rel = (el) => { const r = el.getBoundingClientRect();
    return { x: r.left - card.left, y: r.top - card.top, w: r.width, h: r.height }; };
  document.getElementById('geo').textContent = JSON.stringify({
    card: { w: card.width, h: card.height },
    avatar: rel(document.querySelector('.avatar')),
    handle: rel(document.querySelector('.handle')),
  });
</script>`;
}

// ── 렌더 + 알파 트림 ──────────────────────────────────────────────────
function probeSize(file) {
  const out = execFileSync(
    "ffprobe",
    ["-v", "error", "-select_streams", "v:0", "-show_entries", "stream=width,height", "-of", "csv=p=0", file],
    { encoding: "utf8" }
  ).trim();
  const [w, h] = out.split(",").map(Number);
  return { w, h };
}

/** 투명 배경으로 찍은 뒤 알파 채널의 bbox 로 딱 맞게 자른다. */
function trimToAlpha(file, out) {
  const { w, h } = probeSize(file);
  const raw = execFileSync(
    "ffmpeg",
    ["-v", "error", "-i", file, "-vf", "alphaextract", "-f", "rawvideo", "-pix_fmt", "gray", "-"],
    { maxBuffer: 1 << 28 }
  );
  let x0 = w, y0 = h, x1 = -1, y1 = -1;
  for (let y = 0; y < h; y++) {
    const row = y * w;
    for (let x = 0; x < w; x++) {
      if (raw[row + x] > 8) {
        if (x < x0) x0 = x;
        if (x > x1) x1 = x;
        if (y < y0) y0 = y;
        if (y > y1) y1 = y;
      }
    }
  }
  if (x1 < 0) die("렌더 결과가 비어 있다 (크롬 스크린샷 실패?)");
  const cw = x1 - x0 + 1;
  const ch = y1 - y0 + 1;
  execFileSync("ffmpeg", ["-v", "error", "-y", "-i", file, "-vf", `crop=${cw}:${ch}:${x0}:${y0}`, out]);
  return { w: cw, h: ch };
}

const CHROME_BASE = ["--headless=new", "--disable-gpu", "--hide-scrollbars", "--no-sandbox"];

/** 페이지가 스스로 보고한 CSS px 좌표를 읽는다 (--dump-dom 은 JS 를 실행한다). */
function readGeometry(htmlPath) {
  const dom = execFileSync(CHROME, [...CHROME_BASE, "--dump-dom", `file://${htmlPath}`], {
    encoding: "utf8",
    maxBuffer: 1 << 26,
  });
  const m = dom.match(/id="geo"[^>]*>(\{.*?\})</s);
  return m ? JSON.parse(m[1]) : null;
}

function render(comment, outPath, keepHtml) {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "ytc-"));
  const htmlPath = path.join(tmp, "c.html");
  const shotPath = path.join(tmp, "shot.png");
  fs.writeFileSync(htmlPath, buildHtml(comment));

  const geoCss = readGeometry(htmlPath);

  execFileSync(
    CHROME,
    [
      ...CHROME_BASE,
      `--force-device-scale-factor=${SCALE}`,
      "--default-background-color=00000000",
      `--screenshot=${shotPath}`,
      "--window-size=900,1400",
      `file://${htmlPath}`,
    ],
    { stdio: "ignore" }
  );
  if (!fs.existsSync(shotPath)) die("크롬이 스크린샷을 만들지 못했다");

  const resolved = path.resolve(outPath);
  fs.mkdirSync(path.dirname(resolved), { recursive: true });
  const size = trimToAlpha(shotPath, resolved);

  // CSS px → 디바이스 px. 알파 트림이 카드 경계에 딱 맞으므로 원점 보정은 필요 없다.
  let geo = null;
  if (geoCss) {
    const S = SCALE;
    const px = (r) => ({
      x: Math.round(r.x * S),
      y: Math.round(r.y * S),
      w: Math.round(r.w * S),
      h: Math.round(r.h * S),
    });
    const a = px(geoCss.avatar);
    const n = px(geoCss.handle);
    geo = {
      width: size.w,
      height: size.h,
      avatar: a,
      handle: n,
      // blur-comments.mjs 에 그대로 넘길 수 있는 형태
      blurFlags: {
        avatarX: a.x, avatarY: a.y, avatarW: a.w, avatarH: a.h,
        nickX: n.x, nickY: n.y, nickH: n.h,
        handleEnd: n.x + n.w,
      },
    };
    fs.writeFileSync(resolved.replace(/\.png$/, "") + ".geo.json", JSON.stringify(geo, null, 2));
  }

  if (keepHtml) fs.copyFileSync(htmlPath, resolved + ".html");
  fs.rmSync(tmp, { recursive: true, force: true });

  // 사용자 스샷과 같은 질감을 만든다: 1x 로 그린 뒤 lanczos 2x.
  // 네이티브 2x 로 그리면 글자 가장자리가 실제 스샷보다 선명해서 하단 밴드에서 혼자 튄다.
  if (SOFT2X) {
    const tmp2 = resolved + ".1x.png";
    fs.renameSync(resolved, tmp2);
    execFileSync("ffmpeg", ["-v", "error", "-y", "-i", tmp2, "-vf",
      "scale=iw*2:ih*2:flags=lanczos", resolved]);
    fs.rmSync(tmp2, { force: true });
    size.w *= 2; size.h *= 2;
    if (geo) {
      const dbl = (o) => ({ x: o.x * 2, y: o.y * 2, w: o.w * 2, h: o.h * 2 });
      geo.width = size.w; geo.height = size.h;
      geo.avatar = dbl(geo.avatar); geo.handle = dbl(geo.handle);
      geo.blurFlags = {
        avatarX: geo.avatar.x, avatarY: geo.avatar.y, avatarW: geo.avatar.w, avatarH: geo.avatar.h,
        nickX: geo.handle.x, nickY: geo.handle.y, nickH: geo.handle.h,
        handleEnd: geo.handle.x + geo.handle.w,
      };
      fs.writeFileSync(resolved.replace(/\.png$/, "") + ".geo.json", JSON.stringify(geo, null, 2));
    }
  }
  return { ...size, geo };
}

// ── 프사 받아오기 ─────────────────────────────────────────────────────
// fetch-comments 가 innertube 에서 avatarThumbnailUrl 을 같이 담아 온다.
// 단색 원 + 이니셜은 합성 티가 나서(사용자 지적 2026-08-31) 실제 사진을 박는다.
// 못 받으면 조용히 이니셜 폴백 — 렌더 자체는 계속된다.
async function fetchAvatar(url) {
  if (!url) return null;
  try {
    const res = await fetch(url, { headers: { "user-agent": "Mozilla/5.0" } });
    if (!res.ok) return null;
    const buf = Buffer.from(await res.arrayBuffer());
    const type = res.headers.get("content-type") || "image/jpeg";
    return `data:${type};base64,${buf.toString("base64")}`;
  } catch {
    return null;
  }
}

// ── 실행 ──────────────────────────────────────────────────────────────
const from = flag("from", null);
let items = [];

if (from) {
  const data = JSON.parse(fs.readFileSync(from, "utf8"));
  const all = data.comments ?? data;
  if (has("all")) items = all;
  else {
    const idx = Number(flag("index", 1));
    const one = all.find((c) => c.n === idx) ?? all[idx - 1];
    if (!one) die(`--index ${idx} 에 해당하는 댓글이 없다`);
    items = [one];
  }
} else {
  const text = flag("text", null);
  if (!text) die("--from <json> 또는 --text 가 필요하다");
  items = [
    {
      n: 1,
      text,
      handle: flag("handle", "@user"),
      likes: flag("likes", "0"),
      when: flag("when", "1 年前"),
    },
  ];
}

const outdir = flag("outdir", null);
const single = flag("out", null);
if (!outdir && !single) die("--out <png> 또는 --outdir <dir> 이 필요하다");

for (const c of items) {
  const out = outdir ? path.join(outdir, `${String(c.n).padStart(2, "0")}.png`) : single;
  const avatarDataUri = has("no-avatar") ? null : await fetchAvatar(c.avatar);
  if (c.avatar && !avatarDataUri) console.error(`  ⚠ 프사를 못 받았다 (이니셜 폴백): ${c.handle}`);
  const size = render({ ...c, avatarDataUri }, out, has("keep-html"));
  console.error(`✓ ${out}  ${size.w}×${size.h}  ${String(c.text).replace(/\n/g, " ").slice(0, 40)}`);
}
