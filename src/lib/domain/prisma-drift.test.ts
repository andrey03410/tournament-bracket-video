import { describe, it, expect } from "vitest";
import {
  schemaModelFields,
  missingClientFields,
  staleClientHint,
} from "./prisma-drift";

const SCHEMA = `
generator client {
  provider = "prisma-client-js"
}

/// a comment line
model VideoProject {
  id           String   @id @default(cuid())
  title        String
  // added in phase 12
  introEnabled Boolean  @default(false)
  introText    String?
  rounds       PickerRound[]

  @@index([userId])
}

enum Ignored {
  A
  B
}

model PickerRound {
  id      String @id @default(cuid())
  project VideoProject @relation(fields: [projectId], references: [id])
}
`;

describe("schemaModelFields", () => {
  it("collects field names per model, skipping comments and block attributes", () => {
    const models = schemaModelFields(SCHEMA);
    expect([...models.keys()]).toEqual(["VideoProject", "PickerRound"]);
    expect(models.get("VideoProject")).toEqual([
      "id",
      "title",
      "introEnabled",
      "introText",
      "rounds",
    ]);
    expect(models.get("PickerRound")).toEqual(["id", "project"]);
  });
});

describe("missingClientFields", () => {
  const client = [
    { name: "VideoProject", fields: [{ name: "id" }, { name: "title" }, { name: "rounds" }] },
    { name: "PickerRound", fields: [{ name: "id" }, { name: "project" }] },
  ];

  it("lists schema fields the generated client does not know", () => {
    expect(missingClientFields(SCHEMA, client)).toEqual([
      { model: "VideoProject", field: "introEnabled" },
      { model: "VideoProject", field: "introText" },
    ]);
  });

  it("reports a whole missing model once", () => {
    expect(missingClientFields("model Later {\n  id String @id\n}\n", [])).toEqual([
      { model: "Later", field: "*" },
    ]);
  });

  it("is empty when the client matches the schema", () => {
    const fresh = [
      {
        name: "VideoProject",
        fields: [
          { name: "id" },
          { name: "title" },
          { name: "introEnabled" },
          { name: "introText" },
          { name: "rounds" },
        ],
      },
      { name: "PickerRound", fields: [{ name: "id" }, { name: "project" }] },
    ];
    expect(missingClientFields(SCHEMA, fresh)).toEqual([]);
  });
});

describe("staleClientHint", () => {
  const validationError = Object.assign(
    new Error(
      "\nInvalid `prisma.videoProject.update()` invocation:\n\n{\n  data: {\n" +
        "    introEnabled: true,\n    ~~~~~~~~~~~~\n?   title?: String\n  }\n}\n\n" +
        "Unknown argument `introEnabled`. Available options are marked with ?.",
    ),
    { name: "PrismaClientValidationError" },
  );

  it("names the unknown field and asks for generate + restart", () => {
    const hint = staleClientHint(validationError);
    expect(hint).toContain("introEnabled");
    expect(hint).toContain("prisma generate");
    expect(hint).toContain("перезапустите");
  });

  it("also catches the `Unknown field` wording of select/include errors", () => {
    const err = Object.assign(new Error("Unknown field `outroText` for select statement"), {
      name: "PrismaClientValidationError",
    });
    expect(staleClientHint(err)).toContain("outroText");
  });

  it("ignores unrelated errors", () => {
    expect(staleClientHint(new Error("NOT_FOUND"))).toBeNull();
    expect(staleClientHint(new Error("Unique constraint failed on the fields: (`email`)"))).toBeNull();
    expect(staleClientHint(undefined)).toBeNull();
  });
});
