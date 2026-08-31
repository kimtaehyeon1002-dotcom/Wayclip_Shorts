#!/usr/bin/env node
/**
 * 유튜브 인기 댓글 수집 (굿바이브 댓글 오버레이 후보 뽑기용).
 *
 * 표준 워크플로의 1단계다 (2026-08-31 확정):
 *   레퍼런스 링크 → [수집·리스트업] → 사용자 선택 → render-comment → prep-comments.
 *   사용자가 직접 스샷을 찍어 주는 경로도 그대로 살아 있다.
 *
 * API 키도 yt-dlp 도 필요 없다. 워치 페이지 HTML 안에 들어 있는 innertube
 * continuation 토큰을 꺼내 유튜브 내부 API(/youtubei/v1/next)를 직접 친다.
 * 정렬은 유튜브 기본값 = 인기순이라, 사용자가 댓글창을 위에서부터 훑는 순서와 같다.
 *
 * ⚠️ 유튜브의 "인기 댓글순"은 좋아요 순이 아니다.
 *    답글 수·최신성·채널 하트까지 섞은 참여도 랭킹이라 좋아요 실수치와 어긋나고,
 *    좋아요 많은 댓글이 한참 뒤로 묻히기도 한다. 그래서 이 도구는
 *    **넉넉히 긁어(--pool) 좋아요로 다시 세운다.** 얕게 긁으면 묻힌 게 그대로 새어나간다.
 *
 * 사용법:
 *   node tools/fetch-comments.mjs "<url 또는 검색어>" [옵션]
 *     --limit N        보여줄 개수 (기본 80)
 *     --pool N         정렬 전에 긁어 모을 후보 수 (기본 400). 클수록 정확하고 느리다
 *     --sort likes|youtube   기본 likes(좋아요 실수치). youtube 면 유튜브 순서 그대로
 *     --min-likes N    좋아요 하한 (기본 30). 「1.7万」 같은 일본 표기를 숫자로 환산해 비교
 *     --out <path>     JSON 저장 경로 (기본 stdout 표만)
 *     --json           표 대신 JSON 을 stdout 으로
 *     --raw            필터를 끄고 원본 그대로
 *
 * 예:
 *   node tools/fetch-comments.mjs "星野源 恋" --limit 60 --out /tmp/koi.json
 *   node tools/fetch-comments.mjs "https://www.youtube.com/watch?v=jhOVibLEDhA"
 */

const UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36";
const JP_HEADERS = { "user-agent": UA, "accept-language": "ja,en;q=0.8" };

function die(msg) {
  console.error(`✗ ${msg}`);
  process.exit(1);
}

// ── 인자 ──────────────────────────────────────────────────────────────
const argv = process.argv.slice(2);
const flag = (name, dflt) => {
  const i = argv.indexOf(`--${name}`);
  return i === -1 ? dflt : argv[i + 1];
};
const has = (name) => argv.includes(`--${name}`);

// 값을 받는 플래그 — 위치 인자와 구분하기 위해 명시한다.
const VALUE_FLAGS = new Set([
  "limit", "pool", "sort", "min-likes", "out", "video", "root", "spread", "must",
]);
/** 위치 인자 = url 또는 검색어. **여러 개 줄 수 있다** (여러 영상 댓글을 한 풀로 합침). */
const positionals = argv.filter((a, i) => {
  if (a.startsWith("--")) return false;
  const prev = argv[i - 1];
  return !(prev?.startsWith("--") && VALUE_FLAGS.has(prev.slice(2)));
});

