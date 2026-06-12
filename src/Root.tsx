import React from "react";
import { Composition } from "remotion";
import {
  FPS,
  WIDTH,
  HEIGHT,
  goodVibeSongsSchema,
  goodMoviesSchema,
  readyActionSchema,
  thisHipHopSchema,
  spaceLabSchema,
} from "./props";
import { GoodVibeSongs } from "./channels/GoodVibeSongs";
import { GoodMovies } from "./channels/GoodMovies";
import { ReadyAction } from "./channels/ReadyAction";
import { ThisHipHop } from "./channels/ThisHipHop";
import { SpaceLab } from "./channels/SpaceLab";

// Composition id = 채널 slug. 영상별 데이터는 --props=videos/<ch>/<n>/props.json 로 주입,
// 미디어는 --public-dir=videos/<ch>/<n> 로 source.mp4 심볼링크가 staticFile 에 잡힘.
// durationInFrames 는 calculateMetadata 가 props 의 값으로 덮어쓴다.
export const Root: React.FC = () => {
  return (
    <>
      <Composition
        id="goodvibesongs"
        component={GoodVibeSongs}
        schema={goodVibeSongsSchema}
        defaultProps={goodVibeSongsSchema.parse({})}
        calculateMetadata={({ props }) => ({ durationInFrames: props.durationInFrames })}
        width={WIDTH}
        height={HEIGHT}
        fps={FPS}
        durationInFrames={900}
      />
      <Composition
        id="goodmovies"
        component={GoodMovies}
        schema={goodMoviesSchema}
        defaultProps={goodMoviesSchema.parse({})}
        calculateMetadata={({ props }) => ({ durationInFrames: props.durationInFrames })}
        width={WIDTH}
        height={HEIGHT}
        fps={FPS}
        durationInFrames={900}
      />
      <Composition
        id="readyaction"
        component={ReadyAction}
        schema={readyActionSchema}
        defaultProps={readyActionSchema.parse({})}
        calculateMetadata={({ props }) => ({ durationInFrames: props.durationInFrames })}
        width={WIDTH}
        height={HEIGHT}
        fps={FPS}
        durationInFrames={900}
      />
      <Composition
        id="thishiphop"
        component={ThisHipHop}
        schema={thisHipHopSchema}
        defaultProps={thisHipHopSchema.parse({})}
        calculateMetadata={({ props }) => ({ durationInFrames: props.durationInFrames })}
        width={WIDTH}
        height={HEIGHT}
        fps={FPS}
        durationInFrames={900}
      />
      <Composition
        id="space-lab"
        component={SpaceLab}
        schema={spaceLabSchema}
        defaultProps={spaceLabSchema.parse({})}
        calculateMetadata={({ props }) => ({ durationInFrames: props.durationInFrames })}
        width={WIDTH}
        height={HEIGHT}
        fps={FPS}
        durationInFrames={900}
      />
    </>
  );
};
