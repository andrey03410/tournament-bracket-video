import type { VideoPlan } from "@/lib/domain/video-plan";
import type { PickerPlan } from "@/lib/domain/picker-plan";

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

export interface PickerCompositionProps {
  plan: PickerPlan;
  assetMode: AssetMode;
  tickSrc: string | null;
}

export const DEFAULT_PICKER_PROPS: PickerCompositionProps = {
  assetMode: "url",
  tickSrc: null,
  plan: {
    fps: 30,
    width: 1920,
    height: 1080,
    durationSec: 3,
    durationInFrames: 90,
    rounds: [],
    music: null,
    intro: null,
    outro: null,
  },
};