const LIMIT = Number(flag("limit", 80));
const MIN_LIKES = Number(flag("min-likes", 30));
const OUT = flag("out", null);
// 정렬 전에 긁어 모을 후보 풀. 유튜브의 "인기순"은 좋아요 순이 아니라
// 답글·최신성·채널 하트까지 섞은 참여도 랭킹이라, 좋아요 높은 댓글이 뒤에 묻혀 있다.
// 그래서 넉넉히 긁은 다음 좋아요로 다시 세운다 — 얕게 긁으면 그게 그대로 새어나간다.
// 600 이면 恋(재생 2.8억) 기준 상위권이 포화된다 — 1200 까지 파도 순위가 안 바뀌었다. 약 12초.
const POOL = Number(flag("pool", 600));
const SORT = flag("sort", "likes"); // likes | youtube

// ── 유틸 ──────────────────────────────────────────────────────────────

/** 「1.7万」「30万」「6563」→ 숫자. 유튜브가 로케일 축약형으로 주기 때문에 필요. */
function parseLikes(s) {
  if (!s) return 0;
  const t = String(s).trim().replace(/,/g, "");
  const m = t.match(/^([\d.]+)\s*(万|億|K|M)?$/i);
  if (!m) return Number(t) || 0;
  const n = parseFloat(m[1]);
  const mult = { 万: 1e4, 億: 1e8, k: 1e3, m: 1e6 }[(m[2] || "").toLowerCase()] ?? 1;
  return Math.round(n * mult);
}

