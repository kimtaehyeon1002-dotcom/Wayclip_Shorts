// 브라우저에만 남는 설정 (PAT, R2 키). 1인용 도구 — localStorage. 서버로 나가는 곳은 GitHub API / R2 뿐.
import { useSyncExternalStore } from "react";

export interface Settings {
  pat: string;              // GitHub fine-grained PAT (이 레포: Contents RW, Actions RW)
  r2AccountId: string;      // (선택) 결재본 미리보기용 presign
  r2AccessKeyId: string;
  r2SecretAccessKey: string;
  r2Bucket: string;
}
const KEY = "wayclip.settings.v1";
const DEFAULTS: Settings = { pat: "", r2AccountId: "", r2AccessKeyId: "", r2SecretAccessKey: "", r2Bucket: "shorts-publish" };
let cache: Settings | null = null;
const listeners = new Set<() => void>();

export function getSettings(): Settings {
  if (cache) return cache;
  try { cache = { ...DEFAULTS, ...JSON.parse(localStorage.getItem(KEY) || "{}") }; } catch { cache = { ...DEFAULTS }; }
  return cache;
}
export function setSettings(patch: Partial<Settings>) {
  cache = { ...getSettings(), ...patch };
  try { localStorage.setItem(KEY, JSON.stringify(cache)); } catch { /* private mode 등 */ }
  listeners.forEach((l) => l());
}
export function useSettings(): Settings {
  return useSyncExternalStore((l) => { listeners.add(l); return () => listeners.delete(l); }, getSettings, getSettings);
}
