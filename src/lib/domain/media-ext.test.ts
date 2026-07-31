import { describe, it, expect } from "vitest";
import { extOf, baseOf, isJunkName } from "./media-ext";

// extOf/baseOf exist because the URL and clipboard policies run in the browser
// too, where node:path is not available.

describe("extOf", () => {
  it("returns the lowercased extension with its dot", () => {
    expect(extOf("poster.JPG")).toBe(".jpg");
    expect(extOf("/a/b/POSTER.JPEG")).toBe(".jpeg");
    expect(extOf("clip.tar.gz")).toBe(".gz");
  });

  it("is empty when there is no extension to speak of", () => {
    expect(extOf("poster")).toBe("");
    expect(extOf("/a/b/poster")).toBe("");
    expect(extOf(".hidden")).toBe(""); // a dotfile has no extension
    expect(extOf("")).toBe("");
    expect(extOf("/a.b/poster")).toBe("");
  });
});

describe("baseOf", () => {
  it("drops the directory and the extension", () => {
    expect(baseOf("/a/b/nagisa.jpg")).toBe("nagisa");
    expect(baseOf("image.png")).toBe("image");
    expect(baseOf("poster")).toBe("poster");
    expect(baseOf("/a/b/")).toBe("");
    expect(baseOf(".hidden")).toBe(".hidden");
  });
});

describe("isJunkName", () => {
  it("still rejects resource forks and dotfiles", () => {
    expect(isJunkName("__MACOSX/track.mp3")).toBe(true);
    expect(isJunkName("folder/.DS_Store")).toBe(true);
    expect(isJunkName("folder/track.mp3")).toBe(false);
  });
});