function extractInitialData(html) {
  const m =
    html.match(/var ytInitialData = (\{.+?\});<\/script>/s) ||
    html.match(/ytInitialData"\]\s*=\s*(\{.+?\});<\/script>/s);
  if (!m) die("ytInitialData 를 찾지 못했다 (유튜브 페이지 구조가 바뀌었을 수 있음)");
  return JSON.parse(m[1]);
}

/** 객체 트리를 훑어 조건에 맞는 노드를 모은다. 유튜브 응답이 깊게 중첩돼서 필요. */
function walk(node, visit) {
  if (!node || typeof node !== "object") return;
  visit(node);
  for (const v of Array.isArray(node) ? node : Object.values(node)) walk(v, visit);
}

// ── --video <ch>/<n> → 레포 메타데이터에서 검색어(또는 URL) 유도 ───────
//
// URL 을 매번 주지 않아도 되게 한다. videos/<ch>/<n>/meta.json 의 media.slug 로
// media/<slug>.json 사이드카를 찾아 "아티스트 + 곡명" 을 검색어로 만든다.
//
// ⚠️ 검색은 편의일 뿐 정확성 보장이 아니다 — 같은 곡의 공식 MV / 라이브 / 팬 업로드가
//    섞여 나오고, 댓글은 **그 영상 것**이라야 의미가 있다(라이브 클립인데 MV 댓글을
//    가져오면 어긋난다). 그래서 후보를 항상 같이 출력하고,
//    사이드카에 source_url 이 있으면 검색을 건너뛰고 그걸 그대로 쓴다.
async function resolveFromVideo(spec, rootFlag) {
  const fsm = await import("node:fs");
  const pathm = await import("node:path");
  const { fileURLToPath } = await import("node:url");
  const root = rootFlag
    ? pathm.resolve(rootFlag)
    : pathm.resolve(pathm.dirname(fileURLToPath(import.meta.url)), "..");

  const rel = spec.replace(/^videos\//, "").replace(/\/+$/, "");
  const metaPath = pathm.join(root, "videos", rel, "meta.json");
  if (!fsm.existsSync(metaPath)) die(`meta.json 을 못 찾음: ${metaPath}`);
  const meta = JSON.parse(fsm.readFileSync(metaPath, "utf8"));

  const slug = meta?.media?.slug;
  if (!slug) die(`meta.json 에 media.slug 가 없다: ${metaPath}`);
  const sidecarPath = pathm.join(root, "media", `${slug}.json`);
  if (!fsm.existsSync(sidecarPath)) die(`미디어 사이드카를 못 찾음: ${sidecarPath}`);
  const side = JSON.parse(fsm.readFileSync(sidecarPath, "utf8"));

  if (side.source_url) {
    console.error(`▶ ${rel} → 사이드카의 source_url 사용: ${side.source_url}`);
    return { url: side.source_url };
  }
  const query = [side.artist_or_source, side.title].filter(Boolean).join(" ");
  if (!query) die(`사이드카에 title/artist 가 없어 검색어를 만들 수 없다: ${sidecarPath}`);
  console.error(`▶ ${rel} → media "${slug}" → 검색어 "${query}"`);
  // 곡명을 따로 넘겨 "제목에 곡명이 든 영상"만 남기게 한다 (다른 곡 유입 방지)
  return { query, must: side.title };
}

// ── 검색 → videoId ────────────────────────────────────────────────────
async function searchVideo(query) {
  const html = await (
    await fetch("https://www.youtube.com/results?search_query=" + encodeURIComponent(query), {
      headers: JP_HEADERS,
    })
  ).text();
  const hits = [];
  walk(extractInitialData(html), (o) => {
    const v = o.videoRenderer;
    if (v?.videoId)
      hits.push({
        id: v.videoId,
        title: v.title?.runs?.[0]?.text ?? "",
        channel: v.ownerText?.runs?.[0]?.text ?? "",
        views: v.viewCountText?.simpleText ?? "",
      });
  });
  if (!hits.length) die(`검색 결과 없음: ${query}`);
  // 유튜브 검색은 관련도순이라 조회수와 어긋난다. 조회수 많은 곳일수록 댓글도 많고
  // 좋은 댓글이 나올 확률이 높으므로 **조회수 내림차순**으로 다시 세운다.
  for (const h of hits) h.viewCount = parseViews(h.views);
  hits.sort((a, b) => b.viewCount - a.viewCount);
  return hits;
}

/** 제목 비교용 정규화 — 대소문자·공백·기호를 지운다 */
const norm = (s) => String(s ?? "").toLowerCase().replace(/[\s　''"".,!?｜|\-–—:：/()[\]「」『』]/g, "");

/**
 * 조회수만으로 고르면 **다른 곡**이 올라온다.
 * 예: "ONE OK ROCK with YOASOBI Wherever you are" 를 조회수순으로 잡으면
 * 같은 밴드의 「We are」(5,700만)가 1위로 올라와 풀을 장악한다 — 곡이 다르니 댓글 맥락도 다르다.
 * 그래서 조회수로 세우기 **전에** 곡명이 제목에 실제로 들어간 영상만 남긴다.
 */
function filterBySong(hits, must) {
  if (!must) return hits;
  const m = norm(must);
  const ok = hits.filter((h) => norm(h.title).includes(m));
  return ok.length ? ok : hits; // 하나도 못 맞히면 게이트를 포기하고 원본을 쓴다
}

/** 「989,175,090回視聴」「1.2万回視聴」→ 숫자 */
function parseViews(s) {
  if (!s) return 0;
  const t = String(s).replace(/,/g, "");
  const m = t.match(/([\d.]+)\s*(万|億)?/);
  if (!m) return 0;
  const mult = { 万: 1e4, 億: 1e8 }[m[2]] ?? 1;
  return Math.round(parseFloat(m[1]) * mult);
}

// ── 댓글 수집 ─────────────────────────────────────────────────────────
async function fetchComments(videoUrl, limit) {
  const html = await (await fetch(videoUrl, { headers: JP_HEADERS })).text();
  const key = html.match(/"INNERTUBE_API_KEY":"([^"]+)"/)?.[1];
  const clientVersion = html.match(/"INNERTUBE_CLIENT_VERSION":"([^"]+)"/)?.[1];
  if (!key || !clientVersion) die("innertube 키를 찾지 못했다");

  const initial = extractInitialData(html);
  const title =
    initial?.contents?.twoColumnWatchNextResults?.results?.results?.contents?.find(
      (c) => c.videoPrimaryInfoRenderer
    )?.videoPrimaryInfoRenderer?.title?.runs?.[0]?.text ?? "";

  // 댓글 섹션의 continuation 토큰 찾기
  let token = null;
  walk(initial, (o) => {
    if (token) return;
    if (o.itemSectionRenderer?.sectionIdentifier === "comment-item-section")
      token =
        o.itemSectionRenderer.contents?.[0]?.continuationItemRenderer?.continuationEndpoint
          ?.continuationCommand?.token ?? null;
  });
  if (!token) {
    // 폴백: 댓글 패널 안의 긴 토큰 문자열
    walk(initial, (o) => {
      if (token) return;
      if (o.engagementPanelSectionListRenderer?.panelIdentifier === "engagement-panel-comments-section")
        token = JSON.stringify(o).match(/"token":"([^"]{80,})"/)?.[1] ?? null;
    });
  }
  // ⚠️ 여기서 die 하면 안 된다 — 합본 수집(--spread)에서 댓글이 꺼진 영상이 하나만 섞여도
  //    전체 수집이 통째로 죽는다(정국 Seven 의 "- Topic" 자동생성 채널이 그랬다).
  //    그 영상만 건너뛰고 나머지로 계속 간다.
  if (!token) return { title, comments: [], exhausted: true, noComments: true };

  const context = { client: { clientName: "WEB", clientVersion, hl: "ja", gl: "JP" } };
  const out = [];
  const seen = new Set();
  let cont = token;

  for (let page = 0; page < 60 && cont && out.length < limit; page++) {
    const res = await fetch(`https://www.youtube.com/youtubei/v1/next?key=${key}`, {
      method: "POST",
      headers: { "content-type": "application/json", ...JP_HEADERS },
      body: JSON.stringify({ context, continuation: cont }),
    });
    if (!res.ok) break;
    const json = await res.json();

    let next = null;
    walk(json, (o) => {
      const p = o.commentEntityPayload;
      if (p?.properties?.content?.content) {
        const id = p.properties.commentId ?? p.properties.content.content;
        if (!seen.has(id)) {
          seen.add(id);
          out.push({
            ytRank: out.length + 1, // 유튜브가 준 순서 (= "인기순" 랭킹에서의 위치)
            text: p.properties.content.content,
            likes: p.toolbar?.likeCountLiked || p.toolbar?.likeCountNotliked || "",
            likeCount: parseLikes(p.toolbar?.likeCountLiked || p.toolbar?.likeCountNotliked),
            replies: p.toolbar?.replyCount ?? "",
            handle: p.author?.displayName ?? "",
            // 프사 URL. render-comment 가 실제 사진을 그려 넣는다 (단색 원 + 이니셜은
            // 합성 티가 나서 하단 밴드에 얹으면 이질적이다 — 2026-08-31).
            avatar: p.author?.avatarThumbnailUrl ?? "",
            when: p.properties.publishedTime ?? "",
          });
        }
      }
      const t = o.continuationItemRenderer?.continuationEndpoint?.continuationCommand?.token;
      if (t) next = t;
    });
    cont = next;
  }
  // cont 가 남아 있으면 아직 더 있는데 끊은 것 — 좋아요 상위가 더 묻혀 있을 수 있다.
  return { title, comments: out, exhausted: !cont };
}

