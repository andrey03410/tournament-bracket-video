import { describe, it, expect } from "vitest";
import {
  mapAnimeResult,
  mapCharacterResult,
  pickLabel,
  absoluteImageUrl,
  isSafeImagePath,
  matchStudios,
  extractRoleCharacters,
  resizeImagePath,
  mapUser,
  mapUserRate,
  selectUserRates,
  countByStatus,
  extractFavourites,
  type UserRate,
} from "@/lib/domain/shikimori";

const rawAnime = {
  id: 20,
  name: "Naruto",
  russian: "Наруто",
  image: {
    original: "/system/animes/original/20.jpg?1711965679",
    preview: "/system/animes/preview/20.jpg?1711965679",
  },
  kind: "tv",
  score: "8.02",
  aired_on: "2002-10-03",
};

const rawChar = {
  id: 17,
  name: "Naruto Uzumaki",
  russian: "Наруто Узумаки",
  image: { original: "/system/characters/original/17.jpg?1", preview: "/system/characters/preview/17.jpg?1" },
};

describe("mapAnimeResult", () => {
  it("normalizes a raw anime hit", () => {
    expect(mapAnimeResult(rawAnime)).toEqual({
      id: 20,
      name: "Naruto",
      russian: "Наруто",
      posterPath: "/system/animes/original/20.jpg?1711965679",
      previewPath: "/system/animes/preview/20.jpg?1711965679",
      kind: "tv",
      score: 8.02,
      year: 2002,
    });
  });
  it("returns null for a hit without an id", () => {
    expect(mapAnimeResult({ name: "x" })).toBeNull();
  });
  it("tolerates missing score/aired_on", () => {
    const r = mapAnimeResult({ id: 1, name: "A", image: {} })!;
    expect(r.score).toBeNull();
    expect(r.year).toBeNull();
    expect(r.posterPath).toBeNull();
  });
  it("titles without artwork get null paths, not the placeholder asset", () => {
    // Shikimori answers with /assets/globals/missing_original.jpg — unfetchable
    const r = mapAnimeResult({
      id: 62027, name: "Tori no Uta", kind: "music",
      image: {
        original: "/assets/globals/missing_original.jpg",
        preview: "/assets/globals/missing_preview.jpg",
      },
    })!;
    expect(r.posterPath).toBeNull();
    expect(r.previewPath).toBeNull();
  });
  it("normalizes a thumb-only image to the poster bucket", () => {
    const r = mapAnimeResult({ id: 7, name: "A", image: { original: "/system/animes/x96/7.jpg?9" } })!;
    expect(r.posterPath).toBe("/system/animes/original/7.jpg?9");
  });
});

describe("mapCharacterResult", () => {
  it("normalizes a raw character hit", () => {
    expect(mapCharacterResult(rawChar)).toEqual({
      id: 17,
      name: "Naruto Uzumaki",
      russian: "Наруто Узумаки",
      posterPath: "/system/characters/original/17.jpg?1",
      previewPath: "/system/characters/preview/17.jpg?1",
    });
  });
});

describe("pickLabel", () => {
  it("prefers russian, falls back to name, then null", () => {
    expect(pickLabel("Наруто", "Naruto")).toBe("Наруто");
    expect(pickLabel("  ", "Naruto")).toBe("Naruto");
    expect(pickLabel(null, "  ")).toBeNull();
  });
});

describe("absoluteImageUrl", () => {
  it("joins base and path without double slash", () => {
    expect(absoluteImageUrl("https://shikimori.io", "/system/animes/original/20.jpg")).toBe(
      "https://shikimori.io/system/animes/original/20.jpg",
    );
    expect(absoluteImageUrl("https://shikimori.io/", "/system/x.jpg")).toBe(
      "https://shikimori.io/system/x.jpg",
    );
  });
});

describe("isSafeImagePath", () => {
  it("accepts poster/preview system paths (with query)", () => {
    expect(isSafeImagePath("/system/animes/original/20.jpg?1711965679")).toBe(true);
    expect(isSafeImagePath("/system/characters/preview/17.jpg")).toBe(true);
  });
  it("rejects foreign hosts, traversal and non-system paths", () => {
    expect(isSafeImagePath("https://evil.example/system/animes/original/1.jpg")).toBe(false);
    expect(isSafeImagePath("/system/../etc/passwd")).toBe(false);
    expect(isSafeImagePath("/uploads/1.jpg")).toBe(false);
    expect(isSafeImagePath("/system/users/original/1.jpg")).toBe(false);
    expect(isSafeImagePath("")).toBe(false);
  });
});

