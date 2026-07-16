import { describe, it, expect } from "vitest";
import { projectSummary } from "./project-summary";
import type { LoadedProject } from "@/server/projects";

const fake = {
  id: "p1", title: "Персонажи Madhouse", kind: "picker",
  playlist: [{ artId: "a9", art: { label: "OST" } }],
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
      playlist: [{ artId: "a9", label: "OST" }],
      rounds: [
        { id: "r1", order: 0, prompt: "Кто главный?",
          tiles: [
            { id: "t1", label: "Лайт", isAnswer: true, artId: "a1" },
            { id: "t2", label: "Рюук", isAnswer: false, artId: "a2" },
          ] },
      ],
    });
  });
});
