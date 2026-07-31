// What a pool media is actually used for, in words. Before phase 17 the pool
// counted only top positions, so a poster standing as a card in thirty picker
// rounds reported "0 uses" — and deleting it silently took the cards with it
// (PickerTile.artId cascades). These are the phrasings the UI shows before the
// user confirms a deletion.

export interface ArtRelationCounts {
  renderItems: number;
  audioRenderItems: number;
  pickerTiles: number;
  playlistItems: number;
  projectBgs: number;
  projectMusics: number;
  roundBgs: number;
  roundMusics: number;
}

export interface UsageBreakdown {
  /** Positions of a top (the media itself or its sound). */
  positions: number;
  /** Cards inside picker rounds. */
  cards: number;
  /** Entries of a background-music playlist. */
  playlist: number;
  /** Backgrounds and background music of projects and rounds. */
  backgrounds: number;
  total: number;
}

export function usageBreakdown(counts: ArtRelationCounts): UsageBreakdown {
  const positions = counts.renderItems + counts.audioRenderItems;
  const cards = counts.pickerTiles;
  const playlist = counts.playlistItems;
  const backgrounds =
    counts.projectBgs + counts.projectMusics + counts.roundBgs + counts.roundMusics;
  return { positions, cards, playlist, backgrounds, total: positions + cards + playlist + backgrounds };
}

/** Russian plural: [one, few, many] — "1 карточка", "3 карточки", "5 карточек". */
function plural(n: number, forms: [string, string, string]): string {
  const mod100 = n % 100;
  const mod10 = n % 10;
  if (mod100 >= 11 && mod100 <= 14) return forms[2];
  if (mod10 === 1) return forms[0];
  if (mod10 >= 2 && mod10 <= 4) return forms[1];
  return forms[2];
}

const isOne = (n: number) => n % 10 === 1 && n % 100 !== 11;

/** Short "what uses it" line for a pool card. */
export function describeUsage(u: UsageBreakdown): string {
  if (!u.total) return "не используется";
  const parts: string[] = [];
  if (u.cards)
    parts.push(
      `${u.cards} ${plural(u.cards, ["карточка", "карточки", "карточек"])} ${
        isOne(u.cards) ? "в раунде" : "в раундах"
      }`,
    );
  if (u.positions)
    parts.push(
      `${u.positions} ${plural(u.positions, ["позиция", "позиции", "позиций"])} топа`,
    );
  if (u.playlist)
    parts.push(
      `${u.playlist} ${plural(u.playlist, ["трек", "трека", "треков"])} ${
        isOne(u.playlist) ? "в плейлисте" : "в плейлистах"
      }`,
    );
  if (u.backgrounds)
    parts.push(`${u.backgrounds} ${plural(u.backgrounds, ["фон", "фона", "фонов"])}`);
  return parts.join(", ");
}

/** What deletion will actually do — cards go away, positions only lose their media. */
export function describeDeletion(u: UsageBreakdown): string {
  if (!u.total) return "";
  const parts: string[] = [];
  if (u.cards)
    parts.push(
      `${u.cards} ${plural(u.cards, ["карточка", "карточки", "карточек"])} ${
        isOne(u.cards) ? "в раунде будет удалена" : "в раундах будут удалены"
      }`,
    );
  if (u.playlist)
    parts.push(
      `${u.playlist} ${plural(u.playlist, ["трек", "трека", "треков"])} ${
        isOne(u.playlist) ? "выпадет из плейлиста" : "выпадут из плейлистов"
      }`,
    );
  if (u.positions)
    parts.push(
      `${u.positions} ${plural(u.positions, ["позиция", "позиции", "позиций"])} топа ${
        isOne(u.positions) ? "освободится" : "освободятся"
      }`,
    );
  if (u.backgrounds)
    parts.push(
      `${u.backgrounds} ${plural(u.backgrounds, ["фон", "фона", "фонов"])} ${
        isOne(u.backgrounds) ? "сбросится" : "сбросятся"
      }`,
    );
  return parts.join(", ");
}
