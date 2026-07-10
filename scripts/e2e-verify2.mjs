// Verifies: provisional standings (5), manual reorder (3), delete (2).
import { readFile } from "node:fs/promises";

const BASE = process.env.BASE ?? "http://localhost:3000";
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
async function makeTournament(scheme) {
  const form = new FormData();
  form.append("title", `T-${scheme}`); form.append("scheme", scheme);
  form.append("file", new Blob([buf]), "ost.zip");
  return (await (await jf("/api/tournaments", { method: "POST", body: form })).json()).id;
}

console.log("BUG 5 — provisional standings");
const rr = await makeTournament("round_robin");
let first = await (await jf(`/api/tournaments/${rr}/next`)).json();
assert(Array.isArray(first.standings) && first.standings.length === 4, "round_robin exposes standings (4 entries)");
// merge has none
const mg = await makeTournament("merge");
const mgNext = await (await jf(`/api/tournaments/${mg}/next`)).json();
assert(mgNext.standings === null, "merge has null standings (no interim ranking)");

console.log("BUG 3 — manual reorder");
// finish the round_robin tournament
while (true) {
  const n = await (await jf(`/api/tournaments/${rr}/next`)).json();
  if (n.isComplete) break;
  await jf(`/api/tournaments/${rr}/compare`, { method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ a: n.pair.a.id, b: n.pair.b.id, result: "a" }) });
}
await jf(`/api/tournaments/${rr}/finalize`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ topSize: 4 }) });
const cfg1 = (await (await jf(`/api/tournaments/${rr}/render/config`)).json()).config;
const order1 = cfg1.items.map((i) => i.trackId);
const reversed = [...order1].reverse();
const rRes = await jf(`/api/tournaments/${rr}/reorder`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ order: reversed }) });
assert(rRes.status === 200, "reorder accepted");
const cfg2 = (await (await jf(`/api/tournaments/${rr}/render/config`)).json()).config;
const order2 = cfg2.items.map((i) => i.trackId);
assert(JSON.stringify(order2) === JSON.stringify(reversed), "render config items follow the new manual order");

console.log("BUG 2 — delete tournament");
const before = (await (await jf("/api/tournaments")).json()).tournaments.length;
const dRes = await jf(`/api/tournaments/${mg}`, { method: "DELETE" });
assert(dRes.status === 200, "delete accepted");
const after = (await (await jf("/api/tournaments")).json()).tournaments.length;
assert(after === before - 1, `tournament removed from list (${before} -> ${after})`);

console.log("\nVERIFY2 OK ✅");
