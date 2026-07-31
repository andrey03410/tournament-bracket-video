import { describe, it, expect } from "vitest";
import { pickPastedImageUrl, pasteLabel, isGenericPasteName } from "./clipboard";

describe("pickPastedImageUrl", () => {
  it("takes the first <img src> of pasted HTML", () => {
    const html = `<meta charset="utf-8"><div><img src="https://cdn.example.com/first?size=large" alt="a"><img src="https://cdn.example.com/second.jpg"></div>`;
    expect(pickPastedImageUrl({ html })).toBe("https://cdn.example.com/first?size=large");
  });

  it("reads single quotes and bare attribute values", () => {
    expect(pickPastedImageUrl({ html: `<img src='https://a.b/p.png'>` })).toBe("https://a.b/p.png");
    expect(pickPastedImageUrl({ html: `<img class=x src=https://a.b/p.png >` })).toBe(
      "https://a.b/p.png",
    );
  });

  it("prefers the HTML image over the text flavor of the same paste", () => {
    // browsers put both flavors in the clipboard; the <img> is the actual picture
    expect(
      pickPastedImageUrl({
        html: `<img src="https://cdn.example.com/pic">`,
        text: "https://example.com/page/with/gallery",
      }),
    ).toBe("https://cdn.example.com/pic");
  });

  it("skips HTML images the server could never fetch", () => {
    expect(pickPastedImageUrl({ html: `<img src="data:image/png;base64,AAAA">` })).toBeNull();
    expect(pickPastedImageUrl({ html: `<img src="/relative/p.png">` })).toBeNull();
  });

  it("accepts a plain-text URL only when it looks like an image", () => {
    expect(pickPastedImageUrl({ text: " https://cdn.example.com/poster.jpg " })).toBe(
      "https://cdn.example.com/poster.jpg",
    );
    // a video link must go to the download field, not into a silent image import
    expect(pickPastedImageUrl({ text: "https://www.youtube.com/watch?v=abc" })).toBeNull();
    expect(pickPastedImageUrl({ text: "поздравляю с фазой 17" })).toBeNull();
  });

  it("ignores text with more than one token", () => {
    expect(pickPastedImageUrl({ text: "смотри https://cdn.example.com/poster.jpg" })).toBeNull();
  });

  it("is null for an empty clipboard", () => {
    expect(pickPastedImageUrl({})).toBeNull();
    expect(pickPastedImageUrl({ text: "", html: "" })).toBeNull();
  });
});

describe("pasteLabel", () => {
  it("names a paste by the day and minute it arrived", () => {
    expect(pasteLabel(new Date(2026, 6, 31, 18, 20))).toBe("Вставка 31.07 18:20");
    expect(pasteLabel(new Date(2026, 0, 5, 9, 5))).toBe("Вставка 05.01 09:05");
  });
});

describe("isGenericPasteName", () => {
  it("recognizes the placeholder names clipboards hand out", () => {
    for (const name of ["", "  ", "image.png", "IMAGE.PNG", "image", "unknown", "clipboard.png"]) {
      expect(isGenericPasteName(name), name).toBe(true);
    }
  });

  it("keeps a real file name", () => {
    for (const name of ["nagisa.jpg", "Клэннад кадр.png", "poster-2.webp"]) {
      expect(isGenericPasteName(name), name).toBe(false);
    }
  });
});
