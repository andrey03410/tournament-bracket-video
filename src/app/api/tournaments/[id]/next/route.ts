import { NextResponse } from "next/server";
import { userOr401, notFound } from "@/lib/api";
import { getTournament, nextComparison } from "@/server/tournaments";
import { MAX_GROUP_SIZE } from "@/lib/domain/group-answer";

export async function GET(
  _req: Request,
  { params }: { params: { id: string } },
) {
  const auth = await userOr401();
  if ("response" in auth) return auth.response;

  const t = await getTournament(auth.userId, params.id);
  if (!t) return notFound();

  const step = nextComparison(t);
  const byId = new Map(t.tracks.map((tr) => [tr.id, tr]));

  const toDto = (id: string) => {
    const tr = byId.get(id)!;
    return {
      id: tr.id,
      title: tr.title,
      artist: tr.artist,
      kind: tr.kind,
      audioUrl: `/api/tracks/${tr.id}/audio`,
    };
  };

  return NextResponse.json({
    blindMode: t.blindMode,
    isComplete: step.isComplete,
    canExtend: step.canExtend,
    groupSize: step.groupSize,
    // Upper bound the picker offers: the engine's own cap, the global cap and
    // the field size, whichever is smallest.
    maxGroupSize: Math.min(step.maxGroupSize, MAX_GROUP_SIZE, t.tracks.length),
    progress: step.progress,
    screens: step.screens,
    coverage: step.coverage,
    standings: step.standings, // provisional top, or null for schemes without one
    question: step.question ? step.question.map(toDto) : null,
  });
}
