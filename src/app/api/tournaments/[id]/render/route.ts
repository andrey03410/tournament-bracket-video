import { NextResponse } from "next/server";
import { userOr401, permissionOr403, badRequest } from "@/lib/api";
import { listRenderJobs, startRenderJob } from "@/server/render";

export async function GET(_req: Request, { params }: { params: { id: string } }) {
  const auth = await userOr401();
  if ("response" in auth) return auth.response;

  const jobs = await listRenderJobs(auth.userId, { tournamentId: params.id });
  return NextResponse.json({ jobs });
}

export async function POST(_req: Request, { params }: { params: { id: string } }) {
  const auth = await permissionOr403(
    "render:run",
    "Рендер доступен только администратору",
  );
  if ("response" in auth) return auth.response;
  try {
    const jobId = await startRenderJob(auth.userId, params.id);
    return NextResponse.json({ jobId });
  } catch (e) {
    return badRequest(String((e as Error).message));
  }
}
