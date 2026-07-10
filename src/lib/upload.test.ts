import { describe, it, expect } from "vitest";
import { isAudioFile, isVideoFile, mediaKind, deriveTitle } from "./upload";

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

describe("isVideoFile / mediaKind", () => {
  it("accepts supported video extensions in any case", () => {
    for (const f of ["op.mp4", "OP.MP4", "x/clip.webm", "y/z.MOV"]) {
      expect(isVideoFile(f)).toBe(true);
      expect(mediaKind(f)).toBe("video");
    }
  });
  it("rejects unsupported containers and junk entries", () => {
    for (const f of ["movie.mkv", "movie.avi", "movie.flv", "notes.txt"]) {
      expect(isVideoFile(f)).toBe(false);
      expect(mediaKind(f)).toBeNull();
    }
    expect(isVideoFile("__MACOSX/._op.mp4")).toBe(false);
    expect(isVideoFile(".hidden.mp4")).toBe(false);
  });
  it("classifies audio as audio, not video", () => {
    expect(mediaKind("song.mp3")).toBe("audio");
    expect(mediaKind("song.m4a")).toBe("audio");
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
