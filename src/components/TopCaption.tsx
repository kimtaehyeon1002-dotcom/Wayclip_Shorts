import React from "react";

export type Markup = "none" | "bold" | "redbold";

// [[…]] → 빨강 span, **…** → strong. 두 마크업 중첩 가능 (예: [[**NASA**]]).
// 원본 space_lab buildMarkup / readyaction appendCaptionSegments 의 React 이식.
function renderMarkup(
  text: string,
  markup: Markup,
  strongStyle: React.CSSProperties,
  redStyle: React.CSSProperties
): React.ReactNode[] {
  const nodes: React.ReactNode[] = [];
  // 1) [[…]] 분리 (redbold 일 때만 의미)
  const redParts =
    markup === "redbold" ? text.split(/\[\[|\]\]/) : [text];
  redParts.forEach((part, ridx) => {
    if (!part) return;
    const isRed = markup === "redbold" && ridx % 2 === 1;
    // 2) **…** 분리 (bold/redbold 일 때만)
    const boldParts =
      markup === "none" ? [part] : part.split(/\*\*/);
    boldParts.forEach((bp, bidx) => {
      if (!bp) return;
      const isBold = markup !== "none" && bidx % 2 === 1;
      let node: React.ReactNode = bp;
      if (isBold) {
        node = (
          <strong key={`b-${ridx}-${bidx}`} style={strongStyle}>
            {bp}
          </strong>
        );
      }
      if (isRed) {
        nodes.push(
          <span key={`r-${ridx}-${bidx}`} style={redStyle}>
            {node}
          </span>
        );
      } else {
        nodes.push(
          <React.Fragment key={`t-${ridx}-${bidx}`}>{node}</React.Fragment>
        );
      }
    });
  });
  return nodes;
}

// 상단 멘트/헤드라인 — \n 으로 분리, 최대 2줄. 각 줄에 lineStyle + 마크업 적용.
export const TopCaption: React.FC<{
  text: string;
  lineStyle: React.CSSProperties;
  markup?: Markup;
  strongStyle?: React.CSSProperties;
  redStyle?: React.CSSProperties;
  maxLines?: number;
  // (선택) 줄별 폰트 크기(pt) 오버라이드. 해당 줄 인덱스 값이 숫자면 lineStyle.fontSize 대신 적용.
  lineSizes?: (number | null)[];
}> = ({
  text,
  lineStyle,
  markup = "none",
  strongStyle = {},
  redStyle = {},
  maxLines = 2,
  lineSizes,
}) => {
  const lines = String(text ?? "")
    .replace(/\\n/g, "\n")
    .split("\n")
    .map((s) => s.trim())
    .filter(Boolean)
    .slice(0, maxLines);

  return (
    <>
      {lines.map((line, i) => {
        const sz = lineSizes?.[i];
        const style =
          typeof sz === "number" ? { ...lineStyle, fontSize: `${sz}pt` } : lineStyle;
        return (
          <div key={i} style={style}>
            {renderMarkup(line, markup, strongStyle, redStyle)}
          </div>
        );
      })}
    </>
  );
};
