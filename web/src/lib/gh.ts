// GitHub REST — 읽기(공개 레포라 PAT 없이도 raw 로 읽힘) + 쓰기(Contents API, sha 충돌 시 재시도).
import { REPO } from "../config";
import { getSettings } from "./store";

const API = "https://api.github.com";
const b64encode = (s: string) => btoa(String.fromCharCode(...new TextEncoder().encode(s)));
const b64decode = (s: string) => new TextDecoder().decode(Uint8Array.from(atob(s.replace(/\n/g, "")), (c) => c.charCodeAt(0)));

function headers(json = true): HeadersInit {
  const h: Record<string, string> = { Accept: "application/vnd.github+json", "X-GitHub-Api-Version": "2022-11-28" };
  const { pat } = getSettings();
  if (pat) h.Authorization = `Bearer ${pat}`;
  if (json) h["Content-Type"] = "application/json";
  return h;
}
async function api<T>(path: string, init: RequestInit = {}): Promise<T> {
  const res = await fetch(`${API}${path}`, { ...init, headers: { ...headers(), ...(init.headers || {}) } });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`GitHub ${init.method || "GET"} ${path} → ${res.status}: ${body.slice(0, 200)}`);
  }
  return res.status === 204 ? (undefined as T) : ((await res.json()) as T);
}

export const repoPath = (p: string) => `/repos/${REPO.owner}/${REPO.name}/${p}`;

export interface FileResult { text: string; sha: string }
/** 파일 + sha (쓰기 전엔 반드시 이걸로 읽어 sha 를 확보). */
export async function getFile(path: string): Promise<FileResult> {
  const r = await api<{ content: string; sha: string; encoding: string }>(repoPath(`contents/${path}?ref=${REPO.branch}`));
  return { text: b64decode(r.content), sha: r.sha };
}
/** 공개 raw 읽기 (PAT 없이도 됨, 최대 ~5분 캐시). */
export async function getRaw(path: string): Promise<string> {
  const res = await fetch(`https://raw.githubusercontent.com/${REPO.owner}/${REPO.name}/${REPO.branch}/${path}?t=${Date.now()}`);
  if (!res.ok) throw new Error(`raw ${path} → ${res.status}`);
  return res.text();
}
export async function getJson<T>(path: string): Promise<T> {
  const { pat } = getSettings();
  const text = pat ? (await getFile(path)).text : await getRaw(path);
  return JSON.parse(text) as T;
}
export async function listDir(path: string): Promise<{ name: string; path: string; sha: string; type: string }[]> {
  return api(repoPath(`contents/${path}?ref=${REPO.branch}`));
}

/** 파일 쓰기. sha 가 없으면 신규. 409/422(sha 불일치) 면 호출부가 다시 읽어 재시도한다. */
export async function putFile(path: string, text: string, message: string, sha?: string): Promise<{ sha: string; commit: string }> {
  const r = await api<{ content: { sha: string }; commit: { sha: string } }>(repoPath(`contents/${path}`), {
    method: "PUT",
    body: JSON.stringify({ message, content: b64encode(text), sha, branch: REPO.branch }),
  });
  return { sha: r.content.sha, commit: r.commit.sha };
}

/**
 * 읽기-수정-쓰기 with 재시도: 최신본을 읽어 `edit` 를 적용해 커밋. 충돌하면 다시 읽어 3회까지.
 * edit 은 순수 함수여야 한다 (같은 편집을 최신본 위에 재적용).
 */
export async function updateFile(path: string, edit: (current: string | null) => string, message: string, tries = 3) {
  let lastErr: unknown;
  for (let i = 0; i < tries; i++) {
    let cur: FileResult | null = null;
    try { cur = await getFile(path); } catch (e) { if (!String(e).includes("404")) throw e; }
    const next = edit(cur?.text ?? null);
    if (cur && next === cur.text) return { sha: cur.sha, commit: null, unchanged: true };
    try {
      return { ...(await putFile(path, next, message, cur?.sha)), unchanged: false };
    } catch (e) {
      lastErr = e;
      if (!/409|422/.test(String(e))) throw e;
    }
  }
  throw lastErr;
}

// ── Actions ──
export interface WorkflowRun { id: number; status: string; conclusion: string | null; created_at: string; html_url: string; event: string; display_title: string }
export async function listRuns(workflowFile: string, perPage = 10): Promise<WorkflowRun[]> {
  const r = await api<{ workflow_runs: WorkflowRun[] }>(repoPath(`actions/workflows/${workflowFile}/runs?per_page=${perPage}`));
  return r.workflow_runs;
}
export async function dispatchWorkflow(workflowFile: string, inputs: Record<string, string | boolean> = {}) {
  await api(repoPath(`actions/workflows/${workflowFile}/dispatches`), { method: "POST", body: JSON.stringify({ ref: REPO.branch, inputs }) });
}
export async function whoAmI(): Promise<{ login: string }> {
  return api("/user");
}
/** 시크릿 이름 목록 (값은 안 옴) — 포맷 페이지에서 "추가해야 할 시크릿" 표시용. */
export async function listSecretNames(): Promise<string[]> {
  try {
    const r = await api<{ secrets: { name: string }[] }>(repoPath("actions/secrets?per_page=100"));
    return r.secrets.map((s) => s.name);
  } catch { return []; }
}
