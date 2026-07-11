import "server-only";
import { cropFromColumns } from "@/lib/domain/art-crop";
import { getRenderConfig, itemBase } from "@/server/render";

// Shared DTO for the render constructor: the same shape for tournament tops
// and manual-top projects, so RenderConstructor works over either.

type LoadedConfig = NonNullable<Awaited<ReturnType<typeof getRenderConfig>>>;

export function serializeConfig(config: LoadedConfig) {
  return {
    id: config.id,
    order: config.order,
    template: config.template,
    defaultClipSec: config.defaultClipSec,
    introEnabled: config.introEnabled,
    introText: config.introText,
    outroEnabled: config.outroEnabled,
    outroText: config.outroText,
    items: config.items.map((it) => {
      const base = itemBase(it);
      return {
        id: it.id,
        trackId: base.key,
        audioArtId: it.audioArtId,
        rank: it.rank,
        title: base.title,
        artist: base.artist,
        durationSec: base.ownDurationSec,
        trackKind: base.ownIsVideo ? "video" : "audio",
        audioUrl: base.audioUrl,
        clipMode: it.clipMode,
        clipStartSec: it.clipStartSec,
        clipEndSec: it.clipEndSec,
        snippetLenSec: it.snippetLenSec,
        resolvedStartSec: it.resolvedStartSec,
        customLabel: it.customLabel,
        artId: it.artId,
        artUrl: it.artId ? `/api/arts/${it.artId}` : null,
        art: it.art
          ? {
              kind: it.art.kind,
              durationSec: it.art.durationSec,
              hasAudio: it.art.hasAudio,
              posterUrl: it.art.posterPath ? `/api/arts/${it.art.id}?poster=1` : null,
            }
          : null,
        artCrop: cropFromColumns(it.artCropX, it.artCropY, it.artCropW, it.artCropH),
        audioSource: it.audioSource,
        mediaStartSec: it.mediaStartSec,
      };
    }),
  };
}
