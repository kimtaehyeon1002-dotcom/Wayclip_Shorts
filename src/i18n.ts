// 채널 UI 에 박히는 고정 문자열의 언어별 표기.
//
// props 의 `mediaKind` 는 **일본어 enum 값을 안정 키로 그대로** 둔다 (기존 props.json 무파손).
// 화면 표시만 여기서 언어별로 매핑한다.
import type { Lang } from "./props";

type MediaKind = "映画" | "ドラマ" | "アニメ" | "ドキュメンタリー" | "短編";

const MEDIA_LABEL: Record<MediaKind, Partial<Record<Lang, string>>> = {
  映画: { ja: "映画", tw: "電影", th: "ภาพยนตร์", vi: "Phim điện ảnh", ko: "영화", en: "Film" },
  ドラマ: { ja: "ドラマ", tw: "影集", th: "ซีรีส์", vi: "Phim truyền hình", ko: "드라마", en: "Series" },
  アニメ: { ja: "アニメ", tw: "動畫", th: "อนิเมะ", vi: "Anime", ko: "애니메이션", en: "Anime" },
  ドキュメンタリー: {
    ja: "ドキュメンタリー",
    tw: "紀錄片",
    th: "สารคดี",
    vi: "Phim tài liệu",
    ko: "다큐멘터리",
    en: "Documentary",
  },
  短編: { ja: "短編", tw: "短片", th: "หนังสั้น", vi: "Phim ngắn", ko: "단편", en: "Short" },
};

export function mediaLabel(kind: string, lang: Lang): string {
  const row = MEDIA_LABEL[kind as MediaKind] ?? MEDIA_LABEL["映画"];
  return row[lang] ?? row.ja ?? kind;
}

// 작품명 괄호 — CJK 는 전각 괄호(앞뒤 여백 내장), 그 외는 큰따옴표 + 공백 구분.
export function titleBrackets(lang: Lang): [string, string] {
  switch (lang) {
    case "ja":
    case "ko":
      return ["『", "』"];
    case "tw":
      return ["《", "》"];
    default:
      return ["“", "”"];
  }
}

/**
 * 굿무비/레디액션 하단 작품 크레딧 한 줄.
 * ja → `ドラマ『ノーマル・ピープル』` (기존 출력과 문자열 완전 동일)
 * tw → `影集《正常人》` / th → `ซีรีส์ “คนธรรมดา”` / vi → `Phim truyền hình “Người bình thường”`
 */
export function mediaCredit(kind: string, title: string, lang: Lang): string {
  const label = mediaLabel(kind || "映画", lang);
  const [open, close] = titleBrackets(lang);
  const sep = open === "『" || open === "《" ? "" : " ";
  return `${label}${sep}${open}${title}${close}`;
}
