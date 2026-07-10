import { describe, expect, it } from "vitest";
import {
  ASSIGNABLE_ROLES,
  can,
  canCreateTournament,
  fitsPoolQuota,
  formatBytes,
  isAssignableRole,
  quotasFor,
  roleLabel,
} from "./permissions";

const MB = 1024 * 1024;

describe("permissions matrix", () => {
  it("guest has no permissions at all", () => {
    for (const p of ["tournament:create", "render:run", "media:upload", "admin:users"] as const) {
      expect(can("guest", p)).toBe(false);
      expect(can(null, p)).toBe(false);
      expect(can(undefined, p)).toBe(false);
    }
  });

  it("user can create tournaments and upload media, but not render or administer", () => {
    expect(can("user", "tournament:create")).toBe(true);
    expect(can("user", "media:upload")).toBe(true);
    expect(can("user", "render:run")).toBe(false);
    expect(can("user", "admin:users")).toBe(false);
  });

  it("admin can do everything", () => {
    expect(can("admin", "tournament:create")).toBe(true);
    expect(can("admin", "media:upload")).toBe(true);
    expect(can("admin", "render:run")).toBe(true);
    expect(can("admin", "admin:users")).toBe(true);
  });

  it("unknown role degrades to guest, not to a crash or full access", () => {
    expect(can("superuser", "render:run")).toBe(false);
    expect(quotasFor("superuser").maxTournaments).toBe(0);
  });

  it("guest is not assignable to accounts", () => {
    expect(isAssignableRole("guest")).toBe(false);
    expect(isAssignableRole("user")).toBe(true);
    expect(isAssignableRole("admin")).toBe(true);
    expect(ASSIGNABLE_ROLES).not.toContain("guest");
  });
});

describe("quotas", () => {
  it("user: 1 tournament, 100 MB archive, 100 MB pool", () => {
    const q = quotasFor("user");
    expect(q.maxTournaments).toBe(1);
    expect(q.maxArchiveBytes).toBe(100 * MB);
    expect(q.maxPoolBytes).toBe(100 * MB);
  });

  it("admin: unlimited tournaments and pool, 2 GB archive", () => {
    const q = quotasFor("admin");
    expect(q.maxTournaments).toBeNull();
    expect(q.maxPoolBytes).toBeNull();
    expect(q.maxArchiveBytes).toBe(2 * 1024 * MB);
  });

  it("canCreateTournament enforces the slot count", () => {
    expect(canCreateTournament("user", 0)).toBe(true);
    expect(canCreateTournament("user", 1)).toBe(false);
    expect(canCreateTournament("admin", 999)).toBe(true);
    expect(canCreateTournament("guest", 0)).toBe(false);
  });

  it("fitsPoolQuota checks the running total, boundary inclusive", () => {
    expect(fitsPoolQuota("user", 0, 100 * MB)).toBe(true); // exactly at the limit
    expect(fitsPoolQuota("user", 1, 100 * MB)).toBe(false);
    expect(fitsPoolQuota("user", 99 * MB, MB)).toBe(true);
    expect(fitsPoolQuota("admin", 10 * 1024 * MB, 10 * 1024 * MB)).toBe(true);
  });
});

describe("labels & formatting", () => {
  it("roleLabel maps known roles and falls back to the raw string", () => {
    expect(roleLabel("admin")).toBe("Администратор");
    expect(roleLabel("user")).toBe("Пользователь");
    expect(roleLabel(null)).toBe("Гость");
    expect(roleLabel("moderator")).toBe("moderator");
  });

  it("formatBytes picks a sensible unit", () => {
    expect(formatBytes(512)).toBe("512 Б");
    expect(formatBytes(10 * 1024)).toBe("10 КБ");
    expect(formatBytes(100 * MB)).toBe("100.0 МБ");
    expect(formatBytes(2 * 1024 * MB)).toBe("2.0 ГБ");
  });
});
