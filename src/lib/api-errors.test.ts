import { describe, it, expect, vi, afterEach } from "vitest";
import { serverError } from "./api-errors";

afterEach(() => vi.restoreAllMocks());

describe("serverError", () => {
  it("explains a stale Prisma client instead of failing silently", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const err = Object.assign(new Error("Unknown argument `introEnabled`."), {
      name: "PrismaClientValidationError",
    });
    const res = serverError(err);
    expect(res.status).toBe(500);
    const body = (await res.json()) as { error: string };
    expect(body.error).toContain("introEnabled");
    expect(body.error).toContain("prisma generate");
  });

  it("falls back to a generic message and logs the unknown error", async () => {
    const logged = vi.spyOn(console, "error").mockImplementation(() => {});
    const err = new Error("boom");
    const res = serverError(err);
    expect(res.status).toBe(500);
    expect((await res.json()) as { error: string }).toEqual({
      error: "Внутренняя ошибка сервера",
    });
    expect(logged).toHaveBeenCalledWith(err);
  });
});
