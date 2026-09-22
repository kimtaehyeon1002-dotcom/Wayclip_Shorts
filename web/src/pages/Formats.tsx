import React, { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { loadFormats, type FormatJson } from "../lib/data";
import { listSecretNames } from "../lib/gh";
import { useSettings } from "../lib/store";
import { toast } from "../App";
import { REPO } from "../config";

export const Formats: React.FC = () => {
  const s = useSettings();
  const [formats, setFormats] = useState<FormatJson[]>([]);
  const [secrets, setSecrets] = useState<string[] | null>(null);
  const [open, setOpen] = useState<string | null>(null);
  useEffect(() => {
    loadFormats().then(setFormats).catch((e) => toast(String(e)));
    if (s.pat) listSecretNames().then(setSecrets);
  }, [s.pat]);
  return (
    <>
      <div className="row" style={{ justifyContent: "space-between" }}>
        <h2 style={{ margin: 0 }}>포맷(채널) <span className="muted" style={{ fontSize: 13 }}>formats/&lt;slug&gt;.json 이 진실</span></h2>
        <Link className="btn" to="/formats/new">+ 새 포맷</Link>
      </div>
      <p className="muted">레이아웃·타이포·타깃 언어·댓글 오버레이·고정댓글·캡션 규칙·IG 계정 슬롯이 전부 JSON 한 파일. 기존 5개는 양산 중이라 <b>값 변경 금지</b>(픽셀 패리티 검사 대상).</p>
      <div className="grid">
        {formats.map((f) => {
          const missing = f.languages.targets.map((l) => f.publisher.accounts[l]?.secret).filter((n) => n && secrets && !secrets.includes(n));
          return (
            <div className="card" key={f.slug}>
              <div className="row" style={{ justifyContent: "space-between" }}>
                <b>{f.displayName.ko} <span className="muted mono">{f.slug}</span></b>
                <span className="chip">:{f.previewPort}</span>
              </div>
              <div className="muted" style={{ margin: "6px 0" }}>{f.description}</div>
              <div className="row" style={{ gap: 6 }}>
                <span className="chip">{f.handle}</span>
                <span className="chip">{f.layout.mode}{f.layout.band ? ` ${f.layout.band}` : ""} · {f.layout.background}</span>
                <span className="chip">{f.features.captions ? "자막" : "자막 없음"}</span>
                {f.features.comments ? <span className="chip">댓글 오버레이</span> : null}
                {f.features.watermark ? <span className="chip">워터마크</span> : null}
                {f.features.warnPill ? <span className="chip">경고박스</span> : null}
                <span className="chip">#{f.features.videoNumber}</span>
              </div>
              <div style={{ marginTop: 8 }}>🌏 {f.languages.targets.join(" / ")}</div>
              {secrets ? (
                <div style={{ marginTop: 6 }}>
                  {f.languages.targets.map((l) => { const n = f.publisher.accounts[l]?.secret; const ok = n && secrets.includes(n); return <span key={l} className={"chip " + (ok ? "published" : "pending")} style={{ marginRight: 4 }}>{l}: {ok ? "IG 연결" : "시크릿 없음"}</span>; })}
                  {missing.length ? <div className="muted mono" style={{ marginTop: 4 }}>추가할 시크릿: {missing.join(", ")}</div> : null}
                </div>
              ) : null}
              <div className="row" style={{ marginTop: 10 }}>
                <button onClick={() => setOpen(open === f.slug ? null : f.slug)}>{open === f.slug ? "닫기" : "고정댓글·JSON 보기"}</button>
                <a href={`https://github.com/${REPO.owner}/${REPO.name}/blob/${REPO.branch}/formats/${f.slug}.json`} target="_blank" rel="noreferrer">GitHub ↗</a>
                <a href={`https://github.com/${REPO.owner}/${REPO.name}/blob/${REPO.branch}/${f.captionGuide.rulesFile}`} target="_blank" rel="noreferrer">캡션 규칙 ↗</a>
              </div>
              {open === f.slug ? (
                <div style={{ marginTop: 10 }}>
                  {Object.entries(f.captionGuide.pinnedComment).map(([l, t]) => <div key={l} style={{ marginBottom: 6 }}><span className="chip">{l}</span> <span style={{ fontSize: 13 }}>{t}</span></div>)}
                  <details><summary>formats/{f.slug}.json</summary><pre>{JSON.stringify(f, null, 2)}</pre></details>
                </div>
              ) : null}
            </div>
          );
        })}
      </div>
    </>
  );
};
