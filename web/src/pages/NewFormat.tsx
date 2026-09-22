import React, { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { loadFormats, type FormatJson } from "../lib/data";
import { putFile, listSecretNames } from "../lib/gh";
import { useSettings } from "../lib/store";
import { toast } from "../App";
import { formatSchema, validateFormats, compositionIdOf } from "@wayclip/shared/format-schema.mjs";
import { TRANS_LANGS, LANG_LABEL } from "@wayclip/shared/langs.mjs";

// "새 포맷" 위저드 — 기존 포맷을 **복제**해 시작한다(레이아웃 프리셋). 위저드가 만지는 건 아래 필드뿐이고,
// 나머지 타이포 상세는 JSON 을 직접 고치면 된다(하단 미리보기 편집 가능). 커밋 = formats/<slug>.json + formats/guides/<slug>.md.
type Preset = { slug: string; label: string };

export const NewFormat: React.FC = () => {
  const s = useSettings();
  const nav = useNavigate();
  const [formats, setFormats] = useState<FormatJson[]>([]);
  const [secrets, setSecrets] = useState<string[]>([]);
  const [base, setBase] = useState("");
  const [slug, setSlug] = useState("");
  const [ko, setKo] = useState("");
  const [handle, setHandle] = useState("@");
  const [desc, setDesc] = useState("");
  const [targets, setTargets] = useState<string[]>(["ja"]);
  const [background, setBackground] = useState("#000");
  const [band, setBand] = useState(480);
  const [topSize, setTopSize] = useState("50pt");
  const [topWeight, setTopWeight] = useState(300);
  const [topColor, setTopColor] = useState("#fff");
  const [transSize, setTransSize] = useState(48);
  const [transColor, setTransColor] = useState("#fff");
  const [captions, setCaptions] = useState(true);
  const [comments, setComments] = useState(false);
  const [watermark, setWatermark] = useState(false);
  const [videoNumber, setVideoNumber] = useState<"none" | "n" | "1000-n">("n");
  const [pinned, setPinned] = useState<Record<string, string>>({ ja: "" });
  const [fixedTop, setFixedTop] = useState<Record<string, string>>({});
  const [guide, setGuide] = useState("");
  const [jsonText, setJsonText] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => { loadFormats().then((f) => { setFormats(f); if (!base && f.length) setBase(f[0].slug); }).catch((e) => toast(String(e))); listSecretNames().then(setSecrets); }, [s.pat]);
  const presets: Preset[] = formats.map((f) => ({ slug: f.slug, label: `${f.displayName.ko} 식 (${f.layout.mode}${f.layout.band ? " " + f.layout.band : ""}, ${f.layout.background})` }));
  const nextPort = useMemo(() => Math.max(3000, ...formats.map((f) => f.previewPort)) + 1, [formats]);

  // 프리셋 바뀌면 기본값을 그 포맷에서 가져온다
  useEffect(() => {
    const b = formats.find((f) => f.slug === base); if (!b) return;
    setBackground(b.layout.background); setBand(b.layout.band ?? 480);
    const top = (b.typography as { top: { style: Record<string, unknown> } }).top.style;
    setTopSize(String(top.fontSize ?? "50pt")); setTopWeight(Number(top.fontWeight ?? 300)); setTopColor(String(top.color ?? "#fff"));
    const tr = (b.typography as { translation?: { style: Record<string, unknown> } }).translation?.style;
    setTransSize(Number(tr?.fontSize ?? 48)); setTransColor(String(tr?.color ?? "#fff"));
    setCaptions(b.features.captions); setComments(!!b.features.comments); setWatermark(!!b.features.watermark);
    setVideoNumber((b.features.videoNumber as "none" | "n" | "1000-n") ?? "none");
  }, [base, formats]);

  const built = useMemo(() => {
    const b = formats.find((f) => f.slug === base); if (!b || !slug) return null;
    const f = JSON.parse(JSON.stringify(b)) as FormatJson & Record<string, unknown>;
    f.slug = slug; f.order = (Math.max(0, ...formats.map((x) => x.order ?? 0)) + 1); f.displayName = { ko: ko || slug }; f.handle = handle; f.description = desc; f.previewPort = nextPort;
    f.languages = { ...f.languages, targets: [...new Set(["ja", ...targets])] };
    f.layout = { ...f.layout, background };
    if (f.layout.mode === "symmetric") f.layout.band = band;
    const typ = f.typography as { top: { style: Record<string, unknown> }; translation?: { style: Record<string, unknown> } };
    typ.top.style = { ...typ.top.style, fontSize: /^\d+$/.test(topSize) ? Number(topSize) : topSize, fontWeight: topWeight, color: topColor };
    if (typ.translation) typ.translation.style = { ...typ.translation.style, fontSize: transSize, color: transColor };
    f.features = { ...f.features, captions, videoNumber };
    if (!captions) { f.layout.captionZone = null; delete (f.typography as Record<string, unknown>).original; delete (f.typography as Record<string, unknown>).translation; }
    if (!comments) delete (f.features as Record<string, unknown>).comments;
    else if (!(f.features as Record<string, unknown>).comments) (f.features as Record<string, unknown>).comments = { gap: 16, scale: 1, maxWidth: 900, bottomMargin: 20, stackDefaults: { top: 1075, bottom: 20, gap: 10, scale: 0.85, riseSeconds: 0.22, overlap: 1, sideMargin: 30, topY: 450, topGap: 10, topOverlap: 1, topHeight: 550 } };
    if (!watermark) { delete (f.features as Record<string, unknown>).watermark; delete (f.scaffold as Record<string, unknown>).watermark; delete (f.defaultProps as Record<string, unknown>).watermark; }
    else { const wmDef = { text: handle, y: 0.375, size: 17, opacity: 0.45, weight: 500 }; (f.features as Record<string, unknown>).watermark = { default: wmDef, style: { fontFamily: { $fn: "latinFont" }, color: "#fff", letterSpacing: "0.02em", textShadow: "0 2px 12px rgba(0,0,0,0.6)" } }; f.scaffold.watermark = wmDef; }
    f.fixedStrings = Object.fromEntries(Object.entries(fixedTop).filter(([, v]) => v.trim()).map(([l, v]) => [l, { topCaption: v }]));
    if (f.fixedStrings.ja?.topCaption) { f.scaffold.topCaption = f.fixedStrings.ja.topCaption; f.defaultProps.topCaption = f.fixedStrings.ja.topCaption; }
    f.captionGuide = { pinnedComment: Object.fromEntries(f.languages.targets.map((l) => [l, pinned[l] || ""])), rulesFile: `formats/guides/${slug}.md`, imdbRating: false, recommendParagraph: false };
    f.publisher = { accounts: Object.fromEntries(f.languages.targets.map((l) => [l, { secret: `IG_${slug.toUpperCase()}_${l.toUpperCase()}` }])) };
    return f;
  }, [formats, base, slug, ko, handle, desc, targets, background, band, topSize, topWeight, topColor, transSize, transColor, captions, comments, watermark, videoNumber, pinned, fixedTop, nextPort]);

  useEffect(() => { if (built) setJsonText(JSON.stringify(built, null, 2)); }, [built]);

  const problems = useMemo(() => {
    if (!jsonText) return ["slug 를 입력하면 JSON 이 생성된다"];
    try {
      const obj = JSON.parse(jsonText);
      const r = formatSchema.safeParse(obj);
      if (!r.success) return r.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`);
      if (formats.some((f) => f.slug === r.data.slug)) return [`slug ${r.data.slug} 는 이미 있다`];
      return validateFormats([...formats.map((f) => formatSchema.parse(f)), r.data]);
    } catch (e) { return [String(e)]; }
  }, [jsonText, formats]);

  const commit = async () => {
    setBusy(true);
    try {
      const obj = formatSchema.parse(JSON.parse(jsonText));
      await putFile(`formats/${obj.slug}.json`, JSON.stringify(JSON.parse(jsonText), null, 2) + "\n", `feat(format): ${obj.displayName.ko} (${obj.slug}) 추가 (web)`);
      await putFile(`formats/guides/${obj.slug}.md`, `# ${obj.displayName.ko} (${obj.slug}) — 캡션 작성 규칙\n\n${guide.trim() || "(채널 성격 · 어체 · 3문단 구조 · 마무리 문구를 적을 것)"}\n`, `docs(format): ${obj.slug} 캡션 규칙 (web)`);
      toast(`커밋됨: formats/${obj.slug}.json — 맥에서 git pull 후 \`node tools/gen-formats.mjs\` (preview/render 가 자동 실행) → Composition "${compositionIdOf(obj.slug)}" 사용 가능`);
      nav("/formats");
    } catch (e) { toast(`실패: ${String(e)}`); }
    finally { setBusy(false); }
  };

  const toggleTarget = (l: string) => setTargets((t) => (t.includes(l) ? t.filter((x) => x !== l) : [...t, l]));
  const allTargets = [...new Set(["ja", ...targets])];

  return (
    <>
      <h2>새 포맷</h2>
      <div className="card">
        <h3>1. 기본</h3>
        <div className="form2">
          <div><label>레이아웃 프리셋 (복제 원본)</label><select value={base} onChange={(e) => setBase(e.target.value)}>{presets.map((p) => <option key={p.slug} value={p.slug}>{p.label}</option>)}</select></div>
          <div><label>slug (영소문자·숫자·_)</label><input value={slug} onChange={(e) => setSlug(e.target.value.replace(/[^a-z0-9_]/g, ""))} placeholder="goodquotes" /></div>
          <div><label>한국어 별명</label><input value={ko} onChange={(e) => setKo(e.target.value)} placeholder="굿쿼트" /></div>
          <div><label>인스타 핸들</label><input value={handle} onChange={(e) => setHandle(e.target.value)} /></div>
          <div style={{ gridColumn: "1 / -1" }}><label>설명</label><input value={desc} onChange={(e) => setDesc(e.target.value)} /></div>
        </div>
        <label>타깃 국가 (일본어는 항상 베이스)</label>
        <div className="row">{TRANS_LANGS.filter((l) => l !== "ko").map((l) => <label key={l} style={{ margin: 0 }}><input type="checkbox" style={{ width: "auto" }} checked={allTargets.includes(l)} disabled={l === "ja"} onChange={() => toggleTarget(l)} /> {LANG_LABEL[l].ko} ({l})</label>)}</div>
      </div>
      <div className="card">
        <h3>2. 레이아웃 · 타이포</h3>
        <div className="form2">
          <div><label>배경색</label><input value={background} onChange={(e) => setBackground(e.target.value)} /></div>
          <div><label>상·하단 밴드 높이 (symmetric)</label><input type="number" value={band} onChange={(e) => setBand(Number(e.target.value))} /></div>
          <div><label>상단 멘트 크기 (예 50pt / 60)</label><input value={topSize} onChange={(e) => setTopSize(e.target.value)} /></div>
          <div><label>상단 멘트 굵기</label><input type="number" value={topWeight} onChange={(e) => setTopWeight(Number(e.target.value))} /></div>
          <div><label>상단 멘트 색</label><input value={topColor} onChange={(e) => setTopColor(e.target.value)} /></div>
          <div><label>#번호</label><select value={videoNumber} onChange={(e) => setVideoNumber(e.target.value as "none" | "n" | "1000-n")}><option value="none">없음</option><option value="n">#영상번호</option><option value="1000-n">#(1000−번호)</option></select></div>
          <div><label>번역 자막 크기(px)</label><input type="number" value={transSize} onChange={(e) => setTransSize(Number(e.target.value))} disabled={!captions} /></div>
          <div><label>번역 자막 색</label><input value={transColor} onChange={(e) => setTransColor(e.target.value)} disabled={!captions} /></div>
        </div>
        <p className="muted">언어별 자막 폰트는 <code>$fn</code>(captionFont/topFontJpLead…) 가 언어에 따라 자동 분기한다 — 태국어 Thonburi, 대만 PingFang TC, 베트남어 SF/Inter. 세부는 커밋 전 JSON 에서 조정.</p>
        <div className="row">
          <label style={{ margin: 0 }}><input type="checkbox" style={{ width: "auto" }} checked={captions} onChange={(e) => setCaptions(e.target.checked)} /> 듀얼 자막</label>
          <label style={{ margin: 0 }}><input type="checkbox" style={{ width: "auto" }} checked={comments} onChange={(e) => setComments(e.target.checked)} /> 댓글 오버레이 (굿바이브식)</label>
          <label style={{ margin: 0 }}><input type="checkbox" style={{ width: "auto" }} checked={watermark} onChange={(e) => setWatermark(e.target.checked)} /> 핸들 워터마크</label>
        </div>
      </div>
      <div className="card">
        <h3>3. 고정 문구 · 고정댓글 · 캡션 규칙</h3>
        {allTargets.map((l) => (
          <div key={l} className="form2">
            <div><label>시리즈 고정 카피 ({l}) — 비우면 영상별 멘트</label><textarea value={fixedTop[l] || ""} onChange={(e) => setFixedTop({ ...fixedTop, [l]: e.target.value })} placeholder="**…** 굵게" /></div>
            <div><label>고정댓글 ({l}) — 게시 후 첫 댓글</label><textarea value={pinned[l] || ""} onChange={(e) => setPinned({ ...pinned, [l]: e.target.value })} /></div>
          </div>
        ))}
        <label>캡션 작성 규칙 (formats/guides/{slug || "<slug>"}.md — 채널 성격 · 어체 · 3문단 구조 · 마무리 문구)</label>
        <textarea value={guide} onChange={(e) => setGuide(e.target.value)} style={{ minHeight: 140 }} />
      </div>
      <div className="card">
        <h3>4. 확인 · 커밋</h3>
        <p className="muted">추가할 GitHub Secrets: <span className="mono">{allTargets.map((l) => `IG_${slug.toUpperCase()}_${l.toUpperCase()}`).join(", ") || "—"}</span>{secrets.length ? "" : " (PAT 로 시크릿 목록 조회 불가)"} · 프리뷰 포트 <b>{nextPort}</b> · Composition id <b>{slug ? compositionIdOf(slug) : "—"}</b></p>
        {problems.length ? <div className="err">{problems.map((p, i) => <div key={i}>✗ {p}</div>)}</div> : <div className="ok">✓ 스키마·교차 검증 통과</div>}
        <details style={{ marginTop: 10 }}><summary>JSON 직접 편집</summary><textarea className="mono" style={{ minHeight: 300 }} value={jsonText} onChange={(e) => setJsonText(e.target.value)} /></details>
        <div className="row" style={{ marginTop: 12 }}>
          <button className="primary" disabled={busy || problems.length > 0 || !s.pat} onClick={commit}>{busy ? "커밋 중…" : "formats/ 에 커밋"}</button>
          {!s.pat ? <span className="muted">커밋하려면 설정에 PAT</span> : null}
        </div>
      </div>
    </>
  );
};
