import React, { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { loadOutputIndex, type OutputIndexEntry } from "../lib/data";
import { presignGet, r2Configured } from "../lib/r2";
import { useSettings } from "../lib/store";
import { fmtBytes, fmtKST } from "../lib/format";
import { toast } from "../App";

export const Outputs: React.FC = () => {
  const s = useSettings();
  const [idx, setIdx] = useState<OutputIndexEntry[]>([]);
  const [ch, setCh] = useState("");
  const [lang, setLang] = useState("");
  const [open, setOpen] = useState<{ key: string; url: string; caption?: string } | null>(null);
  useEffect(() => { loadOutputIndex().then(setIdx).catch((e) => toast(String(e))); }, [s.pat]);
  const channels = [...new Set(idx.map((o) => o.channel))];
  const langs = [...new Set(idx.map((o) => o.lang))];
  const shown = idx.filter((o) => (!ch || o.channel === ch) && (!lang || o.lang === lang)).sort((a, b) => (b.uploadedAt || "").localeCompare(a.uploadedAt || ""));
  const play = async (o: OutputIndexEntry) => {
    try {
      const url = await presignGet(o.key);
      let caption: string | undefined;
      try { caption = await (await fetch(await presignGet(o.captionKey))).text(); } catch { /* CORS 등 — 캡션은 선택 */ }
      setOpen({ key: o.key, url, caption });
    } catch (e) { toast(String(e)); }
  };
  return (
    <>
      <h2>결재본 <span className="muted" style={{ fontSize: 13 }}>output-index.json · R2 에 올라간 {idx.length}편</span></h2>
      <div className="row">
        <select value={ch} onChange={(e) => setCh(e.target.value)} style={{ width: "auto" }}><option value="">모든 채널</option>{channels.map((c) => <option key={c}>{c}</option>)}</select>
        <select value={lang} onChange={(e) => setLang(e.target.value)} style={{ width: "auto" }}><option value="">모든 언어</option>{langs.map((l) => <option key={l}>{l}</option>)}</select>
        {!r2Configured() ? <span className="muted">재생하려면 <Link to="/settings">설정</Link>에 R2 키 입력</span> : null}
      </div>
      {open ? (
        <div className="card" style={{ marginTop: 14 }}>
          <div className="row" style={{ alignItems: "flex-start" }}>
            <video src={open.url} controls autoPlay />
            <div style={{ flex: 1, minWidth: 280 }}>
              <div className="mono muted">{open.key}</div>
              {open.caption ? <pre style={{ whiteSpace: "pre-wrap", maxHeight: 420 }}>{open.caption}</pre> : <p className="muted">캡션 txt 를 불러오지 못함 (버킷 CORS 미설정이면 정상 — mp4 재생엔 영향 없음)</p>}
              <button onClick={() => setOpen(null)}>닫기</button>
            </div>
          </div>
        </div>
      ) : null}
      <div className="card" style={{ marginTop: 14 }}>
        <table>
          <thead><tr><th>채널</th><th>언어</th><th>번호</th><th>소재</th><th>길이</th><th>크기</th><th>고정댓글</th><th>업로드</th><th></th></tr></thead>
          <tbody>
            {shown.map((o) => (
              <tr key={o.key}>
                <td>{o.channel}</td><td>{o.lang}</td><td className="mono">{o.number}</td>
                <td>{o.subject || <span className="muted">{o.header}</span>}{o.captionProblems?.length ? <span className="err"> ⚠ {o.captionProblems.join(", ")}</span> : null}</td>
                <td>{o.durationSec != null ? `${o.durationSec}s` : "—"}</td><td>{fmtBytes(o.size)}</td>
                <td>{o.hasPinned ? "✓" : <span className="warn">없음</span>}</td><td className="muted">{fmtKST(o.uploadedAt)}</td>
                <td><button onClick={() => play(o)} disabled={!r2Configured()}>재생</button></td>
              </tr>
            ))}
            {!shown.length ? <tr><td colSpan={9} className="muted">아직 업로드된 결재본이 없다 — 맥에서 <code>node tools/upload-output.mjs --all</code></td></tr> : null}
          </tbody>
        </table>
      </div>
    </>
  );
};
