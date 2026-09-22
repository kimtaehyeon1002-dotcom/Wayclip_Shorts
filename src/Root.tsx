import React from "react";
import { Composition } from "remotion";
import { compositionIdOf, formatSchema } from "@wayclip/shared/format-schema.mjs";
import { FPS, WIDTH, HEIGHT, formatPropsSchema } from "./props";
import { FORMAT_JSON } from "./formats.generated";
import { makeFormatComponent } from "./format/FormatComposition";

// 컴포지션 = formats/*.json 하나당 하나 (id = slug, 언더스코어는 하이픈으로: space_lab → space-lab).
// 영상별 데이터는 --props=videos/<ch>/<n>/props.json 로 주입(top-level shallow merge — 누락 키는 포맷의 defaultProps),
// 미디어는 --public-dir=videos/<ch>/<n> 로 source.mp4 하드링크가 staticFile 에 잡힘.
// durationInFrames 는 calculateMetadata 가 props 의 값으로 덮어쓴다.
const COMPOSITIONS = FORMAT_JSON.map((json) => {
  const format = formatSchema.parse(json);
  return {
    id: compositionIdOf(format.slug),
    component: makeFormatComponent(format),
    defaultProps: formatPropsSchema.parse(format.defaultProps),
  };
});

export const Root: React.FC = () => {
  return (
    <>
      {COMPOSITIONS.map((c) => (
        <Composition
          key={c.id}
          id={c.id}
          component={c.component}
          schema={formatPropsSchema}
          defaultProps={c.defaultProps}
          calculateMetadata={({ props }) => ({ durationInFrames: props.durationInFrames })}
          width={WIDTH}
          height={HEIGHT}
          fps={FPS}
          durationInFrames={900}
        />
      ))}
    </>
  );
};
