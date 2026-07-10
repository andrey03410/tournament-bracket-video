import type { VideoPlan } from "@/lib/domain/video-plan";

// How the composition resolves asset paths:
//  - "static": paths are basenames inside the Remotion public dir (server render)
//  - "url":    paths are ready-to-use URLs (browser live preview)
export type AssetMode = "static" | "url";

export interface TopVideoProps {
  plan: VideoPlan;
  assetMode: AssetMode;
}

export const DEFAULT_PROPS: TopVideoProps = {
  assetMode: "url",
  plan: {
    fps: 30,
    width: 1920,
    height: 1080,
    durationInFrames: 90,
    introFrames: 90,
    outroFrames: 0,
    introText: "Top",
    outroText: null,
    segments: [],
  },
};
