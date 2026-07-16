import type { LoadedProject } from "@/server/projects";

export interface ProjectSummary {
  id: string;
  title: string;
  kind: string;
  url: string;
  playlist: { artId: string; label: string | null }[];
  rounds: {
    id: string;
    order: number;
    prompt: string | null;
    tiles: { id: string; label: string | null; isAnswer: boolean; artId: string | null }[];
  }[];
}

/** Compact, agent-friendly view of a project for the get_project tool. */
export function projectSummary(p: LoadedProject): ProjectSummary {
  return {
    id: p.id,
    title: p.title,
    kind: p.kind,
    url: `/projects/${p.id}`,
    playlist: p.playlist.map((pl) => ({ artId: pl.artId, label: pl.art.label })),
    rounds: p.rounds.map((r) => ({
      id: r.id,
      order: r.order,
      prompt: r.prompt,
      tiles: r.tiles.map((t) => ({
        id: t.id, label: t.label, isAnswer: t.isAnswer, artId: t.artId,
      })),
    })),
  };
}
