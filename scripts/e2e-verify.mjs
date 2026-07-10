// Verifies bug fixes: Range/seek (1), active-snippet resolved start (5), full mode (4).
import { readFile } from "node:fs/promises";

const BASE = process.env.BASE ?? "http://localhost:3300";
const EMAIL = "e2e@test.local";
const PASSWORD = "password123";
const jar = new Map();
const cookieHeader = () => [...jar.entries()].map(([k, v]) => `${k}=${v}`).join("; ");
function store(res) {
  for (const c of res.headers.getSetCookie?.() ?? []) {
    const [p] = c.split(";"); const i = p.indexOf("="); jar.set(p.slice(0, i), p.slice(i + 1));
  }
}
async function jf(url, opts = {}) {
  const res = await fetch(BASE + url, { ...opts, headers: { ...(opts.headers ?? {}), Cookie: cookieHeader() }, redirect: "manual" });
  store(res); return res;
}
function assert(c, m) { if (!c) throw new Error("FAIL: " + m); console.log("  ✓ " + m); }

const { csrfToken } = await (await jf("/api/auth/csrf")).json();
await jf("/api/auth/callback/credentials", {
  method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" },
  body: new URLSearchParams({ csrfToken, email: EMAIL, password: PASSWORD, callbackUrl: BASE }).toString(),
});

const buf = await readFile("/tmp/e2e/ost.zip");
const form = new FormData();
form.append("title", "Verify"); form.append("scheme", "merge");
form.append("file", new Blob([buf]), "ost.zip");
const id = (await (await jf("/api/tournaments", { method: "POST", body: form })).json()).id;

// run comparisons
while (true) {
  const next = await (await jf(`/api/tournaments/${id}/next`)).json();
  if (next.isComplete) break;
  await jf(`/api/tournaments/${id}/compare`, { method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ a: next.pair.a.id, b: next.pair.b.id, result: "a" }) });
}
await jf(`/api/tournaments/${id}/finalize`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ topSize: 3 }) });

console.log("BUG 5 — active snippet resolved start");
const cfg = (await (await jf(`/api/tournaments/${id}/render/config`)).json()).config;
const it0 = cfg.items[0];
assert(it0.clipMode === "active_snippet", "default mode is active_snippet");
assert(it0.resolvedStartSec !== undefined && it0.resolvedStartSec !== null, `resolvedStartSec computed (${it0.resolvedStartSec}s)`);
assert(it0.durationSec != null, `track duration resolved (${it0.durationSec}s)`);

console.log("BUG 1 — Range request on track audio (seek)");
const full = await jf(it0.audioUrl);
assert(full.headers.get("accept-ranges") === "bytes", "full response advertises Accept-Ranges: bytes");
const ranged = await jf(it0.audioUrl, { headers: { Range: "bytes=100-199" } });
assert(ranged.status === 206, "range request returns 206 Partial Content");
assert(/^bytes 100-199\//.test(ranged.headers.get("content-range") ?? ""), "Content-Range header correct");

console.log("BUG 4 — full-track mode");
await jf(`/api/render-items/${it0.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ clipMode: "full" }) });
const cfg2 = (await (await jf(`/api/tournaments/${id}/render/config`)).json());
const itFull = cfg2.config.items.find((x) => x.id === it0.id);
assert(itFull.clipMode === "full", "item switched to full mode");
const seg = cfg2.previewPlan.segments.find((s) => s.trackId === itFull.trackId);
assert(Math.abs(seg.clipSec - itFull.durationSec) < 0.6, `full segment uses full duration (${seg.clipSec}s ≈ ${itFull.durationSec}s)`);

console.log("\nVERIFY OK ✅");
