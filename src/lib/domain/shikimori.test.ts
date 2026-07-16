import { describe, it, expect } from "vitest";
import {
  mapAnimeResult,
  mapCharacterResult,
  pickLabel,
  absoluteImageUrl,
  isSafeImagePath,
  matchStudios,
  extractRoleCharacters,
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
