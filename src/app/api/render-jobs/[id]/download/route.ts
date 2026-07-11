import { readFile } from "node:fs/promises";
import { userOr401, notFound } from "@/lib/api";
import { prisma } from "@/lib/db";
import { absPath } from "@/lib/storage";

export async function GET(_req: Request, { params }: { params: { id: string } }) {
  const auth = await userOr401();
  if ("response" in auth) return auth.response;

  const job = await prisma.renderJob.findFirst({
    where: {
      id: params.id,
      OR: [{ tournament: { userId: auth.userId } }, { project: { userId: auth.userId } }],
    },
  });
  if (!job || !job.outputPath) return notFound();

  const data = await readFile(absPath(job.outputPath));
  return new Response(new Uint8Array(data), {
    headers: {
      "Content-Type": "video/mp4",
      "Content-Disposition": `attachment; filename="top-${job.tournamentId}.mp4"`,
    },
  });
}