// ── 후보 필터 ─────────────────────────────────────────────────────────
// 92개 채택 코퍼스에서 관찰된 성질을 반영한 1차 거르기. 최종 선별은 사람이/모델이 한다.
const SPAM = /(https?:\/\/|www\.|チャンネル登録|概要欄|プレゼント企画|\bLINE\b|副業|稼げ)/i;

function looksUseful(c) {
  const t = (c.text ?? "").trim();
  if (!t) return false;
  if (SPAM.test(t)) return false;
  // 이모지/기호만 있는 댓글
  if (!/[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Latin}]/u.test(t)) return false;
  // 너무 짧은 추임새 ("草", "www")
  if (t.replace(/\s/g, "").length < 4) return false;
  // 굿바이브는 일본 타깃 — 영어 댓글은 기본 제외 (--allow-en 으로 해제)
  if (!has("allow-en") && isForeign(t)) return false;
  // 아주 긴 사연은 좋아요가 높을 때만 (오버레이에서 화면을 다 먹는다)
  const len = t.replace(/\s/g, "").length;
  if (len > 180 && c.likeCount < 3000) return false;
  if (c.likeCount < MIN_LIKES) return false;
  return true;
}

/**
 * 오버레이에 얹었을 때의 성질로 갈래를 붙인다.
 * 갈래는 output/goodvibesongs/1xx/1xx댓글/ 에 쌓인 채택 댓글 92건에서 뽑았다.
 * 우선순위 순서 — 위쪽이 더 구체적이라 먼저 맞히게 둔다.
 */
