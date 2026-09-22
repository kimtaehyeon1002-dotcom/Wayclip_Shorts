// 대시보드 쪽 시간/표시 유틸.
import { KST } from "../config";

export function fmtKST(iso?: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return new Intl.DateTimeFormat("ko-KR", { timeZone: KST, month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hour12: false }).format(d);
}
/** KST 로컬 datetime-local 값 → ISO(+09:00) */
export function localToIsoKst(v: string): string {
  return v ? `${v}:00+09:00` : "";
}
/** ISO → datetime-local 입력값 (KST 기준) */
export function isoToLocalKst(iso?: string): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const p = new Intl.DateTimeFormat("sv-SE", { timeZone: KST, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hour12: false }).formatToParts(d);
  const g = (t: string) => p.find((x) => x.type === t)?.value ?? "";
  return `${g("year")}-${g("month")}-${g("day")}T${g("hour")}:${g("minute")}`;
}
export function relTime(iso?: string): string {
  if (!iso) return "";
  const ms = new Date(iso).getTime() - Date.now();
  const abs = Math.abs(ms);
  const unit = abs < 3600e3 ? [Math.round(abs / 60e3), "분"] : abs < 86400e3 ? [Math.round(abs / 3600e3), "시간"] : [Math.round(abs / 86400e3), "일"];
  return ms < 0 ? `${unit[0]}${unit[1]} 전` : `${unit[0]}${unit[1]} 후`;
}
export const fmtBytes = (n?: number) => (n == null ? "—" : n > 1e9 ? `${(n / 1e9).toFixed(2)} GB` : `${(n / 1e6).toFixed(1)} MB`);
