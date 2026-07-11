import { readFile } from "node:fs/promises";
import { userOr401, mediaResponse } from "@/lib/api";
import { absPath } from "@/lib/storage";
import { ensureTickAsset } from "@/server/picker-render";

/** The generated countdown tick sample (used by the picker preview). */
export async function GET(req: Request) {
  const auth = await userOr401();
  if ("response" in auth) return auth.response;
  const rel = await ensureTickAsset();
  const data = await readFile(absPath(rel));
  return mediaResponse(req, data, "audio/wav");
}