const ARCHETYPE = [
  // 자기 사연을 곡에 겹치는 긴 글. 좋아요가 압도적으로 높다 (111번 자위대 사연 1.7万)
  [/(歳|代です|社会人|会社|上司|受験|部活|仕事|人生|入社|退職|失敗|不合格|夢を|自分は|僕は|私は|俺は)/, "사연·자기투영"],
  // 특정 가사·구간을 지목 → anchor 붙일 후보
  [/(歌詞|サビ|ここ[ので]|の部分|フレーズ|冒頭|イントロ|アウトロ|ハモリ|一行目|最後の|\d+:\d{2})/, "가사 지목"],
  // 눈물·위로·구원
  [/(泣[けかいく]|涙|沁みる|染みる|刺さ|救わ|励まさ|勇気|背中を押|癒|優しさ|ありがとう)/, "감정·위로"],
  // 실력 감탄. 일본 댓글 정형구가 몰려 있는 갈래
  [/(鳥肌|震え|ゾクゾク|エモ|神(?!様)|語彙力|うますぎ|上手すぎ|すごすぎ|最高すぎ|化け物|天才|えぐい|やば|圧巻|別次元|しか勝たん|尊い)/, "감탄·실력"],
  // 웃김·밈·캐릭터
  [/(草|笑|ｗ|ｗｗ|かわい|可愛|似合|衣装|筋肉|の件について|すぎる件|食わせ|ご馳走|プロテイン)/, "유머·밈"],
  // 시의성 — 뉴스·라이브 참전·N주년
  [/(結婚|発表|ライブ|参戦|現地|来た人|見に来た|ニュース|報道|周年|今更|また聴け|配信で)/, "시의성·맥락"],
  // 반복 재생 — 짧고 붙이기 쉬운 범용 댓글
  [/(何回|何度|リピート|無限|ずっと聴|戻して|中毒|聴きたく|聞きたく|戻って(き|く)|定期的|何年経っても|今でも|気づいたら)/, "반복 재생"],
];

function classify(text) {
  const tags = ARCHETYPE.filter(([re]) => re.test(text)).map(([, name]) => name);
  return tags.length ? tags.slice(0, 2) : ["기타"];
}

/**
 * 외국어 댓글 걸러내기. 굿바이브는 일본 타깃이라 일본어가 아니면 제외한다.
 *
 * ⚠️ "가나가 있으면 일본어" 로 판정하면 안 된다 — 「＿人人人＿ ＞祝・結婚＜」 같은
 *    아스키아트나 한자로만 된 짧은 댓글이 통째로 날아간다 (107번 채택 댓글이 실제로 그랬다).
 *    그래서 **한자를 일본어에 포함**하고, 그것마저 없을 때만 "글자가 있으면 외국어"로 본다.
 *
 * ⚠️ 예전 판정(`latin > 8 && jp === 0`)은 너무 헐거웠다 — 「Anyone in 2024?」(라틴 8자)가
 *    그대로 통과했고, 키릴·한글은 아예 검사하지도 않아 러시아어·한국어 댓글이 상위를 먹었다
 *    (정국 Seven 처럼 글로벌 MV 를 긁으면 후보가 전부 그런 것으로 찬다).
 */
