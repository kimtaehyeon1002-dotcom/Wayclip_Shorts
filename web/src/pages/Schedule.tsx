import React, { useEffect, useMemo, useState } from "react";
import { loadSchedule, loadOutputIndex, loadFormats, type ScheduleEntry, type FormatJson, type OutputIndexEntry } from "../lib/data";
import { updateFile } from "../lib/gh";
import { useSettings } from "../lib/store";
import { fmtKST, isoToLocalKst, localToIsoKst, relTime } from "../lib/format";
import { PATHS } from "../config";
import { toast } from "../App";
import { scheduleId, stringifySchedule, validateEntry } from "@wayclip/shared/schedule.mjs";

type Draft = ScheduleEntry & { _new?: boolean };

export const Schedule: React.FC = () => {
  const s = useSettings();
  const [items, setItems] = useState<ScheduleEntry[]>([]);
  const [formats, setFormats] = useState<FormatJson[]>([]);
  const [idx, setIdx] = useState<OutputIndexEntry[]>([]);
  const [filter, setFilter] = useState("pending");
  const [edit, setEdit] = useState<Draft | null>(null);
  const [busy, setBusy] = useState(false);
  const reload = async () => { const [a, b, c] = await Promise.all([loadSchedule(), loadFormats(), loadOutputIndex()]); setItems(a); setFormats(b); setIdx(c); };
  useEffect(() => { reload().catch((e) => toast(String(e))); }, [s.pat]);

  const channels = formats.map((f) => f.slug);
  const langsOf = (ch: string) => formats.find((f) => f.slug === ch)?.languages.targets ?? ["ja"];
  const uploaded = useMemo(() => new Set(idx.map((o) => `${o.channel}|${o.lang}|${o.number}`)), [idx]);
  const shown = items.filter((e) => filter === "all" || (e.status || "pending") === filter).sort((a, b) => (b.publishAt || "").localeCompare(a.publishAt || ""));

  // 커밋: 최신본 위에 "이 항목 하나" 를 id 기준으로 upsert/delete — 퍼블리셔가 같은 파일을 만져도 충돌 없이 재적용된다.
  const commit = async (entry: Draft | null, deleteId?: string) => {
    setBusy(true);
    try {
      const id = deleteId ?? scheduleId(entry!);
      await updateFile(PATHS.schedule, (cur) => {
        const list: ScheduleEntry[] = cur ? JSON.parse(cur) : [];
        const i = list.findIndex((e) => scheduleId(e) === id);
        if (deleteId) { if (i >= 0) list.splice(i, 1); }
        else {
          const { _new, ...clean } = entry!;
          const next: ScheduleEntry = { project: "remotion", ...clean };
          if (!next.lang || next.lang === "ja") delete next.lang;
          const rec = next as unknown as Record<string, unknown>;
          Object.keys(rec).forEach((k) => { if (rec[k] === "" || rec[k] === undefined) delete rec[k]; });
          if (i >= 0) list[i] = { ...list[i], ...next }; else list.push(next);
        }
        return stringifySchedule(list);
      }, deleteId ? `schedule: ${id} 삭제 (web)` : `schedule: ${id} ${entry!._new ? "추가" : "수정"} (web)`);
      toast(deleteId ? `${id} 삭제됨` : `${id} 저장됨`);
      setEdit(null);
      await reload();
    } catch (e) { toast(`실패: ${String(e)}`); }
    finally { setBusy(false); }
  };

  const startNew = () => setEdit({ _new: true, project: "remotion", channel: channels[0] || "goodmovies", number: "", lang: "ja", publishAt: "", status: "pending" });

  return (
    <>
      <div className="row" style={{ justifyContent: "space-between" }}>
        <h2 style={{ margin: 0 }}>스케줄 <span className="muted" style={{ fontSize: 13 }}>publisher/schedule.json · {items.length}건</span></h2>
        <div className="row">
          <select value={filter} onChange={(e) => setFilter(e.target.value)} style={{ width: "auto" }}>
            <option value="pending">pending</option><option value="error">error</option><option value="published">published</option><option value="all">전체</option>
          </select>
          <button className="primary" onClick={startNew} disabled={!s.pat}>+ 예약 추가</button>
        </div>
      </div>

      {edit ? (
        <div className="card" style={{ marginTop: 14 }}>
          <b>{edit._new ? "새 예약" : `편집: ${scheduleId(edit)}`}</b>
          <div className="form2">
            <div><label>채널</label><select value={edit.channel} onChange={(e) => setEdit({ ...edit, channel: e.target.value, lang: "ja" })} disabled={!edit._new}>{channels.map((c) => <option key={c} value={c}>{c}</option>)}</select></div>
            <div><label>언어</label><select value={edit.lang || "ja"} onChange={(e) => setEdit({ ...edit, lang: e.target.value })} disabled={!edit._new}>{langsOf(edit.channel).map((l) => <option key={l} value={l}>{l}</option>)}</select></div>
            <div><label>영상 번호</label><input value={edit.number} onChange={(e) => setEdit({ ...edit, number: e.target.value.trim() })} disabled={!edit._new} placeholder="106" /></div>
            <div><label>게시 시각 (KST)</label><input type="datetime-local" value={isoToLocalKst(edit.publishAt)} onChange={(e) => setEdit({ ...edit, publishAt: localToIsoKst(e.target.value) })} /></div>
            <div><label>상태</label><select value={edit.status || "pending"} onChange={(e) => setEdit({ ...edit, status: e.target.value })}><option>pending</option><option>published</option><option>error</option><option>skipped</option></select></div>
            <div><label>체험판 릴스 (trial)</label><select value={String(edit.trial ?? "")} onChange={(e) => setEdit({ ...edit, trial: e.target.value || undefined })}><option value="">아니오</option><option value="MANUAL">MANUAL</option><option value="SS_PERFORMANCE">SS_PERFORMANCE</option></select></div>
            <div style={{ gridColumn: "1 / -1" }}><label>메모</label><input value={edit.note || ""} onChange={(e) => setEdit({ ...edit, note: e.target.value })} /></div>
            <div style={{ gridColumn: "1 / -1" }}><label>캡션 오버라이드 (비우면 R2 의 &lt;번호&gt;캡션.txt)</label><textarea value={edit.caption || ""} onChange={(e) => setEdit({ ...edit, caption: e.target.value })} /></div>
          </div>
          {(() => {
            const errs = validateEntry(edit, { channels, langsOf });
            const key = `${edit.channel}|${edit.lang || "ja"}|${edit.number}`;
            const up = uploaded.has(key);
            return (
              <div className="row" style={{ marginTop: 12 }}>
                <button className="primary" disabled={busy || errs.length > 0} onClick={() => commit(edit)}>{busy ? "저장 중…" : "커밋"}</button>
                <button onClick={() => setEdit(null)}>취소</button>
                {!edit._new ? <button className="danger" disabled={busy} onClick={() => { if (confirm(`${scheduleId(edit)} 를 스케줄에서 삭제할까요?`)) commit(null, scheduleId(edit)); }}>삭제</button> : null}
                {errs.length ? <span className="err">{errs.join(" · ")}</span> : !up ? <span className="warn">⚠ R2 에 결재본 없음 — 맥에서 upload-output 필요 (저장은 가능, 게시는 보류됨)</span> : <span className="ok">✓ 결재본 업로드됨</span>}
              </div>
            );
          })()}
        </div>
      ) : null}

      <div className="card" style={{ marginTop: 14 }}>
        <table>
          <thead><tr><th>항목</th><th>게시 시각</th><th>상태</th><th>결과</th><th>메모</th><th></th></tr></thead>
          <tbody>
            {shown.map((e) => (
              <tr key={scheduleId(e)}>
                <td className="mono">{e.channel}/{e.number}{e.lang && e.lang !== "ja" ? ` (${e.lang})` : ""}</td>
                <td>{fmtKST(e.publishAt)} <span className="muted">{(e.status || "pending") === "pending" ? relTime(e.publishAt) : ""}</span></td>
                <td><span className={"chip " + (e.status || "pending")}>{e.status || "pending"}</span></td>
                <td className="mono muted">{e.mediaId ? `media ${e.mediaId}` : ""}{e.error ? <span className="err">{e.error}</span> : ""}</td>
                <td className="muted">{e.note || ""}</td>
                <td><button onClick={() => setEdit({ ...e })} disabled={!s.pat}>편집</button></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
};