describe("matchStudios", () => {
  const studios = [
    { id: 11, name: "Madhouse", filtered_name: "Madhouse", real: false, image: null },
    { id: 2, name: "Studio Madhouse Jr", filtered_name: "Madhouse Jr", real: false },
    { id: 7, name: "Bones", filtered_name: "Bones" },
    { id: 99, name: 123 }, // мусор: name не строка
  ];
  it("matches by name substring, case-insensitive", () => {
    const res = matchStudios(studios, "madhouse", 10);
    expect(res.map((s) => s.id).sort((a, b) => a - b)).toEqual([2, 11]);
    expect(res[0]).toEqual({ id: 11, name: "Madhouse" });
  });
  it("matches by filtered_name when name differs", () => {
    const res = matchStudios([{ id: 5, name: "Studio X", filtered_name: "Bones" }], "bones", 10);
    expect(res).toEqual([{ id: 5, name: "Studio X" }]);
  });
  it("respects the limit and skips malformed entries", () => {
    expect(matchStudios(studios, "o", 1)).toHaveLength(1);
    expect(matchStudios(studios, "", 10)).toEqual([]);
  });
});

describe("resizeImagePath", () => {
  it("rewrites the size bucket keeping the id and cache buster", () => {
    expect(resizeImagePath("/system/animes/x64/572.jpg?1711957866", "original")).toBe(
      "/system/animes/original/572.jpg?1711957866",
    );
    expect(resizeImagePath("/system/characters/x64/251.jpg", "preview")).toBe(
      "/system/characters/preview/251.jpg",
    );
    // already-original paths pass through unchanged
    expect(resizeImagePath("/system/animes/original/20.jpg", "original")).toBe(
      "/system/animes/original/20.jpg",
    );
  });
  it("its output is accepted by the SSRF guard", () => {
    expect(isSafeImagePath(resizeImagePath("/system/animes/x64/572.jpg?1", "original")!)).toBe(true);
  });
  it("returns null for junk, foreign hosts and non-media paths", () => {
    expect(resizeImagePath(null, "original")).toBeNull();
    expect(resizeImagePath(undefined, "original")).toBeNull();
    expect(resizeImagePath("https://evil.example/system/animes/x64/1.jpg", "original")).toBeNull();
    expect(resizeImagePath("/system/users/x64/1.png", "original")).toBeNull();
    expect(resizeImagePath("/system/animes/x64/../../etc/passwd", "original")).toBeNull();
  });
});

describe("mapUser", () => {
  it("normalizes a profile", () => {
    expect(
      mapUser({ id: 1270120, nickname: "andrey03410", url: "https://shikimori.io/andrey03410",
        avatar: "https://shikimori.io/system/users/x48/1270120.png" }),
    ).toEqual({
      id: 1270120, nickname: "andrey03410", url: "https://shikimori.io/andrey03410",
      avatarUrl: "https://shikimori.io/system/users/x48/1270120.png",
    });
  });
  it("tolerates a missing url/avatar and rejects junk", () => {
    expect(mapUser({ id: 5, nickname: "n" })).toEqual({
      id: 5, nickname: "n", url: null, avatarUrl: null,
    });
    expect(mapUser({ nickname: "n" })).toBeNull();
    expect(mapUser({ id: 5 })).toBeNull();
  });
});

describe("mapUserRate", () => {
  const rawRate = {
    id: 214904776, score: 8, status: "completed", episodes: 24, rewatches: 1,
    updated_at: "2026-07-29T23:26:51.845+03:00",
    anime: rawAnime,
    manga: null,
  };

  it("normalizes an entry: the anime plus the user's own rate", () => {
    expect(mapUserRate(rawRate)).toEqual({
      anime: mapAnimeResult(rawAnime),
      score: 8, status: "completed", episodes: 24, rewatches: 1,
      updatedAt: "2026-07-29T23:26:51.845+03:00",
    });
  });
  it("score 0 (unrated) becomes null", () => {
    expect(mapUserRate({ ...rawRate, score: 0 })!.score).toBeNull();
  });
  it("drops manga rates, unknown statuses and junk", () => {
    expect(mapUserRate({ ...rawRate, anime: null })).toBeNull();
    expect(mapUserRate({ ...rawRate, status: "reading" })).toBeNull();
    expect(mapUserRate(null)).toBeNull();
  });
  it("missing counters default to 0", () => {
    const r = mapUserRate({ status: "planned", anime: rawAnime })!;
    expect(r).toMatchObject({ episodes: 0, rewatches: 0, score: null, updatedAt: null });
  });
});