function isForeign(t) {
  const jp = (t.match(/[\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Han}]/gu) ?? []).length;
  if (jp > 0) return false; // 일본어(또는 한자 포함) → 통과
  // 일본어 글자가 하나도 없다: 다른 문자체계의 "글자"가 있으면 외국어로 본다.
  const other = (t.match(/[\p{Script=Latin}\p{Script=Cyrillic}\p{Script=Hangul}\p{Script=Thai}\p{Script=Arabic}]/gu) ?? []).length;
  return other >= 3; // 순수 기호/이모지 아스키아트는 남긴다
}

/** 타임스탬프(1:06)를 가리키는 댓글은 anchor 를 사람이 정해줘야 한다 — CLAUDE.md 규칙. */
const TIMESTAMP = /\b\d{1,2}:\d{2}\b/;

// ── 실행 ──────────────────────────────────────────────────────────────
// ── 대상 결정 ─────────────────────────────────────────────────────────
//
// 댓글은 **그 곡의 출처 영상에서만 오는 게 아니다.** 클립에 어울리기만 하면
// 전혀 다른 영상(다른 라이브·커버·심지어 다른 곡)에서 가져다 쓰는 게 실제 작업 방식이다.
// 그래서 여러 대상을 받아 **하나의 후보 풀로 합친다.**
const videoSpec = flag("video", null);
// 검색어 하나당 **조회수 상위 몇 개 업로드**를 긁을지. 3개면 충분하다는 게 작업 기준.
const SPREAD = Number(flag("spread", 3));

// 검색 결과에서 "제목에 이 문구가 든 영상"만 남긴다. --video 면 사이드카의 곡명이 자동으로 들어간다.
let MUST = flag("must", null);

const targets = [...positionals];
if (videoSpec) {
  const r = await resolveFromVideo(videoSpec, flag("root", null));
  targets.push(r.url ?? r.query);
  if (!MUST && r.must) MUST = r.must;
}
if (!targets.length)
  die(
    '사용법: node tools/fetch-comments.mjs "<url 또는 검색어>" ["<url2>" ...] [옵션]\n' +
      "         node tools/fetch-comments.mjs --video goodvibesongs/113 [옵션]\n" +
      "         여러 영상을 한 풀로 합치려면 대상을 여러 개 주거나 --spread N 을 쓴다"
  );

