import { importPoster } from "@/server/shikimori";
import { addTile, addTileToGroup, patchTile } from "@/server/projects";
import type { ShikimoriType } from "@/lib/domain/shikimori";

export interface AddTileFromShikimoriInput {
  /** Target: a plain round, or a block of a group round (exactly one). */
  roundId?: string;
  groupId?: string;
  type: ShikimoriType;
  id: number;
  posterPath: string;
  label?: string | null;
  isAnswer?: boolean;
  maxPoolBytes: number | null;
}

/** Import a Shikimori poster into the pool and place it as a tile in one call. */
export async function addTileFromShikimori(
  userId: string,
  input: AddTileFromShikimoriInput,
): Promise<{ tileId: string; artId: string }> {
  const { artId } = await importPoster(userId, {
    type: input.type,
    id: input.id,
    posterPath: input.posterPath,
    label: input.label ?? null,
    maxPoolBytes: input.maxPoolBytes,
  });
  const tile = input.groupId
    ? await addTileToGroup(userId, input.groupId, artId)
    : await addTile(userId, input.roundId!, artId);
  if (input.label != null || input.isAnswer) {
    await patchTile(userId, tile.id, {
      ...(input.label != null ? { label: input.label } : {}),
      ...(input.isAnswer ? { isAnswer: true } : {}),
    });
  }
  return { tileId: tile.id, artId };
}
