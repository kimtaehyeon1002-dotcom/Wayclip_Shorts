// `<번호>캡션.txt` 계약 — 캡션 작성(스킬) · 퍼블리셔 · 웹이 전부 이 파서/포매터를 쓴다.
//
//   [별명] <번호> | <소재>            ← 1행 헤더 (게시엔 안 씀)
//   (빈 줄)
//   〔キャプション〕
//   (캡션 본문 — 그대로 인스타 캡션)
//   (빈 줄들)
//   ━━━━━━━━━━━━━━━ 📌 固定コメント ━━━━━━━━━━━━━━━   ← 구분선: "固定コメント" 를 포함한 한 줄
//   (고정댓글 — 게시 직후 첫 댓글)
//
// 헤더·마커·구분선은 **언어와 무관하게 동일**(tw/th/vi 판도 〔キャプション〕/固定コメント 그대로).

export const CAPTION_MARKER = "〔キャプション〕";
export const PINNED_RULE = "━━━━━━━━━━━━━━━ 📌 固定コメント ━━━━━━━━━━━━━━━";
const PINNED_SPLIT = /\n[^\n]*固定コメント[^\n]*\n/;

/**
 * @param {string} raw 파일 내용
 * @returns {{ header: string, alias: string|null, number: string|null, subject: string|null,
 *            caption: string, pinnedComment: string }}
 */
export function parseCaptionTxt(raw) {
  const text = String(raw).replace(/\r\n/g, "\n");
  const parts = text.split(PINNED_SPLIT);
  const head = parts[0];
  const pinnedComment = parts.length > 1 ? parts.slice(1).join("\n").trim() : "";

  const firstLine = head.split("\n")[0].trim();
  const hm = /^\[([^\]]+)\]\s*(\S+)\s*\|\s*(.*)$/.exec(firstLine);
  const header = firstLine;
  const alias = hm ? hm[1] : null;
  const number = hm ? hm[2] : null;
  const subject = hm ? hm[3].trim() : null;

  let caption;
  const at = head.indexOf(CAPTION_MARKER);
  if (at !== -1) caption = head.slice(at + CAPTION_MARKER.length).trim();
  else caption = head.split("\n").slice(1).join("\n").trim(); // 마커 없으면 헤더만 떼고 나머지

  return { header, alias, number, subject, caption, pinnedComment };
}

/** 파서의 역함수 — 스킬/웹이 캡션 txt 를 만들 때 사용. */
export function formatCaptionTxt({ alias, number, subject, caption, pinnedComment }) {
  const header = `[${alias}] ${number} | ${subject ?? ""}`.trimEnd();
  return (
    `${header}\n\n${CAPTION_MARKER}\n\n${String(caption).trim()}\n\n\n` +
    `${PINNED_RULE}\n\n${String(pinnedComment ?? "").trim()}\n`
  );
}

/** 게시 가능 여부 점검 — 캡션이 비면 게시 보류 대상. */
export function captionTxtProblems(parsed) {
  const problems = [];
  if (!parsed.caption) problems.push("캡션 본문 없음");
  if (!parsed.pinnedComment) problems.push("고정댓글 없음");
  if (!parsed.alias) problems.push("헤더 형식 아님 ([별명] <번호> | <소재>)");
  return problems;
}
