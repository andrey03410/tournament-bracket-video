import { NextResponse } from "next/server";
import { userOr401, notFound } from "@/lib/api";
import { getTournament, nextComparison } from "@/server/tournaments";

export async function GET(
  _req: Request,
  { params }: { params: { id: string } },
) {
  const auth = await userOr401();
  if ("response" in auth) return auth.response;

  const t = await getTournament(auth.userId, params.id);
  if (!t) return notFound();

  const { pair, progress, isComplete, standings } = nextComparison(t);
  const byId = new Map(t.tracks.map((tr) => [tr.id, tr]));

  const toDto = (id: string) => {
    const tr = byId.get(id)!;
    return {
      id: tr.id,
      title: tr.title,
      artist: tr.artist,
      audioUrl: `/api/tracks/${tr.id}/audio`,
    };
  };

  return NextResponse.json({
    blindMode: t.blindMode,
    isComplete,
    progress,
    standings, // provisional top, or null if the scheme has no interim ranking
    pair: pair ? { a: toDto(pair.a), b: toDto(pair.b) } : null,
  });
}
