import { describe, it, expect } from "vitest";
import { parseMediaDirs, resolveInsideDirs, localMediaKind } from "./local-media";

describe("parseMediaDirs", () => {
  it("splits on ':', trims and drops empty entries", () => {
    expect(parseMediaDirs("/media/ost: /media/clips :", { home: "/home/u" })).toEqual([
      "/media/ost",
      "/media/clips",
    ]);
  });

  it("expands a leading ~ and normalizes the path", () => {
    expect(parseMediaDirs("~/Desktop/ost:~", { home: "/home/u" })).toEqual([
      "/home/u/Desktop/ost",
      "/home/u",
    ]);
  });

  it("normalizes '..' and a trailing slash away", () => {
    expect(parseMediaDirs("/media/a/../ost/", { home: "/home/u" })).toEqual(["/media/ost"]);
  });

  it("drops relative entries — an allowlist must be absolute", () => {
    expect(parseMediaDirs("ost:./ost:/media/ost", { home: "/home/u" })).toEqual(["/media/ost"]);
  });

  it("is empty when unset", () => {
    expect(parseMediaDirs(undefined, { home: "/home/u" })).toEqual([]);
    expect(parseMediaDirs("  ", { home: "/home/u" })).toEqual([]);
  });
});

describe("resolveInsideDirs", () => {
  const roots = ["/media/ost", "/media/clips"];

  it("accepts the root itself and anything under it", () => {
    expect(resolveInsideDirs("/media/ost", roots)).toBe("/media/ost");
    expect(resolveInsideDirs("/media/ost/key/nagisa.mp3", roots)).toBe(
      "/media/ost/key/nagisa.mp3",
    );
    expect(resolveInsideDirs("/media/clips/a.mp4", roots)).toBe("/media/clips/a.mp4");
  });

  it("normalizes before checking, so '..' cannot climb out", () => {
    expect(resolveInsideDirs("/media/ost/../ost/hope.mp3", roots)).toBe("/media/ost/hope.mp3");
    expect(resolveInsideDirs("/media/ost/../../etc/passwd", roots)).toBeNull();
  });

  it("rejects a sibling whose name merely starts like the root", () => {
    expect(resolveInsideDirs("/media/ost-evil/x.mp3", roots)).toBeNull();
  });

  it("rejects anything outside and any relative path", () => {
    expect(resolveInsideDirs("/etc/passwd", roots)).toBeNull();
    expect(resolveInsideDirs("ost/hope.mp3", roots)).toBeNull();
  });

  it("rejects everything when the allowlist is empty", () => {
    expect(resolveInsideDirs("/media/ost/hope.mp3", [])).toBeNull();
  });
});

describe("localMediaKind", () => {
  it("maps known extensions case-insensitively", () => {
    expect(localMediaKind("01. Nagisa.MP3")).toBe("audio");
    expect(localMediaKind("/a/b/clip.mp4")).toBe("video");
    expect(localMediaKind("nagisa.webp")).toBe("image");
  });

  it("returns null for anything else", () => {
    expect(localMediaKind("notes.txt")).toBeNull();
    expect(localMediaKind("archive.zip")).toBeNull();
    expect(localMediaKind("noext")).toBeNull();
  });

  it("skips dotfiles and macOS junk", () => {
    expect(localMediaKind(".hidden.mp3")).toBeNull();
    expect(localMediaKind("__MACOSX/track.mp3")).toBeNull();
  });
});
