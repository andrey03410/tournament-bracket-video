import { NextResponse } from "next/server";
import { z } from "zod";
import { userOr401, badRequest, notFound } from "@/lib/api";
import { prisma } from "@/lib/db";
import {
  getProjectRenderConfig,
  buildPreviewPlan,
  resolveActiveSnippetsFor,
} from "@/server/render";
import { serializeConfig } from "@/server/render-config-dto";

export async function GET(_req: Request, { params }: { params: { id: string } }) {
  const auth = await userOr401();
  if ("response" in auth) return auth.response;

  let config = await getProjectRenderConfig(auth.userId, params.id);
  if (!config) return notFound();
  await resolveActiveSnippetsFor(config);
  config = await getProjectRenderConfig(auth.userId, params.id);
  if (!config) return notFound();
  return NextResponse.json({
    config: serializeConfig(config),
    previewPlan: buildPreviewPlan(config),
  });
}

const patchSchema = z.object({
  order: z.enum(["desc", "asc"]).optional(),
  template: z.string().optional(),
  defaultClipSec: z.number().positive().max(600).optional(),
  introEnabled: z.boolean().optional(),
  introText: z.string().nullable().optional(),
  outroEnabled: z.boolean().optional(),
  outroText: z.string().nullable().optional(),
});

export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  const auth = await userOr401();
  if ("response" in auth) return auth.response;

  const config = await getProjectRenderConfig(auth.userId, params.id);
  if (!config) return notFound();

  const parsed = patchSchema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return badRequest("Некорректные настройки");

  await prisma.renderConfig.update({ where: { id: config.id }, data: parsed.data });
  const updated = await getProjectRenderConfig(auth.userId, params.id);
  return NextResponse.json({ config: updated ? serializeConfig(updated) : null });
}
