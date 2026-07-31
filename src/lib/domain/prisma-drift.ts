// Schema drift of the *generated* Prisma client: a long-running process keeps
// the client it loaded at startup, so a `prisma db push && prisma generate`
// after a schema change leaves it not knowing the new columns. Every write with
// a new field then fails deep inside the client ("Unknown argument `x`") and
// surfaces as an opaque 500. Pure helpers here turn that into a readable
// message and let a test assert the on-disk client matches schema.prisma.

const MODEL_RE = /^model\s+(\w+)\s*\{/;

/** Field names declared per model in a schema.prisma text (relations included). */
export function schemaModelFields(schema: string): Map<string, string[]> {
  const models = new Map<string, string[]>();
  let current: string[] | null = null;
  for (const raw of schema.split("\n")) {
    const line = raw.trim();
    if (current) {
      if (line === "}") {
        current = null;
        continue;
      }
      // skip comments and block attributes (@@index, @@unique, ...)
      if (!line || line.startsWith("//") || line.startsWith("///") || line.startsWith("@@")) {
        continue;
      }
      const name = line.split(/\s+/)[0];
      if (name) current.push(name);
      continue;
    }
    const model = MODEL_RE.exec(line);
    if (model) {
      current = [];
      models.set(model[1], current);
    }
  }
  return models;
}

export interface ClientModel {
  name: string;
  fields: { name: string }[];
}

/**
 * Schema fields the generated client is missing. A model absent from the client
 * altogether is reported once as `{ model, field: "*" }`.
 */
export function missingClientFields(
  schema: string,
  clientModels: readonly ClientModel[],
): { model: string; field: string }[] {
  const byName = new Map(clientModels.map((m) => [m.name, new Set(m.fields.map((f) => f.name))]));
  const missing: { model: string; field: string }[] = [];
  for (const [model, fields] of schemaModelFields(schema)) {
    const known = byName.get(model);
    if (!known) {
      missing.push({ model, field: "*" });
      continue;
    }
    for (const field of fields) {
      if (!known.has(field)) missing.push({ model, field });
    }
  }
  return missing;
}

const UNKNOWN_RE = /Unknown (?:argument|arg|field) `([\w.]+)`/;

/**
 * Human explanation for a Prisma validation error caused by a stale client,
 * or null for any other error.
 */
export function staleClientHint(err: unknown): string | null {
  const msg = String((err as Error)?.message ?? "");
  const match = UNKNOWN_RE.exec(msg);
  if (!match) return null;
  return (
    `Prisma-клиент не знает поле «${match[1]}»: скорее всего запущенный процесс ` +
    "держит клиент, сгенерированный до изменения схемы. Выполните " +
    "`npx prisma db push && npx prisma generate` и перезапустите сервер " +
    "(в dev-режиме перезагрузка страницы не помогает)."
  );
}
