import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import { Prisma } from "@prisma/client";
import { missingClientFields } from "@/lib/domain/prisma-drift";

// Regression guard for the "opaque 500 after a schema change" trap: the DB and
// the code get the new columns, but the generated Prisma client does not, so
// every write with a new field dies with `Unknown argument`. Failing here means
// `npx prisma generate` was not run (and any running dev server needs a
// restart — it keeps the old client in memory).
describe("generated Prisma client", () => {
  it("knows every model and field of schema.prisma", () => {
    const schema = readFileSync(path.join(process.cwd(), "prisma", "schema.prisma"), "utf8");
    const models = Prisma.dmmf.datamodel.models.map((m) => ({
      name: m.name,
      fields: m.fields.map((f) => ({ name: f.name })),
    }));
    expect(missingClientFields(schema, models)).toEqual([]);
  });
});
