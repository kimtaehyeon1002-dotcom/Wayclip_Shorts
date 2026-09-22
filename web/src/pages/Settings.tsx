import React, { useState } from "react";
import { setSettings, useSettings } from "../lib/store";
import { whoAmI, listSecretNames } from "../lib/gh";
import { REPO } from "../config";

export const Settings: React.FC = () => {
  const s = useSettings();
  const [state, setState] = useState<string>("");
  const test = async () => {
    setState("확인 중…");
    try {
      const me = await whoAmI();
      const secrets = await listSecretNames();
      setState(`✓ ${me.login} 로 인증됨. Actions 시크릿 ${secrets.length}개 조회 가능${secrets.length ? " (" + secrets.join(", ") + ")" : ""}`);
    } catch (e) { setState(`✗ ${String(e)}`); }
  };
  return (
    <>
      <h2>설정</h2>
      <div className="card">
        <h3>GitHub PAT</h3>
        <p className="muted">
          fine-grained 토큰, 레포 <b>{REPO.owner}/{REPO.name}</b> 만: <b>Contents: Read and write</b>, <b>Actions: Read and write</b>, Metadata: Read.
          이 브라우저의 localStorage 에만 저장된다 (서버 없음). 스케줄 편집·포맷 추가·워크플로 실행에 필요. 읽기만 하면 없어도 된다.
        </p>
        <label>Personal access token</label>
        <input type="password" value={s.pat} onChange={(e) => setSettings({ pat: e.target.value.trim() })} placeholder="github_pat_…" />
        <div className="row" style={{ marginTop: 10 }}>
          <button onClick={test}>토큰 테스트</button>
          <span className={state.startsWith("✗") ? "err" : "ok"}>{state}</span>
        </div>
      </div>
      <div className="card">
        <h3>R2 (선택 — 결재본 미리보기)</h3>
        <p className="muted">결재본 mp4 는 프라이빗 R2 버킷에 있다. 여기 키를 넣으면 브라우저가 1시간짜리 presigned URL 을 만들어 바로 재생한다. 없으면 목록/캡션만.</p>
        <div className="form2">
          <div><label>Account ID</label><input value={s.r2AccountId} onChange={(e) => setSettings({ r2AccountId: e.target.value.trim() })} /></div>
          <div><label>Bucket</label><input value={s.r2Bucket} onChange={(e) => setSettings({ r2Bucket: e.target.value.trim() })} /></div>
          <div><label>Access Key ID</label><input value={s.r2AccessKeyId} onChange={(e) => setSettings({ r2AccessKeyId: e.target.value.trim() })} /></div>
          <div><label>Secret Access Key</label><input type="password" value={s.r2SecretAccessKey} onChange={(e) => setSettings({ r2SecretAccessKey: e.target.value.trim() })} /></div>
        </div>
      </div>
      <div className="card">
        <h3>역할 분담</h3>
        <ul className="muted">
          <li><b>맥 CLI (Claude Code)</b>: 스캐폴드 → STT → 자막/번역 → 프리뷰 승인 → 렌더 → 캡션 txt → <code>tools/upload-output.mjs</code></li>
          <li><b>GitHub Actions</b>: 10분마다 <code>publish-due.yml</code> 이 R2 결재본을 인스타에 게시하고 <code>publisher/schedule.json</code> 상태를 커밋</li>
          <li><b>이 대시보드</b>: 스케줄/포맷/결재본 조회·편집 (GitHub API 로 커밋), 워크플로 수동 실행</li>
        </ul>
      </div>
    </>
  );
};
