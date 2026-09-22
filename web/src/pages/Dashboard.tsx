import React, { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { loadSchedule, loadOutputIndex, loadFormats, type ScheduleEntry, type OutputIndexEntry, type FormatJson } from "../lib/data";
import { dispatchWorkflow, listRuns, type WorkflowRun } from "../lib/gh";
import { useSettings } from "../lib/store";
import { fmtKST, relTime } from "../lib/format";
import { PATHS, REPO } from "../config";
import { toast } from "../App";
import { scheduleId, isDue } from "@wayclip/shared/schedule.mjs";

export const Dashboard: React.FC = () => {
  const s = useSettings();
  const [sched, setSched] = useState<ScheduleEntry[]>([]);
  const [idx, setIdx] = useState<OutputIndexEntry[]>([]);
  const [formats, setFormats] = useState<FormatJson[]>([]);
  const [runs, setRuns] = useState<WorkflowRun[]>([]);
  const [err, setErr] = useState("");
  const refresh = async () => {
    try {
      const [a, b, c] = await Promise.all([loadSchedule(), loadOutputIndex(), loadFormats()]);
      setSched(a); setIdx(b); setFormats(c);
      setRuns(await listRuns(PATHS.publishWorkflow).catch(() => []));
    } catch (e) { setErr(String(e)); }
  };
  useEffect(() => { refresh(); }, [s.pat]);

  const pending = sched.filter((e) => (e.status || "pending") === "pending");
  const due = pending.filter((e) => isDue(e));
  const errors = sched.filter((e) => e.status === "error");
  const next = pending.filter((e) => e.publishAt).sort((a, b) => a.publishAt!.localeCompare(b.publishAt!))[0];
  const uploaded = new Set(idx.map((o) => `${o.channel}|${o.lang}|${o.number}`));
  const notUploaded = pending.filter((e) => !uploaded.has(`${e.channel}|${e.lang || "ja"}|${e.number}`));

  const runNow = async (dry: boolean) => {
    try { await dispatchWorkflow(PATHS.publishWorkflow, { dry_run: dry }); toast(dry ? "점검(dry-run) 워크플로 실행 요청됨" : "게시 워크플로 실행 요청됨 — 1분 뒤 새로고침"); }
    catch (e) { toast(`실패: ${String(e)}`); }
  };

  return (
    <>
      <h2>대시보드</h2>
      {err ? <div className="card err">{err}</div> : null}
      <div className="grid">
        <div className="card"><div className="muted">예약 대기</div><div className="kpi">{pending.length}<small>{due.length ? `그중 ${due.length}건 시각 지남` : ""}</small></div></div>
        <div className="card"><div className="muted">다음 게시</div><div className="kpi" style={{ fontSize: 18 }}>{next ? `${next.channel}/${next.number}` : "—"}<small>{next ? `${fmtKST(next.publishAt)} (${relTime(next.publishAt)})` : ""}</small></div></div>
        <div className="card"><div className="muted">게시 오류</div><div className={"kpi " + (errors.length ? "err" : "")}>{errors.length}</div></div>
        <div className="card"><div className="muted">R2 결재본</div><div className="kpi">{idx.length}<small>{notUploaded.length ? `대기 중 ${notUploaded.length}건 미업로드` : "대기 항목 모두 업로드됨"}</small></div></div>
      </div>

      {notUploaded.length ? (
        <div className="card">
          <b className="warn">⚠ R2 에 없는 대기 항목</b> — 맥에서 <code className="mono">node tools/upload-output.mjs &lt;채널&gt; &lt;번호&gt;</code> 를 돌려야 게시된다:
          <div className="mono" style={{ marginTop: 6 }}>{notUploaded.map((e) => `${e.channel}/${e.number}${e.lang && e.lang !== "ja" ? "/" + e.lang : ""}`).join("  ·  ")}</div>
        </div>
      ) : null}

      <div className="card">
        <div className="row" style={{ justifyContent: "space-between" }}>
          <h3 style={{ margin: 0 }}>게시 워크플로 (publish-due.yml, 10분마다)</h3>
          <div className="row">
            <button onClick={() => runNow(true)} disabled={!s.pat}>점검만 실행</button>
            <button className="primary" onClick={() => runNow(false)} disabled={!s.pat}>지금 게시 실행</button>
            <a className="btn" href={`https://github.com/${REPO.owner}/${REPO.name}/actions/workflows/${PATHS.publishWorkflow}`} target="_blank" rel="noreferrer">Actions ↗</a>
          </div>
        </div>
        <table style={{ marginTop: 10 }}>
          <thead><tr><th>시각</th><th>트리거</th><th>상태</th><th></th></tr></thead>
          <tbody>
            {runs.length ? runs.map((r) => (
              <tr key={r.id}><td>{fmtKST(r.created_at)}</td><td>{r.event}</td>
                <td><span className={"chip " + (r.conclusion === "success" ? "published" : r.conclusion === "failure" ? "error" : "publishing")}>{r.conclusion || r.status}</span></td>
                <td><a href={r.html_url} target="_blank" rel="noreferrer">로그</a></td></tr>
            )) : <tr><td colSpan={4} className="muted">{s.pat ? "실행 이력 없음 (워크플로 파일이 아직 안 올라갔거나 첫 실행 전)" : "PAT 를 설정하면 실행 이력이 보인다"}</td></tr>}
          </tbody>
        </table>
      </div>

      <div className="card">
        <div className="row" style={{ justifyContent: "space-between" }}><h3 style={{ margin: 0 }}>대기 중인 예약</h3><Link to="/schedule">스케줄 편집 →</Link></div>
        <table style={{ marginTop: 10 }}>
          <thead><tr><th>항목</th><th>게시 시각 (KST)</th><th>상태</th><th>R2</th><th>비고</th></tr></thead>
          <tbody>
            {pending.slice(0, 20).map((e) => (
              <tr key={scheduleId(e)}>
                <td className="mono">{e.channel}/{e.number}{e.lang && e.lang !== "ja" ? ` (${e.lang})` : ""}</td>
                <td>{fmtKST(e.publishAt)} <span className="muted">{relTime(e.publishAt)}</span></td>
                <td><span className="chip pending">{isDue(e) ? "due" : "pending"}</span></td>
                <td>{uploaded.has(`${e.channel}|${e.lang || "ja"}|${e.number}`) ? <span className="ok">✓</span> : <span className="warn">미업로드</span>}</td>
                <td className="muted">{e.note || ""}</td>
              </tr>
            ))}
            {!pending.length ? <tr><td colSpan={5} className="muted">대기 항목 없음</td></tr> : null}
          </tbody>
        </table>
      </div>

      <div className="card">
        <h3 style={{ margin: 0 }}>채널(포맷) {formats.length}개</h3>
        <div className="row" style={{ marginTop: 8 }}>
          {formats.map((f) => <span key={f.slug} className="chip">{f.displayName.ko} · {f.slug} · {f.languages.targets.join("/")}</span>)}
        </div>
      </div>
    </>
  );
};