/** 검색어/URL 하나 → 실제로 긁을 영상 URL 들 */
async function expand(t) {
  if (/^https?:\/\//.test(t)) return [{ url: t, label: t }];
  const all = await searchVideo(t); // 조회수 내림차순
  const hits = filterBySong(all, MUST); // 곡이 다른 영상 배제
  const take = hits.slice(0, Math.max(1, SPREAD));
  console.error(
    `▶ 검색 "${t}"${MUST ? ` (제목에 "${MUST}" 포함만)` : ""} → 조회수 상위 ${take.length}개`
  );
  for (const h of take)
    console.error(`   · ${String(h.views).padStart(16)}  ${h.channel} — ${h.title.slice(0, 44)}`);
  return take.map((h) => ({ url: `https://www.youtube.com/watch?v=${h.id}`, label: h.title }));
}

const sources = [];
const seenUrl = new Set();
for (const t of targets)
  for (const s of await expand(t)) {
    const id = s.url.match(/[?&]v=([\w-]+)/)?.[1] ?? s.url;
    if (seenUrl.has(id)) continue; // 같은 영상을 두 번 긁지 않는다
    seenUrl.add(id);
    sources.push(s);
  }

// 대상별로 긁어 한 풀에 합친다. 같은 댓글이 여러 곳에 있으면 처음 것만.
const pooled = [];
const seenText = new Set();
let anyTruncated = false;
let firstTitle = "";
const perSource = Math.max(Math.ceil(POOL / sources.length), LIMIT);

for (const s of sources) {
  const r = await fetchComments(s.url, perSource);
  if (!firstTitle) firstTitle = r.title;
  if (!r.exhausted) anyTruncated = true;
  for (const c of r.comments) {
    const key = c.text.replace(/\s/g, "");
    if (seenText.has(key)) continue;
    seenText.add(key);
    pooled.push({ ...c, source: r.title || s.label, sourceUrl: s.url });
  }
  console.error(
    r.noComments
      ? `   ↳ 건너뜀 (댓글 없음/꺼짐)  ${(r.title || s.label).slice(0, 52)}`
      : `   ↳ ${r.comments.length}건  ${(r.title || s.label).slice(0, 52)}`
  );
}
if (!pooled.length) die("모든 소스에서 댓글을 못 받았다 (댓글이 꺼져 있거나 검색어가 안 맞는다)");

const title = sources.length === 1 ? firstTitle : `${sources.length}개 영상 합본`;
const comments = pooled;
const exhausted = !anyTruncated;
const kept = has("raw") ? comments : comments.filter(looksUseful);
// 유튜브 순서를 버리고 좋아요 실수치로 다시 세운다 (--sort youtube 면 원래 순서 유지)
if (SORT !== "youtube") kept.sort((a, b) => b.likeCount - a.likeCount);

const rows = kept.slice(0, LIMIT).map((c, i) => ({
  n: i + 1,
  ...c,
  lines: c.text.split("\n").length,
  chars: c.text.replace(/\s/g, "").length,
  archetype: classify(c.text),
  needsAnchor: TIMESTAMP.test(c.text),
}));

const payload = {
  sources: sources.map((s) => s.url),
  title,
  sort: SORT,
  fetched: comments.length,
  exhausted, // false = 더 남았는데 끊음. 좋아요 상위가 더 묻혀 있을 수 있다
  kept: rows.length,
  comments: rows,
};

if (OUT) {
  const fs = await import("node:fs");
  fs.writeFileSync(OUT, JSON.stringify(payload, null, 2));
  console.error(`✓ ${rows.length}건 저장 → ${OUT}`);
}

if (has("json")) {
  console.log(JSON.stringify(payload, null, 2));
} else if (!OUT || !has("quiet")) {
  const multi = sources.length > 1;
  console.error(`\n■ ${payload.title}  (수집 ${comments.length} → 후보 ${rows.length})`);
  console.error(`  정렬: ${SORT === "youtube" ? "유튜브 인기순 그대로" : "좋아요 실수치 내림차순"}`);
  // YT#n = 유튜브가 준 "인기순" 위치. 좌측 순번과 벌어질수록 유튜브 랭킹이 좋아요와 어긋난 것.
  console.error(`  YT# = 그 영상의 유튜브 인기순 위치`);
  if (!exhausted) console.error(`  ⚠ 아직 더 있는데 끊었다 — 더 파려면 --pool 을 올릴 것`);
  console.error("");
  for (const r of rows) {
    const flagStr = [r.needsAnchor ? "⏱요확인" : "", r.chars > 120 ? "긴사연" : ""].filter(Boolean).join(" ");
    console.error(
      `${String(r.n).padStart(3)}. [${String(r.likes).padStart(6)}] YT#${String(r.ytRank).padEnd(4)} ${r.archetype.join("/")} ${flagStr}`
    );
    console.error(`     ${r.text.replace(/\n/g, " ⏎ ").slice(0, 96)}`);
    // 여러 영상을 합쳤으면 어느 영상에서 왔는지 보여준다 (맥락 판단에 필요)
    if (multi) console.error(`     └ ${String(r.source).slice(0, 76)}`);
  }
}
