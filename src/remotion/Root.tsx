import React from "react";
import { Composition } from "remotion";
import { TopVideo } from "./TopVideo";
import { DEFAULT_PROPS, type TopVideoProps } from "./types";

export const COMPOSITION_ID = "Top";

// Remotion's Composition generic is constrained to Record<string, unknown>; our
// props are a fixed shape, so we bridge with casts at this single boundary.
type Props = Record<string, unknown>;
const Comp = TopVideo as unknown as React.FC<Props>;

export const RemotionRoot: React.FC = () => {
  return (
    <Composition
      id={COMPOSITION_ID}
      component={Comp}
      defaultProps={DEFAULT_PROPS as unknown as Props}
      fps={30}
      width={1920}
      height={1080}
      durationInFrames={90}
      calculateMetadata={({ props }) => {
        const plan = (props as unknown as TopVideoProps).plan;
        return {
          durationInFrames: Math.max(1, plan.durationInFrames),
          fps: plan.fps,
          width: plan.width,
          height: plan.height,
        };
      }}
    />
  );
};
