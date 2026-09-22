import React, { useEffect, useState } from "react";
import { NavLink, Route, Routes } from "react-router-dom";
import { useSettings } from "./lib/store";
import { Dashboard } from "./pages/Dashboard";
import { Schedule } from "./pages/Schedule";
import { Formats } from "./pages/Formats";
import { NewFormat } from "./pages/NewFormat";
import { Outputs } from "./pages/Outputs";
import { Followers } from "./pages/Followers";
import { Settings } from "./pages/Settings";

// 토스트(간단 알림) — 페이지들이 window 이벤트로 쏜다.
export function toast(msg: string) { window.dispatchEvent(new CustomEvent("toast", { detail: msg })); }

export const App: React.FC = () => {
  const s = useSettings();
  const [msg, setMsg] = useState<string | null>(null);
  useEffect(() => {
    const h = (e: Event) => { setMsg((e as CustomEvent).detail); setTimeout(() => setMsg(null), 6000); };
    window.addEventListener("toast", h);
    return () => window.removeEventListener("toast", h);
  }, []);
  return (
    <div className="app">
      <nav className="nav">
        <h1>🎬 Wayclip Shorts</h1>
        <NavLink to="/" end>대시보드</NavLink>
        <NavLink to="/schedule">스케줄</NavLink>
        <NavLink to="/formats">포맷</NavLink>
        <NavLink to="/outputs">결재본</NavLink>
        <NavLink to="/followers">팔로워</NavLink>
        <NavLink to="/settings">설정</NavLink>
        <div className="foot">{s.pat ? "🔑 PAT 연결됨" : "읽기 전용 — 설정에서 PAT 입력"}<br />편집·렌더는 맥 CLI(Claude Code)</div>
      </nav>
      <main>
        <Routes>
          <Route path="/" element={<Dashboard />} />
          <Route path="/schedule" element={<Schedule />} />
          <Route path="/formats" element={<Formats />} />
          <Route path="/formats/new" element={<NewFormat />} />
          <Route path="/outputs" element={<Outputs />} />
          <Route path="/followers" element={<Followers />} />
          <Route path="/settings" element={<Settings />} />
        </Routes>
      </main>
      {msg ? <div className="toast">{msg}</div> : null}
    </div>
  );
};
