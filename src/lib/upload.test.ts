import { describe, it, expect } from "vitest";
import { isAudioFile, deriveTitle } from "./upload";

describe("isAudioFile", () => {
  it("accepts supported audio extensions", () => {
    for (const f of ["a.mp3", "B.FLAC", "x/y.wav", "t.m4a", "z.ogg"]) {
      expect(isAudioFile(f)).toBe(true);
    }
  });
  it("rejects non-audio and junk entries", () => {
    expect(isAudioFile("cover.jpg")).toBe(false);
    expect(isAudioFile("notes.txt")).toBe(false);
    expect(isAudioFile("__MACOSX/._song.mp3")).toBe(false);
    expect(isAudioFile(".hidden.mp3")).toBe(false);
  });
});

describe("deriveTitle", () => {
  it("prefers a non-empty ID3 title", () => {
    expect(deriveTitle("01 track.mp3", "Roaring Tides")).toBe("Roaring Tides");
  });
  it("falls back to filename without extension", () => {
    expect(deriveTitle("songs/01 - Intro.flac")).toBe("01 - Intro");
    expect(deriveTitle("01 - Intro.flac", "   ")).toBe("01 - Intro");
    expect(deriveTitle("Theme.mp3", null)).toBe("Theme");
  });
});
