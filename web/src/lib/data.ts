// 레포 데이터 로더 (스케줄·포맷·결재본 인덱스) — 페이지들이 공유.
import { PATHS } from "../config";
import { getJson, listDir, getRaw, getFile } from "./gh";
import { getSettings } from "./store";

export interface ScheduleEntry {
  id?: string; project?: string; channel: string; number: string; lang?: string;
  publishAt?: string; status?: string; mediaId?: string; commentId?: string; publishedAt?: string;
  error?: string; note?: string; caption?: string; firstComment?: string; trial?: string | boolean; shareToFeed?: boolean; file?: string;
}
export interface FormatJson {
  slug: string; order?: number; displayName: { ko: string }; description?: string; previewPort: number; handle: string;
  languages: { base: string; targets: string[]; originalDefault: string; originalAllowed: string[] };
  layout: Record<string, unknown> & { mode: string; background: string; band?: number };
  typography: Record<string, unknown>; features: Record<string, unknown> & { captions: boolean; videoNumber?: string };
  defaultProps: Record<string, unknown>; scaffold: Record<string, unknown>;
  fixedStrings: Record<string, Record<string, string>>;
  captionGuide: { pinnedComment: Record<string, string>; rulesFile: string; imdbRating?: boolean; recommendParagraph?: boolean };
  publisher: { accounts: Record<string, { secret: string }> };
}
export interface OutputIndexEntry {
  channel: string; lang: string; number: string; key: string; captionKey: string; size: number; durationSec: number | null;
  header: string; subject: string | null; hasPinned: boolean; captionProblems: string[]; md5?: string; uploadedAt?: string;
}

export const loadSchedule = () => getJson<ScheduleEntry[]>(PATHS.schedule);
export const loadOutputIndex = async () => { try { return await getJson<OutputIndexEntry[]>(PATHS.outputIndex); } catch { return [] as OutputIndexEntry[]; } };

export async function loadFormats(): Promise<FormatJson[]> {
  const files = (await listDir(PATHS.formatsDir)).filter((f) => f.type === "file" && f.name.endsWith(".json"));
  const out = await Promise.all(files.map(async (f) => {
    const text = getSettings().pat ? (await getFile(f.path)).text : await getRaw(f.path);
    return JSON.parse(text) as FormatJson;
  }));
  return out.sort((a, b) => (a.order ?? 999) - (b.order ?? 999) || a.slug.localeCompare(b.slug));
}
