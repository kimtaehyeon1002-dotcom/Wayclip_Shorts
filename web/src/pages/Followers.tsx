import React, { useEffect, useState } from "react";
import initial from "../data/followers.json";
import { getJson, updateFile } from "../lib/gh";
import { useSettings } from "../lib/store";
import { PATHS } from "../config";
import { toast } from "../App";

type Data = typeof initial;

// 예전 follower-growth.html 의 SVG 차트 포팅. 데이터는 web/src/data/followers.json (레포에 커밋 → 페이지도 갱신).
export const Followers: React.FC = () => {
  const s = useSettings();
  const [data, setData] = useState<Data>(initial);
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState("");
  useEffect(() => { getJson<Data>(PATHS.followers).then(setData).catch(() => {}); }, [s.pat]);

  const W = 900, H = 380, P = { l: 50, r: 20, t: 20, b: 40 };
  const t0 = new Date(data.dates[0]).getTime();
  const days = data.dates.map((d) => Math.round((new Date(d).getTime() - t0) / 86400e3));
  const maxDay = Math.max(...days, 1);
  const all = data.channels.flatMap((c) => c.data);
  const lo = Math.floor(Math.min(...all) * 2) / 2, hi = Math.ceil(Math.max(...all) * 2) / 2;
  const x = (d: number) => P.l + (d / maxDay) * (W - P.l - P.r);
  const y = (v: number) => H - P.b - ((v - lo) / (hi - lo || 1)) * (H - P.t - P.b);
  const ticks = Array.from({ length: 6 }, (_, i) => lo + ((hi - lo) * i) / 5);

  const save = async () => {
    try {
      const parsed = JSON.parse(text) as Data;
      await updateFile(PATHS.followers, () => JSON.stringify(parsed, null, 2) + "\n", "followers: 데이터 갱신 (web)");
      setData(parsed); setEditing(false); toast("커밋됨 — Pages 재배포 후 반영");
    } catch (e) { toast(`실패: ${String(e)}`); }
  };

  return (
    <>
      <h2>📈 채널별 팔로워 성장세 <span className="muted" style={{ fontSize: 13 }}>단위: {data.unit}</span></h2>
      <div className="card">
        <svg viewBox={`0 0 ${W} ${H}`} width="100%" style={{ maxWidth: W }}>
          {ticks.map((v) => <g key={v}><line x1={P.l} x2={W - P.r} y1={y(v)} y2={y(v)} stroke="#2a2f3a" /><text x={P.l - 8} y={y(v) + 4} fill="#8b93a7" fontSize="11" textAnchor="end">{v.toFixed(1)}</text></g>)}
          {days.map((d, i) => <text key={i} x={x(d)} y={H - P.b + 16} fill="#8b93a7" fontSize="10" textAnchor="middle">{data.dates[i].slice(5).replace("-", "/")}</text>)}
          {data.channels.map((c) => (
            <g key={c.slug}>
              <polyline fill="none" stroke={c.color} strokeWidth="2.5" points={c.data.map((v, i) => `${x(days[i])},${y(v)}`).join(" ")} />
              {c.data.map((v, i) => <circle key={i} cx={x(days[i])} cy={y(v)} r="3" fill={c.color} />)}
              <text x={x(days[days.length - 1]) + 6} y={y(c.data[c.data.length - 1]) + 4} fill={c.color} fontSize="12">{c.ko} {c.data[c.data.length - 1]}</text>
            </g>
          ))}
        </svg>
        <p className="muted">{data.note}</p>
        {!editing ? <button onClick={() => { setText(JSON.stringify(data, null, 2)); setEditing(true); }} disabled={!s.pat}>데이터 편집 (JSON)</button> : (
          <>
            <textarea className="mono" style={{ minHeight: 260 }} value={text} onChange={(e) => setText(e.target.value)} />
            <div className="row" style={{ marginTop: 8 }}><button className="primary" onClick={save}>커밋</button><button onClick={() => setEditing(false)}>취소</button></div>
          </>
        )}
      </div>
    </>
  );
};
