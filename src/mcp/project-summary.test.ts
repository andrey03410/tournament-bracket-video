import { describe, it, expect } from "vitest";
import { projectSummary } from "./project-summary";
import type { LoadedProject } from "@/server/projects";

const fake = {
  id: "p1", title: "Персонажи Madhouse", kind: "picker",
  introEnabled: true, introText: null, outroEnabled: false, outroText: "Пока",
  bgArt: null,
  playlist: [{ artId: "a9", art: { label: "OST", durationSec: 164 } }],
  rounds: [
    { id: "r1", order: 0, prompt: "Кто главный?",
      tiles: [
        { id: "t1", label: "Лайт", isAnswer: true, artId: "a1" },
        { id: "t2", label: "Рюук", isAnswer: false, artId: "a2" },
      ] },
  ],
} as unknown as LoadedProject;

describe("projectSummary", () => {
  it("projects a loaded project into a compact structure", () => {
    const s = projectSummary(fake);
    expect(s).toEqual({
      id: "p1", title: "Персонажи Madhouse", kind: "picker", url: "/projects/p1",
      // blank intro text falls back to the title; a disabled card reads as null
      intro: "Персонажи Madhouse", outro: null,
      background: null,
      playlist: [{ artId: "a9", label: "OST", durationSec: 164 }],
      playlistSec: 164,
      rounds: [
        { id: "r1", order: 0, prompt: "Кто главный?",
          tiles: [
            { id: "t1", label: "Лайт", isAnswer: true, artId: "a1" },
            { id: "t2", label: "Рюук", isAnswer: false, artId: "a2" },
          ] },
      ],
    });
  });

  it("reports the background art and the planned runtime when given one", () => {
    const withBg = {
      ...fake,
      bgArt: { id: "bg1", label: "Нагиса", kind: "image" },
    } as unknown as LoadedProject;
    const s = projectSummary(withBg, { durationSec: 551.9 });
    expect(s.background).toEqual({ artId: "bg1", label: "Нагиса", kind: "image" });
    expect(s.durationSec).toBe(551.9);
  });
});