describe("selectUserRates / countByStatus", () => {
  const rate = (
    id: number, name: string, score: number | null,
    status: UserRate["status"], updatedAt: string,
  ): UserRate => ({
    anime: { id, name, russian: null, posterPath: null, previewPath: null, kind: "tv", score: 7, year: 2010 },
    score, status, episodes: 12, rewatches: 0, updatedAt,
  });

  const list = [
    rate(1, "Bravo", 8, "completed", "2026-01-01"),
    rate(2, "Alpha", 10, "completed", "2026-02-01"),
    rate(3, "Charlie", null, "planned", "2026-03-01"),
    rate(4, "Delta", 8, "dropped", "2026-04-01"),
  ];

  it("orders by the user's score, unrated last, ties by freshness", () => {
    expect(selectUserRates(list).map((r) => r.anime.id)).toEqual([2, 4, 1, 3]);
  });
  it("filters by status and by minimum score", () => {
    expect(selectUserRates(list, { status: "completed" }).map((r) => r.anime.id)).toEqual([2, 1]);
    expect(selectUserRates(list, { minScore: 9 }).map((r) => r.anime.id)).toEqual([2]);
    // unrated entries never survive a minScore filter
    expect(selectUserRates(list, { minScore: 1 }).map((r) => r.anime.id)).toEqual([2, 4, 1]);
    // "all" is the same as no status filter
    expect(selectUserRates(list, { status: "all" })).toHaveLength(4);
  });
  it("supports the updated and name orders, plus a limit", () => {
    expect(selectUserRates(list, { order: "updated" }).map((r) => r.anime.id)).toEqual([4, 3, 2, 1]);
    expect(selectUserRates(list, { order: "name" }).map((r) => r.anime.name)).toEqual([
      "Alpha", "Bravo", "Charlie", "Delta",
    ]);
    expect(selectUserRates(list, { limit: 2 }).map((r) => r.anime.id)).toEqual([2, 4]);
    expect(selectUserRates(list, { limit: 0 })).toEqual([]);
  });
  it("counts every status, zeros included", () => {
    expect(countByStatus(list)).toEqual({
      planned: 1, watching: 0, rewatching: 0, completed: 2, on_hold: 0, dropped: 1,
    });
  });
});

describe("extractFavourites", () => {
  const raw = {
    animes: [
      { id: 572, name: "Kaze no Tani no Nausicaa", russian: "Навсикая из Долины ветров",
        image: "/system/animes/x64/572.jpg?1711957866", url: null },
      { id: "bad", name: "junk" },
    ],
    characters: [
      { id: 251, name: "Haruhi Suzumiya", russian: "Харухи Судзумия",
        image: "/system/characters/x64/251.jpg?1712015455", url: null },
    ],
    mangas: [{ id: 1, name: "M", image: "/system/mangas/x64/1.jpg" }],
    people: [{ id: 2, name: "P" }],
  };

  it("maps animes and characters with import-ready poster paths", () => {
    const fav = extractFavourites(raw);
    expect(fav.animes).toEqual([
      { id: 572, name: "Kaze no Tani no Nausicaa", russian: "Навсикая из Долины ветров",
        posterPath: "/system/animes/original/572.jpg?1711957866",
        previewPath: "/system/animes/preview/572.jpg?1711957866" },
    ]);
    expect(fav.characters[0]).toMatchObject({
      id: 251, posterPath: "/system/characters/original/251.jpg?1712015455",
    });
  });
  it("ignores other favourite kinds and malformed payloads", () => {
    expect(extractFavourites({})).toEqual({ animes: [], characters: [] });
    expect(extractFavourites(null)).toEqual({ animes: [], characters: [] });
    expect(extractFavourites({ animes: "nope" })).toEqual({ animes: [], characters: [] });
  });
});

describe("extractRoleCharacters", () => {
  const roles = [
    { roles: ["Main"], character: { id: 17, name: "Naruto", russian: "Наруто",
      image: { original: "/system/characters/original/17.jpg", preview: "/system/characters/preview/17.jpg" } } },
    { roles: ["Supporting"], character: { id: 18, name: "Sakura", russian: "Сакура",
      image: { original: "/system/characters/original/18.jpg", preview: "/system/characters/preview/18.jpg" } } },
    { roles: ["Main"], character: { id: "bad" } }, // мусорный персонаж
  ];
  it("keeps only Main-role characters and maps them", () => {
    const res = extractRoleCharacters(roles, "Main");
    expect(res).toHaveLength(1);
    expect(res[0]).toMatchObject({ id: 17, name: "Naruto", russian: "Наруто",
      posterPath: "/system/characters/original/17.jpg" });
  });
  it("role='all' keeps every valid character", () => {
    expect(extractRoleCharacters(roles, "all").map((c) => c.id).sort()).toEqual([17, 18]);
  });
});
