// One shape for a pool media in every API response (listing, upload, by-link
// import), so the gallery and the cabinet can render the same card.

export interface ArtDtoInput {
  id: string;
  label: string | null;
  kind: string;
  durationSec?: number | null;
  hasAudio?: boolean;
  posterPath?: string | null;
  sizeBytes?: number | null;
  usageCount?: number;
  lastUsedAt?: Date | null;
  createdAt?: Date | null;
}

export function artDto(a: ArtDtoInput) {
  return {
    id: a.id,
    label: a.label,
    kind: a.kind,
    url: `/api/arts/${a.id}`,
    posterUrl: a.kind === "video" && a.posterPath ? `/api/arts/${a.id}?poster=1` : null,
    durationSec: a.durationSec ?? null,
    hasAudio: a.hasAudio ?? false,
    sizeBytes: a.sizeBytes ?? null,
    usageCount: a.usageCount ?? 0,
    lastUsedAt: a.lastUsedAt ?? null,
    createdAt: a.createdAt ?? null,
  };
}
